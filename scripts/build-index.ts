// 검증을 통과한 용어로 /content/index.json, /content/terms/<id>.json, /content/figures/<id>.svg를 만든다 (FR-CNT-03, 04)
// 사용: node scripts/build-index.ts [--include-drafts]  (--include-drafts는 개발 서버 전용)
// 출력: generated/build (published만, vite build의 publicDir) / generated/dev (draft 포함, 개발 서버의 publicDir)
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BuiltTerm, Footnote, GlossaryEntry, IndexEntry, Term } from "@app/content-schema";
import { explanationNoteWords } from "@app/content-schema/explain";
import { defenseCounts } from "@app/content-schema/scene";
import { subsetHandFont } from "./subset-hand-font.ts";
import { FIGURES_DIR, loadGlossary, loadPaths, validateOrExit } from "./validate-content.ts";

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

/**
 * 설명의 각주를 풀이 사전에서 찾아 용어 파일에 넣는다(번호 = 나온 순서). 링크 용어(glossary의 term)는 이번에 함께 내보내는 용어일 때만 링크한다:
 * 공개 빌드에서는 published만, 개발 서버에서는 draft도 있으므로 "공개된 용어면 링크"가 그대로 된다
 */
export function withFootnotes(term: Term, glossary: GlossaryEntry[], shown: Pick<Term, "id" | "name">[]): BuiltTerm {
  const footnotes = explanationNoteWords(term.description).map((word): Footnote => {
    const entry = glossary.find((e) => e.word === word);
    if (!entry) throw new Error(`${term.id}: 각주 단어 "${word}"가 glossary.json에 없습니다(검증기가 먼저 막아야 합니다)`);
    const target = entry.term ? shown.find((t) => t.id === entry.term) : undefined;
    return { word, gloss: entry.gloss, ...(target ? { link: { id: target.id, name: target.name } } : {}) };
  });
  return { ...term, footnotes };
}

if (import.meta.main) {
  const includeDrafts = process.argv.includes("--include-drafts");
  const terms = selectTerms(validateOrExit(), includeDrafts);

  const dir = outDir(includeDrafts);
  // 매번 비우고 새로 만든다: 삭제·retired된 용어 파일이 남지 않게
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "terms"), { recursive: true });
  writeFileSync(join(dir, "index.json"), JSON.stringify(terms.map(toIndexEntry)));
  const { entries: glossary } = loadGlossary();
  for (const term of terms) writeFileSync(join(dir, "terms", `${term.id}.json`), JSON.stringify(withFootnotes(term, glossary, terms)));
  // 그림 SVG: 내보내는 용어가 쓰는 것만(draft 용어의 그림은 공개 빌드에 들어가지 않는다)
  mkdirSync(join(dir, "figures"), { recursive: true });
  for (const fig of terms.flatMap((t) => t.figures)) cpSync(join(FIGURES_DIR, `${fig.id}.svg`), join(dir, "figures", `${fig.id}.svg`));
  // 추천 학습 경로: 검증기가 단계가 모두 published임을 확인했다(draft가 섞이지 않는다)
  writeFileSync(join(dir, "paths.json"), JSON.stringify(loadPaths().paths));
  // publicDir이 generated/<모드>라서 정적 파일(robots.txt, 파비콘)도 여기로 복사한다
  cpSync(fileURLToPath(new URL("../apps/web/static/", import.meta.url)), join(dir, ".."), { recursive: true });

  console.log(`인덱스 생성: ${terms.length}개 용어${includeDrafts ? " (draft 포함, 개발용)" : ""}`);
  // 랜딩 그림 1의 손글씨 글꼴: 그림이 그리는 예시 용어(LandingPage.tsx pickDemo와 같은 규칙)의 글자만 남긴다
  const demo = terms.find((t) => t.id === "csrf") ?? terms.find((t) => t.defenses.some((d) => d.blockedAtStep !== undefined)) ?? terms[0];
  const font = await subsetHandFont(demo ? [demo] : []);
  console.log(`손글씨 글꼴: 글자 ${font.chars}개, 조각 ${font.files}개, ${Math.round(font.before / 1024)}KB → ${Math.round(font.after / 1024)}KB`);
}
