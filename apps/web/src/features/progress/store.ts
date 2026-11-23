// 학습 기록 상태(FR-PRG). 로그인하면 불러오고, 로그아웃하면 비운다. 저장은 화면을 먼저 바꾸고 실패하면 되돌린다.
// 기록 저장이 실패해도 용어 보기·재생은 그대로다(NFR-02): 오류는 여기서 상태로만 알리고 던지지 않는 쪽은 부르는 곳이 정한다
import { useSyncExternalStore } from "react";
import { subscribeAuth, type AuthState } from "../auth/store.ts";
import { progressApi, type ReadSource, type ViewRecord } from "./api.ts";

/** at = 마지막으로 저장한 시각(API updatedAt). 다 읽음이면 "다 읽은 날"로 도장 아래에 쓴다 */
export type ProgressEntry = { read: boolean; source: ReadSource; at?: string };
export type ProgressState =
  | { status: "anon" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; records: Readonly<Record<string, ProgressEntry>> };

let state: ProgressState = { status: "anon" };
let owner: string | null = null; // 지금 기록의 주인(이메일). 다른 사용자로 바뀌면 다시 불러온다
const listeners = new Set<() => void>();
const set = (next: ProgressState) => {
  state = next;
  for (const l of listeners) l();
};

/** 최근 본 용어(7단계): 기록과 따로 불러온다. 실패하면 빈 목록(화면은 그대로) */
let recent: ViewRecord[] = [];
const recentListeners = new Set<() => void>();
const setRecent = (next: ViewRecord[]) => {
  recent = next;
  for (const l of recentListeners) l();
};
export const useRecent = () =>
  useSyncExternalStore(
    (l) => {
      recentListeners.add(l);
      return () => recentListeners.delete(l);
    },
    () => recent,
  );

async function loadRecent(email: string) {
  try {
    const list = await (await progressApi()).listRecent();
    if (owner === email) setRecent(list);
  } catch {
    if (owner === email) setRecent([]);
  }
}

async function load(email: string) {
  set({ status: "loading" });
  void loadRecent(email);
  try {
    const list = await (await progressApi()).list();
    if (owner !== email) return; // 그사이 로그아웃·다른 사용자
    set({ status: "ready", records: Object.fromEntries(list.map((r) => [r.termId, { read: r.read, source: r.source, at: r.updatedAt }])) });
  } catch {
    if (owner === email) set({ status: "error" });
  }
}

function follow(auth: AuthState) {
  const email = auth.status === "user" ? auth.email : null;
  if (email === owner) return;
  owner = email;
  if (email) void load(email);
  else {
    set({ status: "anon" });
    setRecent([]);
  }
}

let started = false;
/** 앱 시작 때 한 번(Layout): 로그인 상태를 따라간다 */
export function startProgress() {
  if (started) return;
  started = true;
  subscribeAuth(follow);
}

export const useProgress = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

export const isRead = (s: ProgressState, termId: string) => s.status === "ready" && s.records[termId]?.read === true;
/** 다 읽은 날(ISO). 안 읽었거나 기록이 없으면 undefined */
export const readAt = (s: ProgressState, termId: string) => (isRead(s, termId) && s.status === "ready" ? s.records[termId]?.at : undefined);

export const progress = {
  /** 다시 불러오기(불러오기 실패 뒤 "다시 시도") */
  reload() {
    if (owner) void load(owner);
  },
  /** 읽음·안 읽음 저장. 화면을 먼저 바꾸고, 실패하면 되돌린 뒤 던진다 */
  async setRead(termId: string, read: boolean, source: ReadSource) {
    if (state.status !== "ready") throw new Error("not-ready");
    const before = state.records;
    set({ status: "ready", records: { ...before, [termId]: { read, source, at: new Date().toISOString() } } }); // 서버 updatedAt과 같은 뜻(저장 시각)
    try {
      await (await progressApi()).put(termId, read, source);
    } catch (e) {
      if (state.status === "ready") set({ status: "ready", records: before });
      throw e;
    }
  },
  async withdraw() {
    await (await progressApi()).withdraw();
    owner = null;
    set({ status: "anon" });
    setRecent([]);
  },
  /** 상세 페이지를 열었음: 목록 맨 앞에 먼저 반영하고 서버에 기록한다. 실패는 무시한다(NFR-02) */
  recordView(termId: string) {
    if (!owner) return;
    setRecent([{ termId, viewedAt: new Date().toISOString() }, ...recent.filter((v) => v.termId !== termId)].slice(0, 10));
    void progressApi()
      .then((api) => api.recordView(termId))
      .catch(() => undefined);
  },
};
