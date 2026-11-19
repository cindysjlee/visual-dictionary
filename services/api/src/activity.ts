// 최근 본 용어 API 처리(FR-PRG-06, 7단계). 사용자는 토큰의 sub로만 정한다(NFR-01). 본 시각은 서버 시계로 정하고 본문은 받지 않는다.
// 기록은 30일 뒤 TTL로 사라진다. 탈퇴 표시가 있으면 기록하지 않는다(403)
import { TERM_ID, type ApiResult } from "./progress.ts";

export type ViewRecord = { termId: string; viewedAt: string };

export interface ActivityRepo {
  list(userId: string): Promise<{ views: ViewRecord[]; withdrawn: boolean }>;
  /** 탈퇴 표시(LearningRecord "#deleted")가 없을 때만 기록. 있으면 "withdrawn" */
  put(userId: string, view: ViewRecord): Promise<"saved" | "withdrawn">;
}

/** 최근 본 용어는 최신순 이만큼만 돌려준다(홈 3개·내 학습 10개) */
export const RECENT_LIMIT = 10;
/** 보존 기간(TTL) */
export const VIEW_TTL_DAYS = 30;

export async function getActivity(userId: string, repo: ActivityRepo): Promise<ApiResult> {
  const { views, withdrawn } = await repo.list(userId);
  if (withdrawn) return { status: 403, body: { error: "withdrawn" } };
  const recent = [...views].sort((a, b) => b.viewedAt.localeCompare(a.viewedAt)).slice(0, RECENT_LIMIT);
  return { status: 200, body: { recent } };
}

export async function putActivity(
  userId: string,
  termId: string | undefined,
  rawBody: string | undefined,
  allowedTermIds: ReadonlySet<string>,
  repo: ActivityRepo,
  now = new Date(),
): Promise<ApiResult> {
  if (!termId || termId.length > 64 || !TERM_ID.test(termId) || !allowedTermIds.has(termId)) return { status: 404, body: { error: "unknown-term" } };
  if (rawBody) return { status: 400, body: { error: "body-not-allowed" } }; // 본 시각은 서버가 정한다
  const view: ViewRecord = { termId, viewedAt: now.toISOString() };
  if ((await repo.put(userId, view)) === "withdrawn") return { status: 403, body: { error: "withdrawn" } };
  return { status: 200, body: { view } };
}
