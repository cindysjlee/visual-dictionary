// 학습 기록 상태(FR-PRG). 로그인하면 불러오고, 로그아웃하면 비운다. 저장은 화면을 먼저 바꾸고 실패하면 되돌린다.
// 기록 저장이 실패해도 용어 보기·재생은 그대로다(NFR-02): 오류는 여기서 상태로만 알리고 던지지 않는 쪽은 부르는 곳이 정한다
import { useSyncExternalStore } from "react";
import { subscribeAuth, type AuthState } from "../auth/store.ts";
import { progressApi, type ReadSource } from "./api.ts";

export type ProgressEntry = { read: boolean; source: ReadSource };
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

async function load(email: string) {
  set({ status: "loading" });
  try {
    const list = await (await progressApi()).list();
    if (owner !== email) return; // 그사이 로그아웃·다른 사용자
    set({ status: "ready", records: Object.fromEntries(list.map((r) => [r.termId, { read: r.read, source: r.source }])) });
  } catch {
    if (owner === email) set({ status: "error" });
  }
}

function follow(auth: AuthState) {
  const email = auth.status === "user" ? auth.email : null;
  if (email === owner) return;
  owner = email;
  if (email) void load(email);
  else set({ status: "anon" });
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

export const progress = {
  /** 다시 불러오기(불러오기 실패 뒤 "다시 시도") */
  reload() {
    if (owner) void load(owner);
  },
  /** 읽음·안 읽음 저장. 화면을 먼저 바꾸고, 실패하면 되돌린 뒤 던진다 */
  async setRead(termId: string, read: boolean, source: ReadSource) {
    if (state.status !== "ready") throw new Error("not-ready");
    const before = state.records;
    set({ status: "ready", records: { ...before, [termId]: { read, source } } });
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
  },
};
