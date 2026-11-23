// 책갈피(읽다 만 용어)를 고르는 단 한 곳: 색인·내 단어장·랜딩이 모두 이것을 쓴다(docs/05 "책갈피").
// 규칙: 최근 본 용어 중 완독이 아니고, 마지막 완독 표시·취소보다 나중에 다시 연 용어.
//   완독 → 책갈피 없음. 완독 취소 → 취소 시각이 마지막으로 본 시각보다 늦어 책갈피 없음(자동으로 되살리지 않음). 다시 열면 → 책갈피.
// 서버 데이터는 그대로다: 최근 본 시각(viewedAt)과 기록 저장 시각(updatedAt)을 비교할 뿐(둘 다 ISO 문자열이라 문자열 비교 = 시각 비교)
import type { ViewRecord } from "./api.ts";
import type { ProgressEntry } from "./store.ts";

/** 책갈피를 꽂을 용어 id, 최근 본 순서(맨 앞 = 읽다 만 쪽) */
export function bookmarkIds(records: Readonly<Record<string, ProgressEntry>>, recent: readonly ViewRecord[]): string[] {
  return recent
    .filter((v) => {
      const r = records[v.termId];
      return !r?.read && (!r?.at || v.viewedAt > r.at);
    })
    .map((v) => v.termId);
}
