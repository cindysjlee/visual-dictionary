// 가짜 인증(테스트·개발 빌드 전용, 배포 묶음에 없음). 실제 메일 없이 가입·인증·로그인·재설정 흐름을 E2E로 확인한다.
// 사용자와 세션은 localStorage에 두어 새로고침해도 로그인이 유지되는 것까지 흉내 낸다. 인증 코드는 늘 FAKE_CODE
import { FAKE_CODE, type AuthClient } from "./client.ts";
import { authError } from "./errors.ts";

export { FAKE_CODE };
const USERS = "fake-auth-users";
const SESSION = "fake-auth-session";
/** 가짜 구글 로그인: 세션이 구글 사용자인지 표시. 구글 사용자 이메일은 고정(E2E는 브라우저 컨텍스트마다 저장소가 따로라 겹치지 않는다) */
const GOOGLE = "fake-auth-google";
export const FAKE_GOOGLE_EMAIL = "google-user@example.com";

type Users = Record<string, { password: string; confirmed: boolean }>;

const read = (): Users => JSON.parse(localStorage.getItem(USERS) ?? "{}") as Users;
const write = (users: Users) => localStorage.setItem(USERS, JSON.stringify(users));
/** Cognito 서버 정책과 같게: 8자 + 숫자("영문 포함"은 화면에서만) */
const serverAccepts = (pw: string) => pw.length >= 8 && /[0-9]/.test(pw);

export function fakeAuthClient(): AuthClient {
  return {
    async currentUser() {
      const email = localStorage.getItem(SESSION);
      return email ? { email, provider: localStorage.getItem(GOOGLE) === "1" ? "google" : "email" } : null;
    },
    async signUp(email, password) {
      const users = read();
      if (users[email]) throw authError("UsernameExistsException");
      if (!serverAccepts(password)) throw authError("InvalidPasswordException");
      write({ ...users, [email]: { password, confirmed: false } });
    },
    async confirmSignUp(email, code) {
      const users = read();
      if (!users[email] || code !== FAKE_CODE) throw authError("CodeMismatchException");
      write({ ...users, [email]: { ...users[email], confirmed: true } });
    },
    async resendSignUpCode() {},
    async signIn(email, password) {
      const user = read()[email];
      if (!user || user.password !== password) throw authError("NotAuthorizedException");
      if (!user.confirmed) return "confirm";
      localStorage.setItem(SESSION, email);
      localStorage.removeItem(GOOGLE);
      return "done";
    },
    async signOut() {
      localStorage.removeItem(SESSION);
      localStorage.removeItem(GOOGLE);
    },
    // 사용자 존재 노출 방지: 없는 이메일이어도 성공처럼 보이고, 코드 확인에서 실패한다
    async resetPassword() {},
    async confirmResetPassword(email, code, newPassword) {
      const users = read();
      if (!users[email] || code !== FAKE_CODE) throw authError("CodeMismatchException");
      if (!serverAccepts(newPassword)) throw authError("InvalidPasswordException");
      write({ ...users, [email]: { ...users[email], password: newPassword } });
    },
    async accessToken() {
      const email = localStorage.getItem(SESSION);
      return email ? `fake-token:${email}` : null; // 가짜 기록 API(features/progress/fake.ts)가 이 값으로 사용자를 구분한다
    },
    async verifyPassword(password) {
      const email = localStorage.getItem(SESSION);
      if (!email || read()[email]?.password !== password) throw authError("NotAuthorizedException");
    },
    // 가짜 구글: 구글 화면 대신 바로 콜백 주소로 이동한다(실제와 같은 콜백 화면·next 처리를 거친다). fake-google=fail이면 실패 흉내
    async signInWithGoogle(next) {
      location.assign(`/auth/callback?code=fake&state=${encodeURIComponent(next)}`);
    },
    async reauthWithGoogle(next) {
      location.assign(`/auth/callback?code=fake-reauth&state=${encodeURIComponent(next)}`);
    },
    async completeRedirect() {
      const params = new URLSearchParams(location.search);
      if (location.pathname !== "/auth/callback" || (!params.has("code") && !params.has("error"))) return null;
      if (params.has("error") || localStorage.getItem("fake-google") === "fail") throw authError("GoogleSignInFailed");
      localStorage.setItem(SESSION, FAKE_GOOGLE_EMAIL);
      localStorage.setItem(GOOGLE, "1");
      return params.get("state") ?? "/";
    },
  };
}
