// 설명 틀(docs/04 "설명 틀"): 한 줄 정의 → 쉬운 비유 → 어떻게 일어나나 → 왜 위험한가(CS 용어는 왜 중요한가).
// 순서·이름·문장 세기 같은 규칙을 한 곳에 둔다. 검증기(스키마·scripts)와 화면이 같이 쓴다. zod 없음
import type { Explanation } from "./index.ts";
import { noteWords, plainText } from "./marks.ts";

export const EXPLAIN_PARTS = ["definition", "analogy", "how", "why"] as const;
export type ExplainPart = (typeof EXPLAIN_PARTS)[number];

/** 아직 설명을 쓰지 않은 초안(draft)의 자리 표시. 공개(published)하는 용어에는 쓸 수 없다 */
export const DRAFT_DESCRIPTION = "(설명 준비 중)";

/** 한 줄 정의의 최대 글자 수(표시를 뺀 글자 기준) */
export const DEFINITION_MAX = 90;
/** 이보다 긴 문장은 경고(짧은 문장이 설명 틀의 규칙이다). 오류는 아니다 */
export const SENTENCE_WARN = 70;
/** 용어 하나의 각주 수 상한 */
export const NOTES_MAX = 4;

/**
 * 부분 이름. why는 위험을 막는 방어가 있는 보안 용어면 "왜 위험한가", 아니면(CS 용어 등) "왜 중요한가".
 * 보안 용어 = 웹 보안 분야이거나 방어(kind: defense)가 있는 용어
 */
export function partLabel(part: ExplainPart, term: { category: string; defenses: readonly { kind: string }[] }): string {
  if (part === "definition") return "한 줄 정의";
  if (part === "analogy") return "쉬운 비유";
  if (part === "how") return "어떻게 일어나나";
  const security = term.category === "web-security" || term.defenses.some((d) => d.kind === "defense");
  return security ? "왜 위험한가" : "왜 중요한가";
}

/** 설명의 문단을 화면 순서대로: 정의 → 비유 → 과정 → 이유 */
export function explanationParagraphs(e: Explanation): { part: ExplainPart; index: number; text: string }[] {
  return [
    { part: "definition", index: 0, text: e.definition },
    ...e.analogy.map((text, index) => ({ part: "analogy" as const, index, text })),
    ...e.how.map((text, index) => ({ part: "how" as const, index, text })),
    ...e.why.map((text, index) => ({ part: "why" as const, index, text })),
  ];
}

/** 설명 전체의 각주 단어(나온 순서, 같은 단어도 나온 만큼). 이전 형식(문단 하나)의 설명에는 각주가 없다 */
export const explanationNoteWords = (description: string | Explanation): string[] =>
  typeof description === "string" ? [] : explanationParagraphs(description).flatMap((p) => noteWords(p.text));

/** 문장 나누기: 마침표·물음표·느낌표 뒤에 공백이 오거나 글이 끝날 때. 주소(169.254.169.254)·소수점은 나뉘지 않는다 */
export const sentencesOf = (text: string): string[] =>
  plainText(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
