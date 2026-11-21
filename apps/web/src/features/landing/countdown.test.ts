import { describe, expect, it } from "vitest";
import { balanceAt } from "./countdown.ts";

describe("랜딩 체험의 잔액 감소", () => {
  it("시작은 원래 잔액, 끝은 금액만큼 줄어든 잔액(넘지 않는다)", () => {
    expect(balanceAt(3_000_000, 2_000_000, 0, 900)).toBe(3_000_000);
    expect(balanceAt(3_000_000, 2_000_000, 900, 900)).toBe(2_000_000);
    expect(balanceAt(3_000_000, 2_000_000, 5000, 900)).toBe(2_000_000);
  });

  it("시계가 뒤로 가도(음수 경과) 원래 잔액보다 커지지 않는다", () => {
    expect(balanceAt(3_000_000, 2_000_000, -500, 900)).toBe(3_000_000);
  });

  it("중간에는 단조롭게 줄어든다(감속)", () => {
    const values = [0, 150, 300, 450, 600, 750, 900].map((ms) => balanceAt(3_000_000, 2_000_000, ms, 900));
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeLessThanOrEqual(values[i - 1]!);
    expect(values[3]!).toBeLessThan(2_200_000); // 절반 시점에 이미 87% 넘게 줄었다
  });
});
