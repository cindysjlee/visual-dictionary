import { describe, expect, it } from "vitest";
import { explanationSchema } from "./index.ts";
import { markCount, noteWords, parseMarks, plainText } from "./marks.ts";

describe("본문 표시 문법", () => {
  it("==형광펜==과 `코드`를 조각으로 나누고, 표시를 뺀 글자를 돌려준다", () => {
    const s = "쿠키는 ==목적지만 보고 붙는다==. 헤더 `Set-Cookie`와 `a==b`";
    expect(parseMarks(s)).toEqual({
      segments: [
        { kind: "text", text: "쿠키는 " },
        { kind: "mark", text: "목적지만 보고 붙는다" },
        { kind: "text", text: ". 헤더 " },
        { kind: "code", text: "Set-Cookie" },
        { kind: "text", text: "와 " },
        { kind: "code", text: "a==b" },
      ],
    });
    expect(plainText(s)).toBe("쿠키는 목적지만 보고 붙는다. 헤더 Set-Cookie와 a==b");
    expect(markCount(s)).toBe(1);
  });

  it("각주 [[단어]]는 note 조각이 되고, 표시를 뺀 글자에는 단어만 남는다", () => {
    const s = "서버는 [[메타데이터 서비스]]에 닿고 `a[[0]]`는 코드다. ==핵심 문장==";
    expect(parseMarks(s).segments).toEqual([
      { kind: "text", text: "서버는 " },
      { kind: "note", text: "메타데이터 서비스" },
      { kind: "text", text: "에 닿고 " },
      { kind: "code", text: "a[[0]]" },
      { kind: "text", text: "는 코드다. " },
      { kind: "mark", text: "핵심 문장" },
    ]);
    expect(noteWords(s)).toEqual(["메타데이터 서비스"]);
    expect(plainText(s)).toBe("서버는 메타데이터 서비스에 닿고 a[[0]]는 코드다. 핵심 문장");
  });

  it.each([
    ["[[닫히지 않음", "닫히지 않은 각주"],
    ["[[ ]]", "빈 각주"],
    ["[[a`b]]", "각주 단어에는"],
    ["==형광펜 [[각주]] 안==", "형광펜(==) 안에는 각주"],
  ])("%s → 오류", (s, msg) => {
    expect(parseMarks(s).error).toContain(msg);
  });

  it.each([
    ["==닫히지 않음", "닫히지 않은 형광펜"],
    ["`열기만", "닫히지 않은 코드"],
    ["빈 ====", "빈 형광펜"],
    ["<b>굵게</b>", "HTML 태그"],
    ["<script>alert(1)</script>", "HTML 태그"],
    ["**굵게**", "허용하지 않는"],
    ["[링크](https://x)", "허용하지 않는"],
    ["==`코드` 섞기==", "코드 표기"],
  ])("%s → 오류", (s, msg) => {
    expect(parseMarks(s).error).toContain(msg);
  });

  it("스키마: 짝이 안 맞거나 형광펜이 두 군데면 설명 문단 검증이 실패한다", () => {
    const ok = (text: string) => explanationSchema.shape.how.safeParse([text, "둘째 문단이다."]).success;
    expect(ok("정상 ==한 군데== 문장, 크기 비교 a < b")).toBe(true);
    expect(ok("==하나== 그리고 ==둘==")).toBe(false);
    expect(ok("==짝 없음")).toBe(false);
  });
});
