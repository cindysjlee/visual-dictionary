// 인증 기능의 경계. 화면은 이 인터페이스만 쓴다. 배포 빌드는 Cognito(Amplify), 테스트·개발 빌드는 가짜 구현(fake.ts, 실제 메일 없이 E2E)
// MODE는 Vite가 빌드 때 상수로 바꾸므로 배포 묶음에는 가짜 구현이 들어가지 않는다(scripts/check-bundle.ts가 확인)
export type AuthUser = { email: string };
/** 로그인 결과: 끝남, 또는 이메일 인증이 아직이라 코드 입력이 필요함 */
export type SignInResult = "done" | "confirm";

export interface AuthClient {
  currentUser(): Promise<AuthUser | null>;
  signUp(email: string, password: string): Promise<void>;
  confirmSignUp(email: string, code: string): Promise<void>;
  resendSignUpCode(email: string): Promise<void>;
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  confirmResetPassword(email: string, code: string, newPassword: string): Promise<void>;
}

export const FAKE_AUTH = import.meta.env.MODE !== "production";

export function importAuthClient(): Promise<AuthClient> {
  return FAKE_AUTH ? import("./fake.ts").then((m) => m.fakeAuthClient()) : import("./cognito.ts").then((m) => m.cognitoAuthClient());
}
