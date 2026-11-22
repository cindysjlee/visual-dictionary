import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIXED, figureChars } from "./subset-hand-font.ts";

const csrf = JSON.parse(readFileSync(new URL("../content/terms/csrf.json", import.meta.url), "utf8"));

describe("그림 1 손글씨 글자 모으기", () => {
  it("그림에 그려지는 필드와 고정 문구의 글자는 넣고, 자막(caption)에만 있는 글자는 뺀다", () => {
    const chars = figureChars([csrf]);
    for (const ch of "은행 서버쿠키 보관함숨은 폼POST" + FIXED) expect(chars.has(ch)).toBe(true);
    const captionOnly = [...new Set([...JSON.stringify(csrf)])].filter((ch) => !chars.has(ch) && /[가-힣]/.test(ch));
    expect(captionOnly.length).toBeGreaterThan(0);
  });
});
