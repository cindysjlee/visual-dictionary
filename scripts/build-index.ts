// 검증을 통과한 용어로 /content/index.json과 /content/terms/<id>.json을 만든다 (FR-CNT-03, 04)
// 사용: node scripts/build-index.ts [--include-drafts]  (--include-drafts는 개발 서버 전용)
// 출력: generated/build (published만, vite build의 publicDir) / generated/dev (draft 포함, 개발 서버의 publicDir)
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IndexEntry, Term } from "@app/content-schema";
import { validateOrExit } from "./validate-content.ts";

const outDir = (includeDrafts: boolean) =>
  fileURLToPath(new URL(`../apps/web/generated/${includeDrafts ? "dev" : "build"}/content/`, import.meta.url));

/** published만, 개발 서버에서는 draft도. retired는 항상 제외 */
export const selectTerms = (terms: Term[], includeDrafts: boolean) =>
  terms.filter((t) => t.status === "published" || (includeDrafts && t.status === "draft"));

export const toIndexEntry = ({ id, name, englishName, aliases, category, summary, scenario }: Term): IndexEntry => ({
  id,
  name,
  englishName,
  aliases,
  category,
  summary,
  playerType: scenario.playerType,
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

  console.log(`인덱스 생성: ${terms.length}개 용어${includeDrafts ? " (draft 포함, 개발용)" : ""}`);
}
