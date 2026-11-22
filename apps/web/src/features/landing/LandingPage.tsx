// 랜딩(/, /about): "보안·CS 개념을 3D 시각화로 정리한 용어 사전"을 알리고 가입으로 잇는다.
// 시안 3개를 ?hero=a|b|c로 비교(하나로 정하면 나머지는 지운다): A 사전 지면, B 학습 노선도, C 극장(실제 3D 플레이어).
// 숫자·용어·분야는 /content/index.json, 예시 장면은 /content/terms/csrf.json에서 읽는다(하드코딩·지어낸 수치 금지)
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import type { Category, IndexEntry, Term } from "@app/content-schema";
import { CATEGORY_LABELS } from "@app/content-schema/labels";
import { useJson } from "../../useJson.ts";
import LandingA from "./LandingA.tsx";
import LandingB from "./LandingB.tsx";
import LandingC from "./LandingC.tsx";

export type LandingData = {
  index: IndexEntry[];
  /** 분야별 용어(분야 순서는 CATEGORY_LABELS, 용어가 없는 분야는 뺀다) */
  groups: (readonly [Category, IndexEntry[]])[];
  /** 공격/방어 비교 예시 용어(CSRF가 있으면 CSRF) */
  demo: Term | null;
};

export const groupByCategory = (index: IndexEntry[]) =>
  (Object.keys(CATEGORY_LABELS) as Category[]).map((c) => [c, index.filter((t) => t.category === c)] as const).filter(([, list]) => list.length > 0);

/** 받침에 맞는 조사(은/는, 을/를). 한글이 아닌 끝 글자(CSRF·XSS 등 영문 약어)는 받침 없는 쪽으로 읽는다 */
export const josa = (word: string, withFinal: string, without: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 !== 0 ? withFinal : without);
};

/** 방어가 막는 단계가 있는 첫 흐름형 용어(없으면 첫 용어) */
export const pickDemo = (index: IndexEntry[]) => (index.find((t) => t.id === "csrf") ?? index.find((t) => t.blockedAt.length > 0) ?? index[0])?.id ?? null;

export default function LandingPage() {
  const [params] = useSearchParams();
  const hero = params.get("hero") === "b" ? "b" : params.get("hero") === "c" ? "c" : "a";
  const load = useJson<IndexEntry[]>("/content/index.json");
  const index = load.state === "ok" ? load.data : null;
  const demoId = index ? pickDemo(index) : null;
  const demo = useJson<Term>(demoId ? `/content/terms/${demoId}.json` : null);
  const failed = load.state === "error" || load.state === "notfound";
  const data: LandingData | null = index ? { index, groups: groupByCategory(index), demo: demo.state === "ok" ? demo.data : null } : null;

  // 시안마다 페이지 바탕·상단바 색이 다르다(tokens.css의 html[data-landing]). 랜딩을 떠나면 지운다
  useEffect(() => {
    document.documentElement.dataset.landing = hero;
    return () => {
      delete document.documentElement.dataset.landing;
    };
  }, [hero]);

  return hero === "b" ? <LandingB data={data} failed={failed} /> : hero === "c" ? <LandingC data={data} failed={failed} /> : <LandingA data={data} failed={failed} />;
}
