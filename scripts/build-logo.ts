// 로고 만들기(한 번 돌려 결과를 커밋한다. 빌드 때마다 돌지 않는다). 기준 시안: docs/design/logo-icons.html "2. ¶ 문단 기호"
//   1) Noto Serif KR(@fontsource, woff)에서 글리프를 윤곽선으로 뽑아 apps/web/src/logo/logoPaths.ts 를 만든다(글꼴 없이도 똑같이 보이게). 다 읽음 도장의 "完"도 여기서
//   2) 파비콘: apps/web/static/favicon.svg(작은 크기 전용 판, 다크 탭 대응), favicon.ico(16·32), apple-touch-icon.png(180)
// opentype.js는 프로젝트 의존성이 아니다. 임시 폴더에 받아 경로를 넘긴다:
//   npm i --prefix <임시 폴더> opentype.js@1.3.4
//   node scripts/build-logo.ts --opentype <임시 폴더>/node_modules/opentype.js
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));
const arg = process.argv.indexOf("--opentype");
if (arg < 0 || !process.argv[arg + 1]) {
  console.error("사용법: node scripts/build-logo.ts --opentype <opentype.js 패키지 폴더>");
  process.exit(1);
}
const opentype = createRequire(import.meta.url)(process.argv[arg + 1]!);

// 굵기별 @font-face(unicode-range로 나뉜 조각)에서 글자가 든 woff를 찾는다
const fontDir = join(root, "node_modules/@fontsource/noto-serif-kr");
type Face = { file: string; ranges: [number, number][] };
const facesOf = (weight: number): Face[] =>
  [...readFileSync(join(fontDir, `${weight}.css`), "utf8").matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => ({
    file: /url\(\.\/(files\/[^)]+\.woff)\) format\('woff'\)/.exec(body!)![1]!,
    ranges: /unicode-range:\s*([^;]+);/
      .exec(body!)![1]!
      .split(",")
      .map((r) => {
        const [a, b] = r.trim().replace(/^U\+/i, "").split("-");
        return [parseInt(a!, 16), parseInt(b ?? a!, 16)] as [number, number];
      }),
  }));
