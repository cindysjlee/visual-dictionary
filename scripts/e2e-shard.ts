// CI의 E2E 분배(docs/03 2.6, CH-69): `node scripts/e2e-shard.ts <번호> <전체 수> [Playwright 인자...]`
// Playwright의 --shard는 테스트를 파일 순서대로 개수만큼 이어 자른다. 이 저장소는 용어마다 있는 무거운 테스트(player·scene-layout, 한 개에 수십 초)가
// 파일 안에 연달아 있어서 그대로 5등분하면 한두 shard가 20분, 나머지는 2분이 된다. 그래서 전체 테스트를 (파일 이름순, 파일 안은 정의 순서로) 한 줄로 세우고
// 번호 % 전체 수로 나눈다. 연달아 있는 무거운 테스트가 모든 shard에 고르게 퍼지고, 시간표를 따로 관리하지 않아도 된다.
// 고른 테스트는 --test-list 파일로 Playwright에 넘긴다. Node의 타입 지우기로 실행되므로 enum·namespace 같은 문법은 쓰지 않는다
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** 테스트 하나: 파일(testDir 기준)과 제목 경로(describe 제목들 + 테스트 제목) */
export type TestRef = { file: string; titles: string[] };

// Playwright json 리포터 출력에서 쓰는 부분만
type JsonSuite = { title: string; file?: string; specs?: { title: string }[]; suites?: JsonSuite[] };
export type JsonReport = { suites: JsonSuite[]; errors?: unknown[] };

/** json 리포터 결과를 한 줄로 편다: 파일 이름순, 파일 안은 (spec → 하위 describe) 순서. Playwright의 내부 정렬에 기대지 않는다 */
export function collectTests(report: JsonReport): TestRef[] {
  const out: TestRef[] = [];
  const walk = (suite: JsonSuite, file: string, path: string[]) => {
    for (const spec of suite.specs ?? []) out.push({ file, titles: [...path, spec.title] });
    for (const child of suite.suites ?? []) walk(child, file, [...path, child.title]);
  };
  const files = report.suites.filter((s) => s.file).sort((a, b) => (a.file! < b.file! ? -1 : a.file! > b.file! ? 1 : 0));
  for (const s of files) walk(s, s.file!, []);
  return out;
}

/** 번호 % 전체 수로 나눈 shard(1부터)의 몫. 모든 shard를 합치면 겹침 없이 전체가 된다 */
export function pickShard<T>(items: readonly T[], shard: number, total: number): T[] {
  return items.filter((_, i) => i % total === shard - 1);
}

const ARROW = "\u203A"; // ›: Playwright --test-list의 구분자. 제목에 들어 있으면 줄을 거꾸로 읽을 수 없다

/** --test-list 한 줄: `[프로젝트] › 파일 › describe › 제목`(제목은 앞부분 일치로 비교된다) */
export function testListLine(t: TestRef, project: string): string {
  return `[${project}] ${ARROW} ${[t.file, ...t.titles].join(` ${ARROW} `)}`;
}

/** 분배 전에 목록이 안전한지 본다: 제목에 구분자·줄바꿈이 있거나 같은 경로가 둘이면 특정 테스트를 골라낼 수 없다. 문제 목록을 돌려준다 */
export function listProblems(tests: readonly TestRef[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const t of tests) {
    const key = [t.file, ...t.titles].join("\u0000");
    if (t.titles.some((x) => x.includes(ARROW) || /[\r\n]/.test(x))) problems.push(`제목에 ${ARROW}나 줄바꿈이 있습니다: ${t.file} ${t.titles.join(" / ")}`);
    if (seen.has(key)) problems.push(`같은 제목이 둘입니다: ${t.file} ${t.titles.join(" / ")}`);
    seen.add(key);
  }
  return problems;
}

/** "번호 전체수" 인자를 읽는다. 올바르지 않으면 null */
export function parseShardArgs(a: string | undefined, b: string | undefined): { shard: number; total: number } | null {
  if (!/^\d+$/.test(a ?? "") || !/^\d+$/.test(b ?? "")) return null;
  const shard = Number(a);
  const total = Number(b);
  return total >= 1 && shard >= 1 && shard <= total ? { shard, total } : null;
}

function main(argv: string[]): number {
  const parsed = parseShardArgs(argv[0], argv[1]);
  if (!parsed) {
    console.error("사용법: node scripts/e2e-shard.ts <번호(1부터)> <전체 수> [Playwright 인자...]");
    return 2;
  }
  const { shard, total } = parsed;
  const passthrough = argv.slice(2);
  const project = "main"; // 실제 속도 테스트(realtime)는 GPU 없는 러너에서 돌리지 않는다(deploy.yml 주석)
  // 셸 없이 Playwright CLI를 Node로 직접 실행한다(scripts/e2e-drafts.ts와 같은 방식)
  const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
  const dir = mkdtempSync(join(tmpdir(), "e2e-shard-"));
  const jsonFile = join(dir, "list.json");

  // 목록 만들기 단계의 출력은 숨긴다(실행 로그에 "Total: 511 tests"가 섞여 shard 몫으로 읽히는 것을 막는다). 실패하면 그 출력을 보인다
  const listed = spawnSync(process.execPath, [cli, "test", "--list", `--project=${project}`, "--reporter=json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: jsonFile },
  });
  if (listed.status !== 0) {
    console.error(listed.stdout, listed.stderr);
    console.error("테스트 목록을 만들지 못했습니다(playwright test --list)");
    return listed.status ?? 1;
  }
  const report = JSON.parse(readFileSync(jsonFile, "utf8")) as JsonReport;
  if (report.errors && report.errors.length > 0) {
    console.error("테스트 목록에 오류가 있습니다:", JSON.stringify(report.errors).slice(0, 500));
    return 1;
  }
  const all = collectTests(report);
  const problems = listProblems(all);
  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    return 1;
  }
  const mine = pickShard(all, shard, total);
  if (mine.length === 0) {
    console.error(`shard ${shard}/${total}에 테스트가 없습니다(전체 ${all.length}개)`);
    return 1;
  }

  const perFile = new Map<string, number>();
  for (const t of mine) perFile.set(t.file, (perFile.get(t.file) ?? 0) + 1);
  const detail = [...perFile].map(([f, n]) => `${f.replace(".e2e.ts", "")}:${n}`).join(" ");
  const line = `E2E shard ${shard}/${total}: ${mine.length}개(전체 ${all.length}개) ${detail}`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${line}\n`);

  const listFile = join(dir, "test-list.txt");
  writeFileSync(listFile, mine.map((t) => testListLine(t, project)).join("\n") + "\n");
  const ran = spawnSync(process.execPath, [cli, "test", `--project=${project}`, "--test-list", listFile, ...passthrough], { stdio: "inherit", shell: false });
  return ran.status ?? 1;
}

// vitest가 가져다 쓸 때는 실행하지 않는다
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
