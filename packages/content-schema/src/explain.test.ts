import { describe, expect, it } from "vitest";
import { DRAFT_DESCRIPTION, explanationNoteWords, explanationParagraphs, partLabel, sentencesOf } from "./explain.ts";

const frame = { definition: "정의다.", analogy: ["비유 하나.", "비유 둘."], how: ["과정 [[가]].", "과정 둘."], why: ["이유 [[나]]."] };

describe("설명 틀 규칙", () => {
  it("문단을 정의 → 비유 → 과정 → 이유 순서로 돌려주고, 각주 단어를 나온 순서대로 모은다", () => {
    expect(explanationParagraphs(frame).map((p) => `${p.part}${p.index}`)).toEqual(["definition0", "analogy0", "analogy1", "how0", "how1", "why0"]);
    expect(explanationNoteWords(frame)).toEqual(["가", "나"]);
    expect(explanationNoteWords(DRAFT_DESCRIPTION)).toEqual([]);
  });

  it("마지막 부분 이름: 보안 용어는 왜 위험한가, 그 밖은 왜 중요한가", () => {
    expect(partLabel("why", { category: "web-security", defenses: [] })).toBe("왜 위험한가");
    expect(partLabel("why", { category: "network", defenses: [{ kind: "defense" }] })).toBe("왜 위험한가");
    expect(partLabel("why", { category: "os", defenses: [{ kind: "solution" }] })).toBe("왜 중요한가");
    expect(partLabel("why", { category: "network", defenses: [] })).toBe("왜 중요한가");
    expect(partLabel("how", { category: "os", defenses: [] })).toBe("어떻게 일어나나");
  });

  it("문장은 마침표 뒤 공백에서만 나눈다(주소의 점은 나누지 않는다)", () => {
    expect(sentencesOf("주소는 169.254.169.254이다. 둘째다! 셋째인가? 끝")).toEqual(["주소는 169.254.169.254이다.", "둘째다!", "셋째인가?", "끝"]);
    expect(sentencesOf("각주 [[단어]]는 단어만 센다.")).toEqual(["각주 단어는 단어만 센다."]);
  });
});
