import { describe, expect, it } from "vitest";
import { readSpeed, writeSpeed } from "./speedStore.ts";

describe("재생 속도 기억", () => {
  it("저장한 속도를 읽고, 없거나 엉뚱한 값이면 1×", () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(readSpeed(s)).toBe(1);
    writeSpeed(1.5, s);
    expect(readSpeed(s)).toBe(1.5);
    m.set("playback-speed", "9");
    expect(readSpeed(s)).toBe(1);
  });

  it("저장소가 없거나 던져도 깨지지 않는다", () => {
    const throwing = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); } };
    expect(readSpeed(throwing)).toBe(1);
    expect(() => writeSpeed(2, throwing)).not.toThrow();
    expect(readSpeed(undefined)).toBe(1);
  });
});
