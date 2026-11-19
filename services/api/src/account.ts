// 회원 탈퇴(FR-AUTH-06). 순서가 핵심이다(docs/03 탈퇴 실패 표):
// 1) 탈퇴 표시(TTL 2시간)를 먼저 써서 예전 토큰의 기록 저장을 막는다
// 2) 기록 삭제 작업을 큐에 넣는다. 실패하면 표시를 지우고(되돌림) 탈퇴 실패로 응답한다
// 3) 큐에 들어간 뒤에만 Cognito 사용자를 지운다. 실패하면 탈퇴 실패(계정이 남아 있으므로 정리 작업은 지우지 않고 재시도·DLQ로 간다)
import type { ApiResult } from "./progress.ts";

export interface WithdrawDeps {
  markWithdrawn(userId: string): Promise<void>;
  unmarkWithdrawn(userId: string): Promise<void>;
  enqueueCleanup(job: CleanupJob): Promise<void>;
  deleteCognitoUser(username: string): Promise<void>;
  log(event: string, error?: unknown): void;
}

export type CleanupJob = { userId: string; username: string };

export async function withdraw(userId: string, username: string, deps: WithdrawDeps): Promise<ApiResult> {
  try {
    await deps.markWithdrawn(userId);
  } catch (e) {
    deps.log("mark-failed", e);
    return { status: 500, body: { error: "withdraw-failed", stage: "mark" } };
  }
  try {
    await deps.enqueueCleanup({ userId, username });
  } catch (e) {
    deps.log("enqueue-failed", e);
    try {
      await deps.unmarkWithdrawn(userId);
    } catch (e2) {
      // 표시가 남아도 2시간 뒤 TTL로 사라진다. 그동안 기록 저장만 막히고 계정·기록은 그대로다
      deps.log("unmark-failed", e2);
    }
    return { status: 503, body: { error: "withdraw-failed", stage: "enqueue" } };
  }
  try {
    await deps.deleteCognitoUser(username);
  } catch (e) {
    deps.log("cognito-delete-failed", e);
    return { status: 500, body: { error: "withdraw-failed", stage: "cognito" } };
  }
  return { status: 204 };
}
