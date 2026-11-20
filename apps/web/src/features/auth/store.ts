// 로그인 상태(상단바·상세 안내가 구독)와 화면이 부르는 인증 동작. 인증 구현은 첫 화면이 뜬 뒤 동적으로 받는다(홈 묶음에 Amplify 없음)
import { useSyncExternalStore } from "react";
import { importAuthClient, type AuthClient, type SignInResult } from "./client.ts";
import { authError } from "./errors.ts";

export type AuthState = { status: "loading" } | { status: "anon" } | { status: "user"; email: string; provider: "email" | "google" } | { status: "unavailable" };

let state: AuthState = { status: "loading" };
const listeners = new Set<() => void>();
const set = (next: AuthState) => {
  state = next;
  for (const l of listeners) l();
};

let client: Promise<AuthClient> | undefined;
/** 구현을 한 번만 받는다. 실패하면(설정 없음·네트워크) 다음 호출에서 다시 시도한다 */
function getClient(): Promise<AuthClient> {
  client ??= importAuthClient().catch(() => {
    client = undefined;
    throw authError("AuthUnavailable");
  });
  return client;
}

async function refresh() {
  const user = await (await getClient()).currentUser();
  set(user ? { status: "user", email: user.email, provider: user.provider } : { status: "anon" });
}

/** 앱 시작 때 한 번(Layout). 저장된 토큰으로 로그인 상태를 읽는다 */
export function startAuth() {
  if (state.status !== "loading") return;
  refresh().catch(() => set({ status: "unavailable" }));
}

export const useAuth = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

/** 가입 직후 코드 확인까지 같은 탭에서 이어질 때만 자동 로그인한다. 비밀번호는 메모리에만 두고 저장하지 않는다 */
let pending: { email: string; password: string } | null = null;

export const auth = {
  async signUp(email: string, password: string) {
    await (await getClient()).signUp(email, password);
    pending = { email, password };
  },
  /** 코드 확인 뒤 로그인까지 끝났으면 true(아니면 로그인 화면으로) */
  async confirmSignUp(email: string, code: string): Promise<boolean> {
    const c = await getClient();
    await c.confirmSignUp(email, code);
    const p = pending?.email === email ? pending : null;
    pending = null;
    if (!p || (await c.signIn(p.email, p.password)) !== "done") return false;
    await refresh();
    return true;
  },
  async resendSignUpCode(email: string) {
    await (await getClient()).resendSignUpCode(email);
  },
  async signIn(email: string, password: string): Promise<SignInResult> {
    const c = await getClient();
    const result = await c.signIn(email, password);
    if (result === "confirm") {
      pending = { email, password };
      await c.resendSignUpCode(email);
    } else await refresh();
    return result;
  },
  async signOut() {
    await (await getClient()).signOut();
    set({ status: "anon" });
  },
  async resetPassword(email: string) {
    await (await getClient()).resetPassword(email);
  },
  async confirmResetPassword(email: string, code: string, newPassword: string) {
    await (await getClient()).confirmResetPassword(email, code, newPassword);
  },
  /** /api/* 요청에 붙일 액세스 토큰(없으면 null) */
  async accessToken() {
    return (await getClient()).accessToken();
  },
  async verifyPassword(password: string) {
    await (await getClient()).verifyPassword(password);
  },
  /** 구글 로그인 화면으로 이동(돌아오면 /auth/callback → next) */
  async signInWithGoogle(next: string) {
    await (await getClient()).signInWithGoogle(next);
  },
  /** 구글 사용자의 탈퇴 전 재확인(계정 선택을 거친 재로그인 → next) */
  async reauthWithGoogle(next: string) {
    await (await getClient()).reauthWithGoogle(next);
  },
  /** /auth/callback: 리디렉션 로그인을 끝내고 로그인 상태를 읽은 뒤 돌아갈 경로를 준다(코드가 없으면 null) */
  async completeRedirect(): Promise<string | null> {
    const next = await (await getClient()).completeRedirect();
    if (next !== null) await refresh();
    return next;
  },
  /** 탈퇴 뒤: 사용자가 이미 없어 토큰 취소가 실패할 수 있다. 실패해도 이 브라우저의 로그인 상태는 지운다 */
  async signOutAfterWithdraw() {
    try {
      await (await getClient()).signOut();
    } catch {
      // 저장된 토큰 삭제는 Amplify가 취소 실패와 상관없이 한다
    }
    set({ status: "anon" });
  },
};

/** 다른 모듈(기록 store)이 로그인 상태 변화를 따라가게 한다 */
export const subscribeAuth = (l: (s: AuthState) => void) => {
  const fn = () => l(state);
  listeners.add(fn);
  fn();
  return () => listeners.delete(fn);
};
