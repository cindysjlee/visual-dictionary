import { describe, expect, it } from "vitest";
import { withdraw, type CleanupJob, type WithdrawDeps } from "./account.ts";
import { cleanup, UserStillExistsError } from "./cleanup.ts";
import { getProgress, putProgress, type ProgressRecord, type ProgressRepo } from "./progress.ts";

const TERMS = new Set(["csrf", "xss", "tcp-handshake"]);
const body = (read: boolean, source = "manual") => JSON.stringify({ read, source });

/** 메모리 테이블: 실제 저장소와 같은 규칙(탈퇴 표시가 있으면 저장 거부) */
function memoryTable() {
  const rows = new Map<string, Map<string, ProgressRecord>>();
  const withdrawn = new Set<string>();
  const of = (u: string) => rows.get(u) ?? rows.set(u, new Map()).get(u)!;
  const repo: ProgressRepo = {
    async list(u) {
      return { records: [...of(u).values()], withdrawn: withdrawn.has(u) };
    },
    async put(u, r) {
      if (withdrawn.has(u)) return "withdrawn";
      of(u).set(r.termId, r);
      return "saved";
    },
  };
  return { rows, withdrawn, repo, count: (u: string) => of(u).size };
}

describe("학습 기록 API: 사용자는 토큰의 sub로만", () => {
  it("저장한 기록은 그 사용자에게만 보이고, 다른 사용자에게는 안 보인다", async () => {
    const t = memoryTable();
    expect((await putProgress("A", "csrf", body(true, "completed"), TERMS, t.repo)).status).toBe(200);
    expect(await getProgress("A", t.repo)).toMatchObject({ status: 200, body: { records: [{ termId: "csrf", read: true, source: "completed" }] } });
    expect(await getProgress("B", t.repo)).toEqual({ status: 200, body: { records: [] } });
  });

  it("본문에 다른 사용자 ID를 넣으면 거부하고 아무것도 바뀌지 않는다", async () => {
    const t = memoryTable();
    const spoof = JSON.stringify({ read: true, source: "manual", userId: "B" });
    expect((await putProgress("A", "csrf", spoof, TERMS, t.repo)).status).toBe(400);
    expect(t.count("A") + t.count("B")).toBe(0);
  });

  it("안 읽음은 read:false로 남긴다(지우지 않음)", async () => {
    const t = memoryTable();
    await putProgress("A", "xss", body(true), TERMS, t.repo);
    await putProgress("A", "xss", body(false), TERMS, t.repo);
    expect(await getProgress("A", t.repo)).toMatchObject({ body: { records: [{ termId: "xss", read: false, source: "manual" }] } });
  });

  it.each([
    ["없는 용어", "no-such-term", body(true), 404],
    ["형식이 틀린 용어 ID", "#deleted", body(true), 404],
    ["대문자 용어 ID", "CSRF", body(true), 404],
    ["빈 본문", "csrf", undefined, 400],
    ["JSON 아님", "csrf", "read=true", 400],
    ["read가 문자열", "csrf", JSON.stringify({ read: "true", source: "manual" }), 400],
    ["모르는 source", "csrf", JSON.stringify({ read: true, source: "admin" }), 400],
    ["1KB 넘는 본문", "csrf", JSON.stringify({ read: true, source: "manual", pad: "x".repeat(2000) }), 413],
  ])("거부: %s → %i", async (_, termId, raw, status) => {
    const t = memoryTable();
    expect((await putProgress("A", termId, raw, TERMS, t.repo)).status).toBe(status);
    expect(t.count("A")).toBe(0);
  });
});

/** 탈퇴 의존성: 단계별로 실패를 넣을 수 있다 */
function withdrawDeps(t: ReturnType<typeof memoryTable>, fail: Partial<Record<"mark" | "enqueue" | "unmark" | "cognito", boolean>> = {}) {
  const queue: CleanupJob[] = [];
  const cognitoUsers = new Set(["A"]);
  const deps: WithdrawDeps = {
    async markWithdrawn(u) {
      if (fail.mark) throw new Error("mark");
      t.withdrawn.add(u);
    },
    async unmarkWithdrawn(u) {
      if (fail.unmark) throw new Error("unmark");
      t.withdrawn.delete(u);
    },
    async enqueueCleanup(job) {
      if (fail.enqueue) throw new Error("enqueue");
      queue.push(job);
    },
    async deleteCognitoUser(name) {
      if (fail.cognito) throw new Error("cognito");
      cognitoUsers.delete(name);
    },
    log() {},
  };
  const cleanupDeps = {
    cognitoUserExists: async (name: string) => cognitoUsers.has(name),
    deleteRecords: async (u: string) => {
      const n = t.count(u);
      t.rows.get(u)?.clear();
      return n;
    },
  };
  return { deps, queue, cognitoUsers, cleanupDeps };
}

