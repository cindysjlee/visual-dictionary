import { afterEach, describe, expect, it, vi } from "vitest";
import { readStoredTheme, storeTheme } from "./theme.ts";

const fakeStorage = (impl: Partial<Storage>) => vi.stubGlobal("localStorage", impl);

afterEach(() => vi.unstubAllGlobals());

describe("theme storage", () => {
  it("저장된 light/dark만 인정한다", () => {
    fakeStorage({ getItem: () => "dark" });
    expect(readStoredTheme()).toBe("dark");
    fakeStorage({ getItem: () => "purple" });
    expect(readStoredTheme()).toBeNull();
  });

  it("저장소 접근이 막혀도 예외를 던지지 않는다", () => {
    const blocked = () => {
      throw new Error("SecurityError");
    };
    fakeStorage({ getItem: blocked, setItem: blocked });
    expect(readStoredTheme()).toBeNull();
    expect(() => storeTheme("light")).not.toThrow();
  });
});
