// 최근 본 용어 표시용(7단계): 본 시각을 "오늘·어제·n일 전"으로. 날짜 경계는 이용자의 현지 시간(브라우저)으로 센다
export function daysAgoLabel(viewedAt: string, now = new Date()): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(new Date(viewedAt))) / 86_400_000);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  return `${days}일 전`;
}

/** 목록(index)에 있는(published) 용어만 최신순으로 limit개 */
export function recentTerms<T extends { id: string }>(recent: { termId: string; viewedAt: string }[], index: T[], limit: number) {
  const byId = new Map(index.map((t) => [t.id, t]));
  return recent
    .flatMap((v) => {
      const term = byId.get(v.termId);
      return term ? [{ term, viewedAt: v.viewedAt }] : [];
    })
    .slice(0, limit);
}
