// 검증을 통과한 용어로 /content/index.json과 /content/terms/<id>.json을 만든다 (FR-CNT-03, 04)
// 사용: node scripts/build-index.ts [--include-drafts]  (--include-drafts는 개발 서버 전용)
// 출력: generated/build (published만, vite build의 publicDir) / generated/dev (draft 포함, 개발 서버의 publicDir)
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IndexEntry, Term } from "@app/content-schema";
import { defenseCounts } from "@app/content-schema/scene";
import { subsetHandFont } from "./subset-hand-font.ts";
import { validateOrExit } from "./validate-content.ts";

const outDir = (includeDrafts: boolean) =>
  fileURLToPath(new URL(`../apps/web/generated/${includeDrafts ? "dev" : "build"}/content/`, import.meta.url));

/** published만, 개발 서버에서는 draft도. retired는 항상 제외 */
export const selectTerms = (terms: Term[], includeDrafts: boolean) =>
  terms.filter((t) => t.status === "published" || (includeDrafts && t.status === "draft"));

export const toIndexEntry = ({ id, name, englishName, aliases, category, summary, related, scenario, defenses }: Term): IndexEntry => ({
  ...defenseCounts({ defenses }),
  id,
  name,
  englishName,
  aliases,
  category,
  summary,
  related, // 랜딩 색인의 "→ 참조"
  playerType: scenario.playerType,
  stepCount: scenario.steps.length,
  dangerFrom: scenario.steps.findIndex((s) => s.danger) + 1 || null,
  blockedAt: [...new Set(defenses.flatMap((d) => (d.blockedAtStep === undefined ? [] : [d.blockedAtStep])))].sort((a, b) => a - b),
});

if (import.meta.main) {
  const includeDrafts = process.argv.includes("--include-drafts");
  const terms = selectTerms(validateOrExit(), includeDrafts);

  const dir = outDir(includeDrafts);
  // 매번 비우고 새로 만든다: 삭제·retired된 용어 파일이 남지 않게
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "terms"), { recursive: true });
  writeFileSync(join(dir, "index.json"), JSON.stringify(terms.map(toIndexEntry)));
  for (const term of terms) writeFileSync(join(dir, "terms", `${term.id}.json`), JSON.stringify(term));
  // publicDir이 generated/<모드>라서 정적 파일(robots.txt)도 여기로 복사한다
  copyFileSync(fileURLToPath(new URL("../apps/web/static/robots.txt", import.meta.url)), join(dir, "..", "robots.txt"));

  console.log(`인덱스 생성: ${terms.length}개 용어${includeDrafts ? " (draft 포함, 개발용)" : ""}`);
  // 랜딩 그림 1의 손글씨 글꼴: 그림이 그리는 예시 용어(LandingPage.tsx pickDemo와 같은 규칙)의 글자만 남긴다
  const demo = terms.find((t) => t.id === "csrf") ?? terms.find((t) => t.defenses.some((d) => d.blockedAtStep !== undefined)) ?? terms[0];
  const font = await subsetHandFont(demo ? [demo] : []);
  console.log(`손글씨 글꼴: 글자 ${font.chars}개, 조각 ${font.files}개, ${Math.round(font.before / 1024)}KB → ${Math.round(font.after / 1024)}KB`);
}
