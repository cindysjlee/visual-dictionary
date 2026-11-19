// 로그인·가입 뒤 돌아갈 곳(?next=). 사이트 안 경로만 허용해 열린 리디렉션을 막는다(docs/03 보안 메모)
// 허용: "/"로 시작 + 두 번째 글자가 "/"·"\"가 아님 + new URL(next, origin)의 origin이 현재 사이트와 같음. 아니면 "/"
export function safeNext(next: string | null | undefined, origin: string): string {
  if (!next || next[0] !== "/" || next[1] === "/" || next[1] === "\\") return "/";
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

/** 지금 화면으로 돌아오는 로그인 경로(예: /auth/login?next=%2Fterms%2Fcsrf) */
export const loginPath = (current: string) => `/auth/login?next=${encodeURIComponent(current)}`;