const cache = new Map<string, any>();
function fontFor(weight: number, code: number) {
  const face = facesOf(weight).find((f) => f.ranges.some(([a, b]) => code >= a && code <= b));
  if (!face) throw new Error(`글꼴 조각에 없는 글자: U+${code.toString(16)}`);
  if (!cache.has(face.file)) {
    const buf = readFileSync(join(fontDir, face.file));
    cache.set(face.file, opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
  }
  return cache.get(face.file);
}

type Cmd = { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };
/** 짧은 path 문자열: 좌표를 step 단위로 반올림한 뒤(절대값 기준이라 오차가 쌓이지 않는다) 상대 명령(m·l·q·c·z)으로 쓴다(홈 묶음 크기) */
function compact(cmds: Cmd[], step = 0.5) {
  const q = (v: number) => Math.round(v / step) * step;
  const n = (v: number) => {
    const t = String(+v.toFixed(2)).replace(/^(-?)0\./, "$1.");
    return t.startsWith("-") ? t : ` ${t}`;
  };
  let out = "";
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  for (const c of cmds) {
    if (c.type === "Z") {
      out += "z";
      [cx, cy] = [sx, sy];
      continue;
    }
    const pts = c.type === "C" ? [[c.x1!, c.y1!], [c.x2!, c.y2!], [c.x!, c.y!]] : c.type === "Q" ? [[c.x1!, c.y1!], [c.x!, c.y!]] : [[c.x!, c.y!]];
    const abs = pts.map(([x, y]) => [q(x!), q(y!)] as const);
    if (c.type !== "M" && abs.every(([x, y]) => x === cx && y === cy)) continue; // 반올림 뒤 길이 0인 선분은 뺀다
    out += c.type.toLowerCase() + abs.map(([x, y]) => n(x - cx) + n(y - cy)).join("");
    [cx, cy] = abs.at(-1)!;
    if (c.type === "M") [sx, sy] = [cx, cy];
  }
  return out.replace(/([a-z]) /g, "$1");
}

/** 글자를 하나씩 윤곽선으로(한글 조각이 글자마다 다를 수 있어 글자 단위. 자간은 시안의 letter-spacing) */
function outline(text: string, o: { weight: number; size: number; x: number; y: number; spacing: number }) {
  let x = o.x;
  const cmds: Cmd[] = [];
  for (const ch of text) {
    const font = fontFor(o.weight, ch.codePointAt(0)!);
    const glyph = font.charToGlyph(ch);
    cmds.push(...glyph.getPath(x, o.y, o.size).commands);
    x += (glyph.advanceWidth * o.size) / font.unitsPerEm + o.spacing;
  }
  return { d: compact(cmds), end: x - o.spacing };
}

// ── 글자 로고(시안 word(): x 10, 기준선 72, 54px 900, 자간 -1 / 원어 x 12, 기준선 102, 13px 700, 자간 1.5) ──
const word = outline("시각화 사전", { weight: 900, size: 54, x: 10, y: 72, spacing: -1 });
const sigak = outline("시각화", { weight: 900, size: 54, x: 10, y: 72, spacing: -1 });
const sub = outline("視覺化辭典 · visual dictionary", { weight: 700, size: 13, x: 12, y: 102, spacing: 1.5 });
const hx = Math.round(sigak.end) + 4; // 형광펜 끝: "시각화" 끝보다 조금 길게(시안 170~172)
// 낮: 글자 아래 절반을 덮는 비스듬한 띠(시안 그대로). 밤: 글자 아래로 내린 굵은 밑줄(사이트 본문의 밤 형광펜과 같은 방식)
const wordHl = `M8 53L${hx} 47L${hx + 2} 74L10 79Z`;
const wordUl = `M8 80L${hx} 76L${hx + 1} 83L9 87Z`;

// ── ¶ 아이콘(0~100, 시안 g2(): 82px 900, 가운데 50, 기준선 80) ──
function pilcrow(size: number, baseline: number): string {
  const font = fontFor(900, 0xb6);
  const glyph = font.charToGlyph("¶");
  const adv = (glyph.advanceWidth * size) / font.unitsPerEm;
  return compact(glyph.getPath(50 - adv / 2, baseline, size).commands);
}
/** ¶의 실제 윤곽이 위(top)~아래(bottom)에 꼭 맞는 크기·기준선 */
function pilcrowFit(top: number, bottom: number): string {
  const font = fontFor(900, 0xb6);
  const { yMin, yMax } = font.charToGlyph("¶").getMetrics();
  const size = ((bottom - top) * font.unitsPerEm) / (yMax - yMin);
  return pilcrow(size, top + (yMax * size) / font.unitsPerEm);
}
// 밤 밑줄은 ¶ 윤곽(82px: 18.7~90.5) 아래로 내린다(글자와 겹치지 않게)
const icon = { pil: pilcrow(82, 80), hl: "M14 64L86 50L88 70L16 84Z", ul: "M14 97L86 92L87 99L15 104Z" };
// 작은 크기(16·32px) 전용: ¶를 칸에 꽉 차게 키우고 형광펜·밑줄을 두껍게(가는 획이 뭉개지지 않게)
const small = { pil: pilcrowFit(2, 86), hl: "M6 58L94 40L96 72L8 90Z", ul: "M6 92L94 88L94 99L6 100Z" };

// ── 다 읽음 도장의 "完"(0~100 낙관 안, 900, 가운데 50): 시안 docs/design/readmark.html A ──
function wan(): string {
  const font = fontFor(900, "完".codePointAt(0)!);
  const glyph = font.charToGlyph("完");
  const size = 50;
  const adv = (glyph.advanceWidth * size) / font.unitsPerEm;
  return compact(glyph.getPath(50 - adv / 2, 68, size).commands);
}

const W = Math.ceil(104 + Math.max(word.end, sub.end) + 6); // 아이콘(104) + 글자 로고
mkdirSync(join(root, "apps/web/src/logo"), { recursive: true });
writeFileSync(
  join(root, "apps/web/src/logo/logoPaths.ts"),
  `// scripts/build-logo.ts가 만든 파일(손으로 고치지 않는다). Noto Serif KR 윤곽선, 시안 docs/design/logo-icons.html "2. ¶ 문단 기호"
/** 가로 조합 viewBox 폭(높이 112). 축약형(원어 표기 없음)은 COMPACT_W × 108 */
export const LOCKUP_W = ${W};
export const COMPACT_W = ${Math.ceil(104 + word.end + 6)};
/** ¶ 아이콘(0~100): 글자, 낮 형광펜 띠, 밤 밑줄 */
export const ICON = ${JSON.stringify(icon, null, 2)};
/** 글자 로고(가로 조합에서는 x 104만큼 옮긴다): 글자, 낮 형광펜 띠, 밤 밑줄. 원어 표기는 logoSub.ts(따로 불러온다) */
export const WORD = ${JSON.stringify({ text: word.d, hl: wordHl, ul: wordUl }, null, 2)};
/** 다 읽음 도장(features/dictionary/Seal.tsx)의 "完" 윤곽(0~100) */
export const SEAL_WAN = ${JSON.stringify(wan())};
`,
);
// 원어 표기(한자가 무거워 gzip 약 2KB): 넓은 화면의 가로 조합에서만 쓰는 장식이라 홈 묶음에서 빼고 동적 import
writeFileSync(
  join(root, "apps/web/src/logo/logoSub.ts"),
  `// scripts/build-logo.ts가 만든 파일(손으로 고치지 않는다). 로고 원어 표기 "視覺化辭典 · visual dictionary" 윤곽선(글자 로고 좌표)
export const SUB = ${JSON.stringify(sub.d)};
`,
);

// ── 파비콘: 사이트 토큰 값(tokens.css의 --la-*. 파비콘은 페이지 CSS를 못 읽어 값을 적는다) ──
const C = { light: { ink: "#141a28", mark: "#f6d965", paper: "#f2f4f7" }, dark: { ink: "#ece6d8", mark: "#e0b04a" } };
const staticDir = join(root, "apps/web/static");
writeFileSync(
  join(staticDir, "favicon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>.hl{fill:${C.light.mark}}.ul{display:none;fill:${C.dark.mark}}.p{fill:${C.light.ink}}@media (prefers-color-scheme:dark){.hl{display:none}.ul{display:inline}.p{fill:${C.dark.ink}}}</style><path class="hl" d="${small.hl}"/><path class="ul" d="${small.ul}"/><path class="p" d="${small.pil}"/></svg>\n`,
);

// PNG: 브라우저로 SVG를 그린다. ico는 테마를 모르니 둥근 종이 바탕(다크 탭에서도 보이게), 앱 아이콘은 iOS가 투명을 검게 채우므로 꽉 찬 종이 바탕
const tile = (s: typeof icon, size: number, kind: "ico" | "app") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><rect width="100" height="100" rx="${kind === "ico" ? 18 : 0}" fill="${C.light.paper}"/><g transform="${kind === "ico" ? "translate(5 5) scale(.9)" : "translate(10 8) scale(.8)"}"><path fill="${C.light.mark}" d="${s.hl}"/><path fill="${C.light.ink}" d="${s.pil}"/></g></svg>`;
const browser = await chromium.launch({ channel: "chrome" }); // E2E와 같은 설치된 Chrome(playwright.config.ts)
const page = await browser.newPage();
async function png(svg: string, size: number, transparent: boolean) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  return page.locator("svg").screenshot({ omitBackground: transparent });
}
const pngs = [await png(tile(small, 16, "ico"), 16, true), await png(tile(small, 32, "ico"), 32, true)];
writeFileSync(join(staticDir, "apple-touch-icon.png"), await png(tile(icon, 180, "app"), 180, false));
await browser.close();

// ico = PNG를 그대로 담은 아이콘 묶음(머리 6바이트 + 항목 16바이트씩 + PNG들)
const head = Buffer.alloc(6 + 16 * pngs.length);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(pngs.length, 4);
let offset = head.length;
pngs.forEach((p, i) => {
  const e = 6 + 16 * i;
  const size = [16, 32][i]!;
  head.writeUInt8(size, e);
  head.writeUInt8(size, e + 1);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(p.length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += p.length;
});
writeFileSync(join(staticDir, "favicon.ico"), Buffer.concat([head, ...pngs]));
console.log(`로고 생성: logoPaths.ts(가로 조합 폭 ${W}), static/favicon.svg·favicon.ico(16·32)·apple-touch-icon.png(180)`);
