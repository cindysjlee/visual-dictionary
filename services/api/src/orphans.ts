// 고아 기록 정리(하루 한 번, EventBridge Scheduler → OrphanSweepFn). 사용자가 토큰으로 Cognito DeleteUser를 직접 부르면 우리 탈퇴 API를 거치지 않아
// 학습 기록·최근 본 용어가 남는다(Cognito에는 사용자 삭제 뒤 트리거가 없다). 기록에는 있는데 Cognito에는 없는 sub를 찾아 기존 정리 큐에 넣는다.
// 지우는 일은 CleanupFn이 한다(Cognito에 정말 없는지 다시 확인, 실패하면 재시도·DLQ·경보). 이 함수는 읽기와 큐 넣기만 한다(docs/03)
import type { CleanupJob } from "./account.ts";

/** 한 번에 이보다 많으면 넣지 않고 멈춘다(잘못된 사용자 목록 등으로 대량 삭제되는 것을 막고 사람이 확인) */
export const MAX_ORPHANS_PER_RUN = 20;

export type OwnedItem = { userId: string; termId: string };

export interface SweepDeps {
  /** 두 테이블(LearningRecord·RecentView)의 userId·termId */
  scanItems(): Promise<OwnedItem[]>;
  /** Cognito 사용자 풀에 지금 있는 사용자의 sub */
  listUserSubs(): Promise<Set<string>>;
  enqueueCleanup(job: CleanupJob): Promise<void>;
}

export type SweepResult =
  | { status: "done"; orphans: string[] }
  | { status: "aborted"; reason: "no-users" | "too-many"; orphans: string[] };

/**
 * onlyUserIds: 이 sub들만 대상으로 본다(smoke가 자기 테스트 사용자만 정리할 때). 없으면 전부.
 * 탈퇴 표시(#…)만 남은 sub는 고아로 보지 않는다(표시는 TTL로 사라지고, 그때까지 예전 토큰의 저장을 막는다)
 */
export async function sweepOrphans(deps: SweepDeps, onlyUserIds?: string[]): Promise<SweepResult> {
  // 표를 먼저 읽고 그다음 사용자 목록: 그 사이 가입해 기록을 남긴 사용자를 고아로 잘못 잡지 않는다
  const items = await deps.scanItems();
  const owners = new Set(items.filter((i) => !i.termId.startsWith("#")).map((i) => i.userId));
  const subs = await deps.listUserSubs();
  let orphans = [...owners].filter((u) => !subs.has(u)).sort();
  if (onlyUserIds) orphans = orphans.filter((u) => onlyUserIds.includes(u));
  if (subs.size === 0 && owners.size > 0) return { status: "aborted", reason: "no-users", orphans };
  if (orphans.length > MAX_ORPHANS_PER_RUN) return { status: "aborted", reason: "too-many", orphans };
  // 사용자가 없으니 사용자 이름은 알 수 없다: sub를 넣는다(CleanupFn의 AdminGetUser가 없음을 확인하고 지운다)
  for (const userId of orphans) await deps.enqueueCleanup({ userId, username: userId });
  return { status: "done", orphans };
}
