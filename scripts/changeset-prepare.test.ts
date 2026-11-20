// changeset:prepare 인자 검사: 스택 하나와 이름만, 실행·승인 옵션은 받지 않는다
import { describe, expect, it } from "vitest";
import { parseArgs } from "./changeset-prepare.ts";

describe("changeset:prepare 인자", () => {
  it("스택 하나와 선택적 이름만 받는다(기본 이름 review)", () => {
    expect(parseArgs(["VisualDictionaryApi"])).toEqual({ stack: "VisualDictionaryApi", name: "review" });
    expect(parseArgs(["VisualDictionaryCi", "ci-trust"])).toEqual({ stack: "VisualDictionaryCi", name: "ci-trust" });
  });

  it("실행·승인 옵션과 모든 옵션 인자를 거부한다", () => {
    for (const bad of ["--method=execute-change-set", "--require-approval", "--execute", "-c"]) expect(() => parseArgs(["VisualDictionaryApi", bad])).toThrow(/옵션은 받지 않습니다/);
    expect(() => parseArgs(["--all"])).toThrow(/옵션은 받지 않습니다/);
  });

  it("모르는 스택, 빈 인자, 인자 과다, 이름 형식 오류를 거부한다", () => {
    expect(() => parseArgs([])).toThrow(/스택은/);
    expect(() => parseArgs(["OtherStack"])).toThrow(/스택은/);
    expect(() => parseArgs(["VisualDictionaryApi", "a", "b"])).toThrow(/너무 많습니다/);
    expect(() => parseArgs(["VisualDictionaryApi", "bad name"])).toThrow(/형식/);
  });
});
