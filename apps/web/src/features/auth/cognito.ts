// Cognito 구현(배포 빌드). 설정은 배포 때 만들어지는 /config.json에서 읽는다(infra WebStack). 토큰은 Amplify 기본값(localStorage, docs/03 토큰 저장)
// 구글 로그인(8단계): 로그인 도메인의 인가 코드 + PKCE(signInWithRedirect가 code_challenge를 붙인다). 돌아오면 OAuth 리스너가 코드를 토큰으로 바꾼다
import "aws-amplify/auth/enable-oauth-listener";
import { Amplify } from "aws-amplify";
import {
  confirmResetPassword,
  confirmSignUp,
  fetchAuthSession,
  resendSignUpCode,
  resetPassword,
  signIn,
  signInWithRedirect,
  signOut,
  signUp,
  updatePassword,
} from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import type { AuthClient } from "./client.ts";
import { authError, isAuthError } from "./errors.ts";

type WebAuthConfig = { region: string; userPoolId: string; userPoolClientId: string; oauthDomain: string };

async function readConfig(): Promise<WebAuthConfig> {
  try {
    const res = await fetch("/config.json", { cache: "no-cache" });
    // 403/404→index.html 대체 응답 때문에 없어도 200 HTML이 올 수 있다: JSON이 아니면 실패로 본다
    const config = res.ok ? ((await res.json()) as Partial<WebAuthConfig>) : null;
    if (config?.userPoolId && config.userPoolClientId && config.region && config.oauthDomain) return config as WebAuthConfig;
  } catch {
    // 아래에서 공통 오류로
  }
  throw authError("AuthUnavailable");
}

/** /auth/callback에 코드나 오류가 있을 때만 리디렉션 결과를 기다린다. Amplify.configure 전에 듣기 시작해야 이벤트를 놓치지 않는다 */
function listenRedirect(): Promise<string | null> {
  const params = new URLSearchParams(location.search);
  if (location.pathname !== "/auth/callback" || (!params.has("code") && !params.has("error"))) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    let next: string | null = null;
    const stop = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "customOAuthState") next = payload.data;
      else if (payload.event === "signInWithRedirect") {
        stop();
        resolve(next ?? "/");
      } else if (payload.event === "signInWithRedirect_failure") {
        stop();
        reject(authError("GoogleSignInFailed"));
      }
    });
  });
}

export async function cognitoAuthClient(): Promise<AuthClient> {
  const { userPoolId, userPoolClientId, oauthDomain } = await readConfig();
  const redirect = listenRedirect();
  redirect.catch(() => {}); // 처리하지 않은 거부 경고 방지(콜백 화면이 completeRedirect로 받는다)
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        loginWith: {
          email: true,
          oauth: {
            domain: oauthDomain,
            scopes: ["openid", "email", "profile", "aws.cognito.signin.user.admin"],
            redirectSignIn: [`${location.origin}/auth/callback`],
            redirectSignOut: [`${location.origin}/`],
            responseType: "code",
            providers: ["Google"],
          },
        },
        signUpVerificationMethod: "code",
      },
    },
  });

  return {
    async currentUser() {
      try {
        const payload = (await fetchAuthSession()).tokens?.idToken?.payload;
        // 구글 사용자의 ID 토큰에는 identities(연결된 외부 IdP)가 있다
        return typeof payload?.email === "string" ? { email: payload.email, provider: payload.identities ? "google" : "email" } : null;
      } catch {
        return null;
      }
    },
    async signUp(email, password) {
      await signUp({ username: email, password, options: { userAttributes: { email } } });
    },
    async confirmSignUp(email, code) {
      await confirmSignUp({ username: email, confirmationCode: code });
    },
    async resendSignUpCode(email) {
      await resendSignUpCode({ username: email });
    },
    async signIn(email, password) {
      try {
        const { nextStep } = await signIn({ username: email, password });
        if (nextStep.signInStep === "DONE") return "done";
        if (nextStep.signInStep === "CONFIRM_SIGN_UP") return "confirm";
        throw authError("UnsupportedSignInStep"); // MFA 등은 쓰지 않는다(사용자 풀 MFA OFF)
      } catch (e) {
        if (isAuthError(e, "UserNotConfirmedException")) return "confirm";
        if (isAuthError(e, "UserAlreadyAuthenticatedException")) return "done";
        throw e;
      }
    },
    async signOut() {
      // 토큰 취소가 켜져 있어 리프레시 토큰도 취소되고, 저장된 토큰을 지운다(FR-AUTH-03).
      // 구글 사용자는 Amplify가 로그인 도메인의 /logout을 거쳐 첫 화면으로 돌아온다(구글 계정 로그인은 그대로)
      await signOut();
    },
    async resetPassword(email) {
      await resetPassword({ username: email });
    },
    async confirmResetPassword(email, code, newPassword) {
      await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
    },
    async accessToken() {
      try {
        return (await fetchAuthSession()).tokens?.accessToken?.toString() ?? null; // 만료됐으면 Amplify가 리프레시 토큰으로 갱신한다
      } catch {
        return null;
      }
    },
    async verifyPassword(password) {
      // 로그인한 채로 비밀번호만 확인하는 API가 없어, 같은 비밀번호로 바꾸기(ChangePassword)로 Cognito가 확인하게 한다.
      // 비밀번호를 우리 API로 보내지 않는다. 비밀번호 재사용 금지를 켜지 않아 같은 값으로 바뀐다(docs/03). 틀리면 여기서 실패하고 로그인은 그대로다
      await updatePassword({ oldPassword: password, newPassword: password });
      // 탈퇴 API는 최근 5분 안에 인증한 토큰(auth_time)만 받는다. ChangePassword는 새 토큰을 주지 않으므로 다시 로그인한다.
      // Amplify는 로그인된 채로 signIn을 막아 로컬 로그아웃 뒤 같은 비밀번호로 로그인한다(화면 상태는 store가 따로 들고 있어 그대로)
      const email = (await fetchAuthSession()).tokens?.idToken?.payload.email;
      if (typeof email !== "string") throw authError("NotAuthorizedException");
      await signOut();
      const { nextStep } = await signIn({ username: email, password });
      if (nextStep.signInStep !== "DONE") throw authError("UnsupportedSignInStep");
    },
    async signInWithGoogle(next) {
      await signInWithRedirect({ provider: "Google", customState: next });
    },
    async reauthWithGoogle(next) {
      // prompt가 있으면 Amplify가 로그인된 채로도 리디렉션을 허용한다. Cognito가 select_account를 구글로 넘겨 계정 선택을 반드시 거친다
      await signInWithRedirect({ provider: "Google", customState: next, options: { prompt: "SELECT_ACCOUNT" } });
    },
    completeRedirect() {
      return redirect;
    },
  };
}
