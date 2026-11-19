// 학습 기록 API 처리(FR-PRG-01·02, FR-DEP-03). 사용자는 토큰의 sub로만 정한다(NFR-01): 경로·본문의 userId는 받지 않는다.
// 저장소는 인터페이스로 받아 단위 테스트한다(실제 구현은 dynamo.ts)
import { z } from "zod";

export type ProgressRecord = { termId: string; read: boolean; source: "completed" | "manual"; updatedAt: string };

export interface ProgressRepo {
  /** 기록 목록. 탈퇴 표시가 살아 있으면 withdrawn */
  list(userId: string): Promise<{ records: ProgressRecord[]; withdrawn: boolean }>;
  /** 탈퇴 표시가 없을 때만 저장(TransactWriteItems ConditionCheck). 표시가 있으면 "withdrawn" */
  put(userId: string, record: ProgressRecord): Promise<"saved" | "withdrawn">;
}

export type ApiResult = { status: number; body?: unknown };

/** 본문 크기 상한(바이트): {"read":false,"source":"completed"}는 40바이트 남짓 */
export const MAX_BODY_BYTES = 1024;
/** 용어 ID 형식(content-schema와 같음): 소문자·숫자·하이픈, 64자 이하. "#"으로 시작하는 내부 항목(탈퇴 표시)과 겹칠 수 없다 */
export const TERM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// strictObject: userId 같은 다른 필드를 섞어 보내면 거부한다(본문으로 대상 사용자를 바꿀 수 없음)
const putBody = z.strictObject({ read: z.boolean(), source: z.enum(["completed", "manual"]) });

export async function getProgress(userId: string, repo: ProgressRepo): Promise<ApiResult> {
  const { records, withdrawn } = await repo.list(userId);
  if (withdrawn) return { status: 403, body: { error: "withdrawn" } };
  return { status: 200, body: { records } };
}

export async function putProgress(
  userId: string,
  termId: string | undefined,
  rawBody: string | undefined,
  allowedTermIds: ReadonlySet<string>,
  repo: ProgressRepo,
  now = new Date(),
): Promise<ApiResult> {
  if (!termId || termId.length > 64 || !TERM_ID.test(termId) || !allowedTermIds.has(termId)) return { status: 404, body: { error: "unknown-term" } };
  if (!rawBody || Buffer.byteLength(rawBody) > MAX_BODY_BYTES) return { status: rawBody ? 413 : 400, body: { error: rawBody ? "body-too-large" : "empty-body" } };
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "invalid-json" } };
  }
  const parsed = putBody.safeParse(json);
  if (!parsed.success) return { status: 400, body: { error: "invalid-body" } };

  const record: ProgressRecord = { termId, ...parsed.data, updatedAt: now.toISOString() };
  if ((await repo.put(userId, record)) === "withdrawn") return { status: 403, body: { error: "withdrawn" } };
  return { status: 200, body: { record } };
}
