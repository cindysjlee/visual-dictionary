// 랜딩 그림 1의 손글씨(Gaegu 700)를 쓰는 글자만 남기고 잘라낸다.
// 글자 출처: 용어 JSON에서 그림에 그려지는 필드(이름·사이트·화면 제목/줄·봉투 라벨·검사 결과) + 그림의 고정 문구 + 영숫자.
// @fontsource/gaegu의 조각(woff2, unicode-range별)마다 필요한 글자만 남긴 작은 woff2를 만들고 @font-face CSS를 쓴다.
// 출력: apps/web/generated/hand-font/ (styles/dictionary.css가 @import, 빌드마다 다시 만든다)
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";

/** 그림(SketchFigure.tsx)이 손글씨로 쓰는 고정 문구. 그림에 새 문구를 넣으면 여기에도 넣는다 */
export const FIXED = "검문소 잔액 원 휙! 뿅! 착! 쾅! 안 붙어! 짤랑! 스윽 ₩→·…";
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");
// 그림에 그려지는 필드(자막·설명처럼 고딕으로 쓰는 긴 글은 빼서 글자 수를 줄인다)
const DRAWN = new Set(["name", "site", "title", "lines", "label", "returnLabel", "result"]);

export function figureChars(terms: unknown[]): Set<string> {
  const out = new Set<string>([...FIXED, ...ASCII]);
  const walk = (v: unknown, key?: string) => {
    if (typeof v === "string") {
      if (key && DRAWN.has(key)) for (const ch of v) out.add(ch);
    } else if (Array.isArray(v)) for (const x of v) walk(x, key);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  for (const t of terms) {
    const term = t as { scenario?: unknown; defenses?: unknown };
    walk(term.scenario);
    walk(term.defenses);
  }
  return out;
}

/** "U+ac00-ac0f,U+20" → 범위 목록 */
const ranges = (s: string) =>
  s.split(",").map((r) => {
    const [a, b] = r.trim().replace(/^U\+/i, "").split("-");
    return [parseInt(a!, 16), parseInt(b ?? a!, 16)] as const;
  });

export async function subsetHandFont(terms: unknown[]) {
  const require = createRequire(import.meta.url);
  const cssPath = require.resolve("@fontsource/gaegu/700.css");
  const css = readFileSync(cssPath, "utf8");
  const chars = [...figureChars(terms)];
  const outDir = fileURLToPath(new URL("../apps/web/generated/hand-font/", import.meta.url));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const faces: string[] = [];
  let before = 0;
  let after = 0;
  let n = 0;
  for (const block of css.split("@font-face").slice(1)) {
    const file = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/)?.[1];
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1];
    if (!file || !range) continue;
    const rs = ranges(range);
    const mine = chars.filter((ch) => rs.some(([a, b]) => ch.codePointAt(0)! >= a && ch.codePointAt(0)! <= b));
    if (mine.length === 0) continue;
    const src = readFileSync(join(dirname(cssPath), "files", file));
    const sub = await subsetFont(src, mine.join(""), { targetFormat: "woff2" });
    before += src.length;
    after += sub.length;
    const name = `gaegu-hand-${n++}.woff2`;
    writeFileSync(join(outDir, name), sub);
    const uni = mine.map((ch) => `U+${ch.codePointAt(0)!.toString(16)}`).join(",");
    faces.push(`@font-face{font-family:"Gaegu Hand";font-style:normal;font-weight:700;font-display:swap;src:url(./${name}) format("woff2");unicode-range:${uni};}`);
  }
  writeFileSync(join(outDir, "hand-font.css"), `/* 생성 파일(scripts/subset-hand-font.ts). 고치지 말 것 */\n${faces.join("\n")}\n`);
  return { chars: chars.length, files: n, before, after };
}
