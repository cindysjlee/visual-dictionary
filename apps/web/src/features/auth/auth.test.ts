import { beforeEach, describe, expect, it, vi } from "vitest";
import { authMessage, FALLBACK_MESSAGE } from "./errors.ts";
import { FAKE_CODE, fakeAuthClient } from "./fake.ts";
import { passwordProblems } from "./password.ts";
import { loginPath, safeNext } from "./safeNext.ts";
import { hasStoredSession } from "./session.ts";

const ORIGIN = "https://d1y3rvak3nd08u.cloudfront.net";

describe("safeNext: 사이트 안 경로만 돌아간다(열린 리디렉션 방지)", () => {
  it.each([
    ["/terms/csrf", "/terms/csrf"],
    ["/terms/csrf?mode=1#player", "/terms/csrf?mode=1#player"],
    ["/", "/"],
  ])("허용: %s", (next, expected) => {
    expect(safeNext(next, ORIGIN)).toBe(expected);
  });

  it.each([
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "evil.com",
    "",
    null,
    undefined,
  ])("차단 → /: %s", (next) => {
    expect(safeNext(next, ORIGIN)).toBe("/");
  });

  it("loginPath는 지금 경로를 인코딩해 next로 넘긴다", () => {
    expect(loginPath("/terms/csrf")).toBe("/auth/login?next=%2Fterms%2Fcsrf");
    expect(safeNext(new URLSearchParams(loginPath("/terms/csrf?x=1").split("?")[1]).get("next"), ORIGIN)).toBe("/terms/csrf?x=1");
  });
});

describe("비밀번호 조건: 8자 이상, 영문·숫자 포함(영문은 화면에서만)", () => {
  it("부족한 조건을 알려 준다", () => {
    expect(passwordProblems("abc12345")).toEqual([]);
    expect(passwordProblems("ABC12345")).toEqual([]);
    expect(passwordProblems("12345678")).toEqual(["영문 포함"]);
    expect(passwordProblems("abcdefgh")).toEqual(["숫자 포함"]);
    expect(passwordProblems("ab1")).toEqual(["8자 이상"]);
  });
});

describe("오류 문구", () => {
  it("Cognito 오류 이름을 한국어로, 모르는 오류는 공통 문구", () => {
    expect(authMessage({ name: "UsernameExistsException" })).toContain("이미 가입된 이메일");
    expect(authMessage({ name: "CodeMismatchException" })).toContain("인증 코드가 맞지 않아요");
    // 존재 노출 방지: 없는 사용자도 비밀번호 틀림과 같은 문구
    expect(authMessage({ name: "UserNotFoundException" })).toBe(authMessage({ name: "NotAuthorizedException" }));
    expect(authMessage(new Error("boom"))).toBe(FALLBACK_MESSAGE);
    expect(authMessage("x")).toBe(FALLBACK_MESSAGE);
  });
});

describe("가짜 인증(E2E용): Cognito와 같은 규칙", () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    });
  });

  it("가입 → 인증 전 로그인은 코드 확인 → 코드 확인 → 로그인 → 로그아웃", async () => {
    const c = fakeAuthClient();
    await c.signUp("a@example.com", "abc12345");
    await expect(c.signUp("a@example.com", "abc12345")).rejects.toMatchObject({ name: "UsernameExistsException" });
    expect(await c.signIn("a@example.com", "abc12345")).toBe("confirm");
    await expect(c.confirmSignUp("a@example.com", "000000")).rejects.toMatchObject({ name: "CodeMismatchException" });
    await c.confirmSignUp("a@example.com", FAKE_CODE);
    await expect(c.signIn("a@example.com", "wrong1234")).rejects.toMatchObject({ name: "NotAuthorizedException" });
    expect(await c.signIn("a@example.com", "abc12345")).toBe("done");
    expect(await c.currentUser()).toEqual({ email: "a@example.com", provider: "email" });
    await c.signOut();
    expect(await c.currentUser()).toBeNull();
  });

  it("서버 정책은 8자+숫자: 숫자가 없으면 거부, 영문이 없어도 서버는 받는다", async () => {
    const c = fakeAuthClient();
    await expect(c.signUp("b@example.com", "abcdefgh")).rejects.toMatchObject({ name: "InvalidPasswordException" });
    await expect(c.signUp("b@example.com", "12345678")).resolves.toBeUndefined();
  });

  it("비밀번호 재설정: 코드가 맞아야 바뀌고, 없는 이메일은 코드 단계에서 실패", async () => {
    const c = fakeAuthClient();
    await c.signUp("c@example.com", "abc12345");
    await c.confirmSignUp("c@example.com", FAKE_CODE);
    await expect(c.resetPassword("nobody@example.com")).resolves.toBeUndefined();
    await expect(c.confirmResetPassword("nobody@example.com", FAKE_CODE, "new12345")).rejects.toMatchObject({ name: "CodeMismatchException" });
    await c.confirmResetPassword("c@example.com", FAKE_CODE, "new12345");
    expect(await c.signIn("c@example.com", "new12345")).toBe("done");
  });
});

describe("저장된 로그인 확인(랜딩에서 Amplify 없이)", () => {
  const storage = (entries: Record<string, string>) => {
    const keys = Object.keys(entries);
    return { length: keys.length, key: (i: number) => keys[i] ?? null, getItem: (k: string) => entries[k] ?? null };
  };

  it("Cognito 마지막 사용자 키가 있으면 로그인한 것으로 본다", () => {
    expect(hasStoredSession(storage({ "CognitoIdentityServiceProvider.abc123.LastAuthUser": "u1" }))).toBe(true);
  });

  it("다른 키·빈 값·비슷한 이름은 로그인으로 보지 않는다", () => {
    expect(hasStoredSession(storage({}))).toBe(false);
    expect(hasStoredSession(storage({ "CognitoIdentityServiceProvider.abc123.LastAuthUser": "" }))).toBe(false);
    expect(hasStoredSession(storage({ "CognitoIdentityServiceProvider.abc123.u1.idToken": "x", theme: "dark" }))).toBe(false);
  });

  it("가짜 인증 세션(테스트 빌드)도 로그인으로 본다", () => {
    expect(hasStoredSession(storage({ "fake-auth-session": "a@example.com" }))).toBe(true);
  });

  it("저장소를 못 쓰면 로그인하지 않은 것으로 본다", () => {
    const broken = { length: 1, key: () => { throw new Error("denied"); }, getItem: () => { throw new Error("denied"); } };
    expect(hasStoredSession(broken)).toBe(false);
  });
});
