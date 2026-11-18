import { describe, expect, it } from "vitest";
import { shouldReload } from "./reloadOnStaleChunk.ts";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("옛 청크 새로고침 1회 제한", () => {
  it("처음엔 새로고침, 1분 안에 다시 실패하면 안 함, 1분 뒤엔 다시 허용", () => {
    const s = memory();
    expect(shouldReload(s, 1_000_000)).toBe(true);
    expect(shouldReload(s, 1_030_000)).toBe(false);
    expect(shouldReload(s, 1_070_000)).toBe(true);
  });

  it("저장소가 없거나, 던지거나, 쓰기가 무시되면 새로고침하지 않는다", () => {
    expect(shouldReload(undefined, 1)).toBe(false);
    const throwing = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => {} };
    expect(shouldReload(throwing, 1)).toBe(false);
    const setThrows = { getItem: () => null, setItem: () => { throw new Error("QuotaExceeded"); } };
    expect(shouldReload(setThrows, 1)).toBe(false);
    const ignored = { getItem: () => null, setItem: () => {} };
    expect(shouldReload(ignored, 1)).toBe(false);
  });
});
