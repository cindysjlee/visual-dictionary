import { describe, expect, it } from "vitest";
import { josa } from "./LandingPage.tsx";

describe("josa", () => {
  it("받침이 있으면 앞 조사, 없으면 뒤 조사", () => {
    expect(josa("클릭재킹", "은", "는")).toBe("클릭재킹은");
    expect(josa("데드락", "을", "를")).toBe("데드락을");
    expect(josa("콜 스택", "은", "는")).toBe("콜 스택은");
    expect(josa("SQL 인젝션", "은", "는")).toBe("SQL 인젝션은");
    expect(josa("스택 오버플로", "을", "를")).toBe("스택 오버플로를");
  });
  it("영문으로 끝나면 받침 없는 쪽", () => {
    expect(josa("CSRF", "은", "는")).toBe("CSRF는");
  });
});