describe("회원 탈퇴: 큐에 넣은 뒤에만 Cognito 삭제, 실패 단계별 결과", () => {
  it("성공: 표시 → 큐 → Cognito 삭제 → 정리 후 기록 없음, 탈퇴 직후 예전 토큰으로 PUT은 거부되고 테이블에 기록이 생기지 않는다", async () => {
    const t = memoryTable();
    await putProgress("A", "csrf", body(true), TERMS, t.repo);
    const w = withdrawDeps(t);
    expect(await withdraw("A", "A", w.deps)).toEqual({ status: 204 });
    expect(w.queue).toEqual([{ userId: "A", username: "A" }]);
    expect(w.cognitoUsers.has("A")).toBe(false);
    // 예전 토큰(아직 1시간 유효)으로 정리 전·후 모두 저장 시도 → 거부
    expect((await putProgress("A", "xss", body(true), TERMS, t.repo)).status).toBe(403);
    expect(await cleanup(JSON.stringify(w.queue[0]), w.cleanupDeps)).toBe("done");
    expect((await putProgress("A", "tcp-handshake", body(true), TERMS, t.repo)).status).toBe(403);
    expect(t.count("A")).toBe(0);
  });

  it("표시 쓰기 실패: 탈퇴 실패, 큐·Cognito는 그대로", async () => {
    const t = memoryTable();
    const w = withdrawDeps(t, { mark: true });
    expect((await withdraw("A", "A", w.deps)).status).toBe(500);
    expect(w.queue).toHaveLength(0);
    expect(w.cognitoUsers.has("A")).toBe(true);
  });

  it("큐 넣기 실패: 탈퇴 실패(503), 표시를 되돌려 계속 저장 가능, Cognito 삭제 안 함", async () => {
    const t = memoryTable();
    const w = withdrawDeps(t, { enqueue: true });
    expect((await withdraw("A", "A", w.deps)).status).toBe(503);
    expect(w.cognitoUsers.has("A")).toBe(true);
    expect(t.withdrawn.has("A")).toBe(false);
    expect((await putProgress("A", "csrf", body(true), TERMS, t.repo)).status).toBe(200);
  });

  it("큐 넣기와 되돌리기 모두 실패: 탈퇴 실패, 표시가 남아(최대 2시간) 저장만 막힘, 계정은 그대로", async () => {
    const t = memoryTable();
    const w = withdrawDeps(t, { enqueue: true, unmark: true });
    expect((await withdraw("A", "A", w.deps)).status).toBe(503);
    expect(w.cognitoUsers.has("A")).toBe(true);
    expect((await putProgress("A", "csrf", body(true), TERMS, t.repo)).status).toBe(403);
  });

  it("Cognito 삭제 실패: 탈퇴 실패, 큐의 정리 작업은 계정이 남아 있으면 기록을 지우지 않고 재시도(→ DLQ)", async () => {
    const t = memoryTable();
    await putProgress("A", "csrf", body(true), TERMS, t.repo);
    const w = withdrawDeps(t, { cognito: true });
    expect((await withdraw("A", "A", w.deps)).status).toBe(500);
    expect(w.queue).toHaveLength(1);
    await expect(cleanup(JSON.stringify(w.queue[0]), w.cleanupDeps)).rejects.toBeInstanceOf(UserStillExistsError);
    expect(t.count("A")).toBe(1);
  });

  it("정리 메시지 형식이 틀리면 버린다(재시도해도 소용없음)", async () => {
    const t = memoryTable();
    const w = withdrawDeps(t);
    expect(await cleanup("not json", w.cleanupDeps)).toBe("skipped");
    expect(await cleanup(JSON.stringify({ userId: "A" }), w.cleanupDeps)).toBe("skipped");
  });
});
