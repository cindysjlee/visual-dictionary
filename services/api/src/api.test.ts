import { describe, expect, it } from "vitest";
import { reauthFresh, withdraw, type CleanupJob, type WithdrawDeps } from "./account.ts";
import { getActivity, putActivity, RECENT_LIMIT, type ActivityRepo, type ViewRecord } from "./activity.ts";
import { cleanup, deletable, UserStillExistsError } from "./cleanup.ts";
import { MAX_ORPHANS_PER_RUN, sweepOrphans, type OwnedItem, type SweepDeps } from "./orphans.ts";
import { accessSubject, getProgress, putProgress, type ProgressRecord, type ProgressRepo } from "./progress.ts";

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
  // 최근 본 용어(RecentView): 같은 탈퇴 표시를 본다
  const views = new Map<string, Map<string, ViewRecord>>();
  const viewsOf = (u: string) => views.get(u) ?? views.set(u, new Map()).get(u)!;
  const activity: ActivityRepo = {
    async list(u) {
      return { views: [...viewsOf(u).values()], withdrawn: withdrawn.has(u) };
    },
    async put(u, v) {
      if (withdrawn.has(u)) return "withdrawn";
      viewsOf(u).set(v.termId, v);
      return "saved";
    },
  };
  return { rows, withdrawn, repo, activity, views, count: (u: string) => of(u).size, viewCount: (u: string) => viewsOf(u).size };
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
    deleteActivity: async (u: string) => {
      const n = t.viewCount(u);
      t.views.get(u)?.clear();
      return n;
    },
  };
  return { deps, queue, cognitoUsers, cleanupDeps };
}

describe("탈퇴 재인증: 토큰 auth_time이 5분 안일 때만(모든 사용자)", () => {
  const now = 1_800_000_000;
  it("5분 안이면 받고, 5분을 넘거나 없거나 형식이 틀리면 거부한다", () => {
    expect(reauthFresh(now - 10, now)).toBe(true);
    expect(reauthFresh(String(now - 300), now)).toBe(true); // JWT 인가는 클레임을 문자열로 줄 수 있다
    expect(reauthFresh(now - 301, now)).toBe(false);
    expect(reauthFresh(undefined, now)).toBe(false);
    expect(reauthFresh("abc", now)).toBe(false);
    expect(reauthFresh(0, now)).toBe(false);
  });
  it("시계 차 1분을 넘는 미래 시각은 거부한다", () => {
    expect(reauthFresh(now + 30, now)).toBe(true);
    expect(reauthFresh(now + 61, now)).toBe(false);
  });
});

/** 고아 정리 의존성: 메모리 테이블의 기록·최근 본 용어·탈퇴 표시를 실제 테이블처럼 (userId, termId)로 보여 준다. 호출 순서를 남긴다 */
function sweepDeps(t: ReturnType<typeof memoryTable>, cognitoSubs: Set<string>) {
  const calls: string[] = [];
  const enqueued: CleanupJob[] = [];
  const deps: SweepDeps = {
    async scanItems() {
      calls.push("scan");
      const items: OwnedItem[] = [];
      for (const [userId, m] of t.rows) for (const termId of m.keys()) items.push({ userId, termId });
      for (const [userId, m] of t.views) for (const termId of m.keys()) items.push({ userId, termId });
      for (const userId of t.withdrawn) items.push({ userId, termId: "#deleted" });
      return items;
    },
    async listUserSubs() {
      calls.push("list");
      return cognitoSubs;
    },
    async enqueueCleanup(job) {
      enqueued.push(job);
    },
  };
  return { deps, calls, enqueued };
}

