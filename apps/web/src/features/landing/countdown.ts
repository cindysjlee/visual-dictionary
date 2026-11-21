/** 잔액이 줄어드는 숫자: 경과 시간(ms)에서 표시할 값. 시작 전·시계가 뒤로 가도 from, 끝나면 to(넘지 않는다). 감속 곡선(cubic ease-out) */
export function balanceAt(from: number, to: number, elapsedMs: number, durationMs: number): number {
  const t = Math.min(1, Math.max(0, elapsedMs / durationMs));
  return Math.round(from + (to - from) * (1 - (1 - t) ** 3));
}
