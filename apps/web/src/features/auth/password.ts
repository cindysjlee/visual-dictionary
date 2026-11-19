// 비밀번호 조건(FR-AUTH-02): 8자 이상, 영문과 숫자 포함. 서버(Cognito)는 8자 + 숫자만 강제하고 "영문 포함"은 여기서만 검사한다(docs/03)
export const PASSWORD_RULES = [
  { id: "length", label: "8자 이상", test: (pw: string) => pw.length >= 8 },
  { id: "letter", label: "영문 포함", test: (pw: string) => /[A-Za-z]/.test(pw) },
  { id: "digit", label: "숫자 포함", test: (pw: string) => /[0-9]/.test(pw) },
] as const;

/** 지키지 못한 조건의 이름들. 비어 있으면 통과 */
export const passwordProblems = (pw: string) => PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.label);