describe("고아 기록 정리: Cognito에 없는 sub의 기록만 정리 큐에", () => {
  it("기록·최근 본 용어가 있는데 Cognito에 없는 sub만 넣고, 표를 먼저 읽은 뒤 사용자 목록을 읽는다", async () => {
    const t = memoryTable();
    await putProgress("A", "csrf", body(true), TERMS, t.repo);
    await putActivity("GONE1", "xss", undefined, TERMS, t.activity);
    await putProgress("GONE2", "xss", body(true), TERMS, t.repo);
    const s = sweepDeps(t, new Set(["A", "B"]));
    expect(await sweepOrphans(s.deps)).toEqual({ status: "done", orphans: ["GONE1", "GONE2"] });
    expect(s.enqueued).toEqual([
      { userId: "GONE1", username: "GONE1" },
      { userId: "GONE2", username: "GONE2" },
    ]);
    expect(s.calls).toEqual(["scan", "list"]);
  });

  it("구글 사용자(사용자 이름이 sub와 다름)는 sub로 찾으므로 고아가 아니다", async () => {
    const t = memoryTable();
    await putProgress("google-sub", "csrf", body(true), TERMS, t.repo);
    const s = sweepDeps(t, new Set(["google-sub"])); // Cognito 사용자 이름은 Google_… 이지만 목록은 sub
    expect((await sweepOrphans(s.deps)).orphans).toEqual([]);
  });

  it("탈퇴 표시(#deleted)만 남은 sub는 고아로 보지 않는다", async () => {
    const t = memoryTable();
    t.withdrawn.add("W");
    const s = sweepDeps(t, new Set(["A"]));
    expect(await sweepOrphans(s.deps)).toEqual({ status: "done", orphans: [] });
    expect(s.enqueued).toEqual([]);
  });

  it("onlyUserIds면 그 sub만 본다(smoke가 자기 테스트 사용자만)", async () => {
    const t = memoryTable();
    await putProgress("GONE1", "csrf", body(true), TERMS, t.repo);
    await putProgress("GONE2", "csrf", body(true), TERMS, t.repo);
    const s = sweepDeps(t, new Set(["A"]));
    expect((await sweepOrphans(s.deps, ["GONE2"])).orphans).toEqual(["GONE2"]);
    expect(s.enqueued.map((j) => j.userId)).toEqual(["GONE2"]);
  });

  it("안전장치: Cognito 목록이 비었는데 기록이 있으면, 또는 한 번에 20명을 넘으면 아무것도 넣지 않고 멈춘다", async () => {
    const t = memoryTable();
    await putProgress("X", "csrf", body(true), TERMS, t.repo);
    const empty = sweepDeps(t, new Set());
    expect(await sweepOrphans(empty.deps)).toMatchObject({ status: "aborted", reason: "no-users" });
    expect(empty.enqueued).toEqual([]);

    const many = memoryTable();
    for (let i = 0; i <= MAX_ORPHANS_PER_RUN; i++) await putProgress(`G${i}`, "csrf", body(true), TERMS, many.repo);
    const s = sweepDeps(many, new Set(["A"]));
    expect(await sweepOrphans(s.deps)).toMatchObject({ status: "aborted", reason: "too-many" });
    expect(s.enqueued).toEqual([]);
  });

  it("정리는 어떤 경로로도 탈퇴 표시(#…)를 지우지 않는다(deletable)", () => {
    expect(deletable("#deleted")).toBe(false);
    expect(deletable("csrf")).toBe(true);
  });

  it("탈퇴 직후 정리 작업과 고아 정리를 돌려도 #deleted가 남아, 예전 토큰의 PUT은 계속 403이고 기록이 생기지 않는다", async () => {
    const t = memoryTable();
    await putProgress("A", "csrf", body(true), TERMS, t.repo);
    const w = withdrawDeps(t);
    expect((await withdraw("A", "A", w.deps)).status).toBe(204);
    await cleanup(JSON.stringify(w.queue[0]), w.cleanupDeps);
    const s = sweepDeps(t, w.cognitoUsers); // A는 Cognito에서 지워졌고 남은 것은 탈퇴 표시뿐
    expect(await sweepOrphans(s.deps)).toEqual({ status: "done", orphans: [] });
    expect(t.withdrawn.has("A")).toBe(true);
    expect((await putProgress("A", "xss", body(true), TERMS, t.repo)).status).toBe(403);
    expect((await putActivity("A", "xss", undefined, TERMS, t.activity)).status).toBe(403);
    expect(t.count("A") + t.viewCount("A")).toBe(0);
  });
});

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

  it("최근 본 용어도: 탈퇴 직후 예전 토큰으로 PUT은 거부, 정리가 두 테이블을 모두 지운다", async () => {
    const t = memoryTable();
    await putActivity("A", "csrf", undefined, TERMS, t.activity);
    const w = withdrawDeps(t);
    expect((await withdraw("A", "A", w.deps)).status).toBe(204);
    expect((await putActivity("A", "xss", undefined, TERMS, t.activity)).status).toBe(403);
    expect((await getActivity("A", t.activity)).status).toBe(403);
    await cleanup(JSON.stringify(w.queue[0]), w.cleanupDeps);
    expect(t.viewCount("A")).toBe(0);
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

describe("최근 본 용어 API: 사용자는 토큰의 sub로만, 본 시각은 서버가", () => {
  it("본 용어는 그 사용자에게만, 최신순으로, 최대 RECENT_LIMIT개", async () => {
    const t = memoryTable();
    const many = new Set(Array.from({ length: 12 }, (_, i) => `term-${i}`));
    for (let i = 0; i < 12; i++) await putActivity("A", `term-${i}`, undefined, many, t.activity, new Date(Date.UTC(2026, 0, 1, 0, i)));
    const r = (await getActivity("A", t.activity)) as { status: number; body: { recent: ViewRecord[] } };
    expect(r.status).toBe(200);
    expect(r.body.recent).toHaveLength(RECENT_LIMIT);
    expect(r.body.recent[0]!.termId).toBe("term-11");
    expect(await getActivity("B", t.activity)).toEqual({ status: 200, body: { recent: [] } });
  });

  it("같은 용어를 다시 보면 덮어쓴다(사용자당 항목 수 ≤ 용어 수)", async () => {
    const t = memoryTable();
    await putActivity("A", "csrf", undefined, TERMS, t.activity, new Date("2026-01-01T00:00:00Z"));
    await putActivity("A", "csrf", undefined, TERMS, t.activity, new Date("2026-01-02T00:00:00Z"));
    expect(t.viewCount("A")).toBe(1);
  });

  it.each([
    ["없는 용어", "no-such-term", undefined, 404],
    ["형식이 틀린 용어 ID", "#deleted", undefined, 404],
    ["본문을 보내면(다른 사용자 ID·시각 지정 시도)", "csrf", JSON.stringify({ userId: "B", viewedAt: "2030-01-01" }), 400],
  ])("거부: %s → %i", async (_, termId, raw, status) => {
    const t = memoryTable();
    expect((await putActivity("A", termId, raw, TERMS, t.activity)).status).toBe(status);
    expect(t.viewCount("A") + t.viewCount("B")).toBe(0);
  });
});

describe("토큰 종류: 액세스 토큰만(DF-50)", () => {
  it("token_use가 access이고 sub가 있을 때만 사용자를 돌려준다", () => {
    expect(accessSubject({ token_use: "access", sub: "u-1", username: "u-1" })).toBe("u-1");
    expect(accessSubject({ token_use: "id", sub: "u-1", aud: "client" })).toBeNull(); // ID 토큰
    expect(accessSubject({ sub: "u-1" })).toBeNull(); // 종류 없음
    expect(accessSubject({ token_use: "access" })).toBeNull(); // sub 없음
    expect(accessSubject({ token_use: "access", sub: 7 })).toBeNull(); // 문자열이 아님
  });
});
