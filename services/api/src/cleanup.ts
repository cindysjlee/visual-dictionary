// 탈퇴 정리(큐 소비자). Cognito 사용자가 정말 지워졌을 때만 그 사용자의 학습 기록과 최근 본 용어를 모두 지운다.
// 아직 남아 있으면(탈퇴의 Cognito 삭제가 늦거나 실패) 던져서 큐가 다시 보내게 한다 → 계속 실패하면 DLQ(기록은 보존)
// 탈퇴 표시는 지우지 않는다: TTL(2시간)까지 남아 예전 토큰의 저장을 계속 막는다
import { z } from "zod";
import type { CleanupJob } from "./account.ts";

export interface CleanupDeps {
  cognitoUserExists(username: string): Promise<boolean>;
  /** 학습 기록을 모두 지우고 지운 개수를 돌려준다(탈퇴 표시 제외) */
  deleteRecords(userId: string): Promise<number>;
  /** 최근 본 용어를 모두 지운다(7단계, 같은 큐·같은 함수에서) */
  deleteActivity(userId: string): Promise<number>;
}

const job = z.strictObject({ userId: z.string().min(1).max(128), username: z.string().min(1).max(128) });

export class UserStillExistsError extends Error {
  name = "UserStillExistsError";
}

/** 메시지 하나 처리. 형식이 틀린 메시지는 다시 보내도 소용없으므로 버린다("skipped") */
export async function cleanup(rawBody: string, deps: CleanupDeps): Promise<"done" | "skipped"> {
  let parsed: CleanupJob;
  try {
    parsed = job.parse(JSON.parse(rawBody));
  } catch {
    return "skipped";
  }
  if (await deps.cognitoUserExists(parsed.username)) throw new UserStillExistsError();
  await deps.deleteRecords(parsed.userId);
  await deps.deleteActivity(parsed.userId);
  return "done";
}
