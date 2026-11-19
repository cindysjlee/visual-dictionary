import { describe, expect, it } from "vitest";
import { daysAgoLabel, recentTerms } from "./recent.ts";

describe("최근 본 용어 표시", () => {
  const now = new Date(2026, 10, 20, 9, 0); // 현지 시간 기준
  it("오늘·어제·n일 전(현지 날짜 경계)", () => {
    expect(daysAgoLabel(new Date(2026, 10, 20, 0, 5).toISOString(), now)).toBe("오늘");
    expect(daysAgoLabel(new Date(2026, 10, 19, 23, 59).toISOString(), now)).toBe("어제");
    expect(daysAgoLabel(new Date(2026, 10, 13, 12, 0).toISOString(), now)).toBe("7일 전");
  });

  it("목록에 없는 용어는 빼고, 최신순 그대로 limit개", () => {
    const index = [{ id: "csrf" }, { id: "xss" }, { id: "ssrf" }];
    const recent = [
      { termId: "xss", viewedAt: "3" },
      { termId: "retired-term", viewedAt: "2" },
      { termId: "csrf", viewedAt: "1" },
      { termId: "ssrf", viewedAt: "0" },
    ];
    expect(recentTerms(recent, index, 2).map((r) => r.term.id)).toEqual(["xss", "csrf"]);
  });
});
