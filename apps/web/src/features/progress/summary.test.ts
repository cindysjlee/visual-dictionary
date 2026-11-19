import { describe, expect, it } from "vitest";
import { passesReadFilter, summarize } from "./summary.ts";

const index = [
  { id: "csrf", category: "web-security" as const },
  { id: "xss", category: "web-security" as const },
  { id: "tcp-handshake", category: "network" as const },
  { id: "deadlock", category: "os" as const },
];

describe("진행률: 공개 용어 중 읽음 수 ÷ 공개 용어 수", () => {
  it("전체·카테고리별로 센다(카테고리 순서는 라벨 순서)", () => {
    const s = summarize(index, { csrf: { read: true }, deadlock: { read: true }, xss: { read: false } });
    expect(s.total).toEqual({ read: 2, all: 4 });
    expect(s.byCategory).toEqual([
      { category: "web-security", read: 1, all: 2 },
      { category: "network", read: 0, all: 1 },
      { category: "os", read: 1, all: 1 },
    ]);
  });

  it("목록에 없는(retired·draft) 용어의 기록은 세지 않는다", () => {
    expect(summarize(index, { "old-term": { read: true } }).total).toEqual({ read: 0, all: 4 });
  });

  it("읽음 필터", () => {
    expect([passesReadFilter("all", true), passesReadFilter("all", false)]).toEqual([true, true]);
    expect([passesReadFilter("read", true), passesReadFilter("read", false)]).toEqual([true, false]);
    expect([passesReadFilter("unread", true), passesReadFilter("unread", false)]).toEqual([false, true]);
  });
});
