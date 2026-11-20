// 자동 배포 관문(.github/workflows/deploy.yml, docs/03 2.6). 멈출 때는 작업 요약(GITHUB_STEP_SUMMARY)에 이유를 남기고 종료 코드 1.
//   node scripts/ci-gate.ts security  → `cdk diff --security-only`(모든 스택)에 IAM·보안 그룹 변경 표가 있으면 멈춘다(권한 확장은 사람이 승인해 로컬에서 배포)
//   node scripts/ci-gate.ts changes   → 변경 세트(ci-gate)를 만들고(prepare-change-set) 리소스 삭제(Remove)·교체(Replacement True/Conditional)가 있으면 멈춘다.
//                                       예외(ci-gate-rules.ts): CDK 메타데이터는 무시, 파일 배포(Custom::CDKBucketDeployment)의 조건부 교체만 허용
//                                       없으면 변경이 있는 스택 목록을 GITHUB_OUTPUT stacks에 남긴다(배포 단계가 같은 변경 세트를 실행)
// 로컬에서도 돌릴 수 있다(프로필 vd). 출력·요약의 12자리 숫자(계정 ID)는 가린다
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isRisky, realChanges, type ResourceChange } from "./ci-gate-rules.ts";

const REGION = "ap-northeast-2";
const CHANGE_SET = "ci-gate";
const infraDir = fileURLToPath(new URL("../infra/", import.meta.url));
const profile = process.env.CI ? [] : ["--profile", process.env.AWS_PROFILE ?? "vd"];

const redact = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").replace(/\b\d{12}\b/g, "<계정>");
const summary = (md: string) => (process.env.GITHUB_STEP_SUMMARY ? appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`) : console.log(md));
const output = (line: string) => (process.env.GITHUB_OUTPUT ? appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`) : console.log(`[output] ${line}`));
const run = (cmd: string, args: string[], cwd?: string) => {
  // 셸을 거치지 않는다(인자를 배열 그대로 넘김, DEP0190 없음). aws·gh·git은 실행 파일이라 Windows에서도 셸이 필요 없다
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: false, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};
// npx는 Windows에서 .cmd라 셸 없이 못 띄운다: Node로 CDK CLI의 JS 진입점을 직접 실행한다(같은 CDK 버전)
const CDK_BIN = createRequire(import.meta.url).resolve("aws-cdk/bin/cdk");
const cdk = (...args: string[]) => run(process.execPath, [CDK_BIN, ...args, ...profile], infraDir);
const stop = (title: string, reason: string, detail: string) => {
  summary(`## 배포 멈춤: ${title}\n\n${reason}\n\n\`\`\`\n${redact(detail).slice(0, 30_000)}\n\`\`\``);
  console.error(`배포 멈춤: ${title}`);
  process.exit(1);
};

const mode = process.argv[2];

if (mode === "security") {
  const r = cdk("diff", "--security-only");
  if (r.status !== 0) stop("diff 실패", "`cdk diff --security-only`가 실패했습니다.", r.out);
  // --security-only는 권한을 넓히는 변경만 보여 준다. 표 제목이 하나라도 있으면 사람 승인 대상
  const found = ["IAM Statement Changes", "IAM Policy Changes", "Security Group Changes"].filter((h) => r.out.includes(h));
  if (found.length)
    stop(
      "보안 관련 변경",
      `권한·보안 그룹을 넓히는 변경(${found.join(", ")})이 있어 자동 배포하지 않았습니다. 로컬에서 \`cdk diff\`의 보안 변경을 확인하고 사용자 "승인"을 받은 뒤 배포합니다(CLAUDE.md 배포 승인 규칙).`,
      r.out,
    );
  summary("### 보안 관문: 권한·보안 그룹을 넓히는 변경 없음");
} else if (mode === "changes") {
  const stacks = cdk("list").out.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^VisualDictionary\w+$/.test(s));
  const prepared = cdk("deploy", "--all", "--method=prepare-change-set", "--change-set-name", CHANGE_SET);
  if (prepared.status !== 0) stop("변경 세트 만들기 실패", "`cdk deploy --method=prepare-change-set`가 실패했습니다.", prepared.out);

  type Change = { ResourceChange: ResourceChange };
  const risky: string[] = [];
  const changed: string[] = [];
  for (const stack of stacks) {
    const r = run("aws", ["cloudformation", "describe-change-set", "--stack-name", stack, "--change-set-name", CHANGE_SET, "--region", REGION, "--output", "json", ...profile]);
    if (r.status !== 0) {
      if (/ChangeSetNotFound|does not exist/.test(r.out)) continue; // 바뀐 것이 없어 만들지 않음
      stop("변경 세트 읽기 실패", `${stack}의 변경 세트를 읽지 못했습니다.`, r.out);
    }
    const cs = JSON.parse(r.out) as { Status: string; StatusReason?: string; Changes: Change[] };
    if (cs.Status === "FAILED" && /didn't contain changes|No updates/i.test(cs.StatusReason ?? "")) continue;
    if (cs.Status !== "CREATE_COMPLETE") stop("변경 세트 상태 이상", `${stack}: ${cs.Status} ${cs.StatusReason ?? ""}`, r.out);
    // 판단은 ci-gate-rules.ts(단위 테스트): 가상 리소스 제외, 파일 배포의 조건부 교체만 허용
    const real = realChanges(cs.Changes.map((c) => c.ResourceChange));
    if (!real.length) continue;
    changed.push(stack);
    for (const c of real) {
      if (isRisky(c)) {
        risky.push(`| ${stack} | ${c.LogicalResourceId} | ${c.ResourceType} | ${c.Action}${c.Replacement && c.Action === "Modify" ? ` (교체: ${c.Replacement})` : ""} |`);
      }
    }
  }
  if (risky.length)
    stop(
      "리소스 삭제·교체",
      `다음 리소스가 삭제되거나 교체됩니다. 테이블·사용자 풀처럼 데이터가 있는 리소스가 사라질 수 있어 자동 배포하지 않았습니다.\n\n| 스택 | 리소스 | 종류 | 변경 |\n| --- | --- | --- | --- |\n${risky.join("\n")}`,
      "",
    );
  summary(`### 변경 관문: 삭제·교체 없음. 배포할 스택: ${changed.join(", ") || "없음(바뀐 것 없음)"}`);
  output(`stacks=${changed.join(" ")}`);
} else {
  console.error("사용법: node scripts/ci-gate.ts security|changes");
  process.exit(2);
}
