// 랜딩(/, /about): "보안·CS 개념을 3D 시각화로 정리한 용어 사전"을 알리고 가입으로 잇는다.
// 콘셉트는 "사전 지면"(DictionaryPage): 표제어 풀이 → 그림 1(공격/방어 단계) → 가나다 색인(完 도장 = 다 읽은 용어) → 책갈피(가입).
// 숫자·용어·분야는 /content/index.json, 예시 장면은 /content/terms/csrf.json에서 읽는다(하드코딩·지어낸 수치 금지)
import type { Category, IndexEntry, Term } from "@app/content-schema";
import { useJson } from "../../useJson.ts";
import { groupByCategory } from "../dictionary/Dictionary.tsx";
import DictionaryPage from "./DictionaryPage.tsx";

export type LandingData = {
  index: IndexEntry[];
  /** 분야별 용어(분야 순서는 CATEGORY_LABELS, 용어가 없는 분야는 뺀다) */
  groups: (readonly [Category, IndexEntry[]])[];
  /** 공격/방어 비교 예시 용어(CSRF가 있으면 CSRF) */
  demo: Term | null;
};


/** 받침에 맞는 조사(은/는, 을/를). 한글이 아닌 끝 글자(CSRF·XSS 등 영문 약어)는 받침 없는 쪽으로 읽는다 */
export const josa = (word: string, withFinal: string, without: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 !== 0 ? withFinal : without);
};

/** 방어가 막는 단계가 있는 첫 흐름형 용어(없으면 첫 용어) */
export const pickDemo = (index: IndexEntry[]) => (index.find((t) => t.id === "csrf") ?? index.find((t) => t.blockedAt.length > 0) ?? index[0])?.id ?? null;

export default function LandingPage() {
  const load = useJson<IndexEntry[]>("/content/index.json");
  const index = load.state === "ok" ? load.data : null;
  const demoId = index ? pickDemo(index) : null;
  const demo = useJson<Term>(demoId ? `/content/terms/${demoId}.json` : null);
  const failed = load.state === "error" || load.state === "notfound";
  const data: LandingData | null = index ? { index, groups: groupByCategory(index), demo: demo.state === "ok" ? demo.data : null } : null;


  return <DictionaryPage data={data} failed={failed} />;
}
