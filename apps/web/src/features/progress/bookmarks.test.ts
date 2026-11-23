import { describe, expect, it } from "vitest";
import { bookmarkIds } from "./bookmarks.ts";

const view = (termId: string, viewedAt: string) => ({ termId, viewedAt });

describe("책갈피 규칙", () => {
  it("열어 보고 완독하지 않은 용어에 책갈피(최근 본 순서)", () => {
    expect(bookmarkIds({}, [view("xss", "2026-11-24T10:00:00Z"), view("csrf", "2026-11-24T09:00:00Z")])).toEqual(["xss", "csrf"]);
  });

  it("완독하면 책갈피가 사라진다(끝까지 재생이든 버튼이든)", () => {
    const records = { csrf: { read: true, source: "completed" as const, at: "2026-11-24T09:05:00Z" } };
    expect(bookmarkIds(records, [view("csrf", "2026-11-24T09:00:00Z")])).toEqual([]);
  });

  it("완독을 취소해도 책갈피는 되살아나지 않는다", () => {
    const records = { csrf: { read: false, source: "manual" as const, at: "2026-11-24T09:10:00Z" } };
    expect(bookmarkIds(records, [view("csrf", "2026-11-24T09:00:00Z")])).toEqual([]);
  });

  it("취소한 뒤 다시 열면 책갈피가 꽂힌다", () => {
    const records = { csrf: { read: false, source: "manual" as const, at: "2026-11-24T09:10:00Z" } };
    expect(bookmarkIds(records, [view("csrf", "2026-11-25T08:00:00Z")])).toEqual(["csrf"]);
  });

  it("완독한 용어는 다시 열어도 책갈피 없음", () => {
    const records = { csrf: { read: true, source: "manual" as const, at: "2026-11-24T09:10:00Z" } };
    expect(bookmarkIds(records, [view("csrf", "2026-11-25T08:00:00Z")])).toEqual([]);
  });
});
