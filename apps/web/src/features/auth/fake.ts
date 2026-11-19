// 가짜 인증(테스트·개발 빌드 전용, 배포 묶음에 없음). 실제 메일 없이 가입·인증·로그인·재설정 흐름을 E2E로 확인한다.
// 사용자와 세션은 localStorage에 두어 새로고침해도 로그인이 유지되는 것까지 흉내 낸다. 인증 코드는 늘 FAKE_CODE
import { FAKE_CODE, type AuthClient } from "./client.ts";
import { authError } from "./errors.ts";

export { FAKE_CODE };
const USERS = "fake-auth-users";
const SESSION = "fake-auth-session";

type Users = Record<string, { password: string; confirmed: boolean }>;

const read = (): Users => JSON.parse(localStorage.getItem(USERS) ?? "{}") as Users;
const write = (users: Users) => localStorage.setItem(USERS, JSON.stringify(users));
/** Cognito 서버 정책과 같게: 8자 + 숫자("영문 포함"은 화면에서만) */
const serverAccepts = (pw: string) => pw.length >= 8 && /[0-9]/.test(pw);

export function fakeAuthClient(): AuthClient {
  return {
    async currentUser() {
      const email = localStorage.getItem(SESSION);
      return email ? { email } : null;
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
      return "done";
    },
    async signOut() {
      localStorage.removeItem(SESSION);
    },
    // 사용자 존재 노출 방지: 없는 이메일이어도 성공처럼 보이고, 코드 확인에서 실패한다
    async resetPassword() {},
    async confirmResetPassword(email, code, newPassword) {
      const users = read();
      if (!users[email] || code !== FAKE_CODE) throw authError("CodeMismatchException");
      if (!serverAccepts(newPassword)) throw authError("InvalidPasswordException");
      write({ ...users, [email]: { ...users[email], password: newPassword } });
    },
  };
}
