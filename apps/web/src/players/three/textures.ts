// 탭 화면·도장·내용 카드의 글자를 캔버스 텍스처로 그린다(실제 3D 면이라 뒤집기·가림이 자연스럽다). 글꼴은 지면 본문과 같은 --font-body(팔레트 c.font)
import { CanvasTexture, SRGBColorSpace } from "three";
import type { Palette } from "./tokens.ts";
import type { Screen } from "./sceneState.ts";

/** 글자를 쓰기 전에 그 글자가 든 글꼴 조각(unicode-range)을 받게 한다. 다 받으면 usePalette가 팔레트를 다시 읽어 장면이 다시 칠한다 */
function fill(g: CanvasRenderingContext2D, text: string, x: number, y: number, max?: number) {
  if (!document.fonts.check(g.font, text)) void document.fonts.load(g.font, text).catch(() => {});
  if (max === undefined) g.fillText(text, x, y);
  else g.fillText(text, x, y, max);
}

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, ctx: canvas.getContext("2d")!, texture };
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

export type Painter = ReturnType<typeof makeCanvas>;

export function screenPainter() {
  return makeCanvas(640, 440);
}

/** 탭 화면: 주소 막대 + 제목 + 줄들. 공격 쪽이면 주소 점과 줄무늬를 공격색으로 */
export function paintScreen(p: Painter, screen: Screen | undefined, site: string | undefined, tone: "attack" | "neutral", c: Palette) {
  const { ctx: g, canvas } = p;
  const { width: w, height: h } = canvas;
  g.clearRect(0, 0, w, h);
  g.fillStyle = c.paper;
  roundRect(g, 0, 0, w, h, 28);
  g.fill();
  // 주소 막대는 연한 판 색(어두운 막대 위 회색 글자는 대비 미달이었다, DF-48)
  g.fillStyle = c.paperDim;
  roundRect(g, 24, 22, w - 48, 52, 26);
  g.fill();
  g.fillStyle = tone === "attack" ? c.inkAttack : c.inkDefense;
  g.beginPath();
  g.arc(56, 48, 11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = c.inkMuted;
  g.font = `500 26px ${c.font}`;
  fill(g, site ?? "", 80, 57);
  if (screen?.title) {
    g.fillStyle = tone === "attack" ? c.inkAttack : c.ink;
    g.font = `800 52px ${c.font}`;
    fill(g, screen.title, 40, 150, w - 80);
  }
  g.font = `500 32px ${c.font}`;
  (screen?.lines ?? []).forEach((line, i) => {
    g.fillStyle = c.ink;
    fill(g, line, 40, 210 + i * 54, w - 80);
  });
  p.texture.needsUpdate = true;
}

export function paintStamp(p: Painter, text: string, c: Palette, tone: "attack" | "defense" = "defense") {
  const { ctx: g, canvas } = p;
  const { width: w, height: h } = canvas;
  g.clearRect(0, 0, w, h);
  g.fillStyle = c.paper;
  roundRect(g, 10, 10, w - 20, h - 20, 36);
  g.fill();
  const ink = tone === "attack" ? c.inkAttack : c.inkDefense;
  g.lineWidth = 14;
  g.strokeStyle = ink;
  g.stroke();
  g.fillStyle = ink;
  g.font = `800 ${Math.min(110, (w - 80) / Math.max(4, text.length * 0.62))}px ${c.font}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  fill(g, text, w / 2, h / 2 + 4, w - 60);
  g.textAlign = "start";
  g.textBaseline = "alphabetic";
  p.texture.needsUpdate = true;
}

export function paintCard(p: Painter, lines: readonly string[], c: Palette) {
  const { ctx: g, canvas } = p;
  const { width: w, height: h } = canvas;
  g.clearRect(0, 0, w, h);
  g.fillStyle = c.paper;
  roundRect(g, 0, 0, w, h, 24);
  g.fill();
  g.font = `600 30px ${c.font}`;
  lines.forEach((line, i) => {
    g.fillStyle = /없음|비어/.test(line) ? c.inkDefense : i === 0 ? c.ink : c.inkMuted;
    fill(g, line, 32, 64 + i * 56, w - 64);
  });
  p.texture.needsUpdate = true;
}

/** 크기를 정해 만드는 글자 판(스택형 코드 판·프레임 판 등) */
export const canvasPainter = (w: number, h: number) => makeCanvas(w, h);

/** 코드 판: 줄 번호와 코드, 지금 실행 중인 줄 강조, 반환 주소인 줄에 ↩ 표시 */
export function paintCode(p: Painter, title: string | undefined, lines: readonly string[], current: number | undefined, returnLines: ReadonlySet<number>, c: Palette) {
  const { ctx: g, canvas } = p;
  const { width: w, height: h } = canvas;
  const top = 96;
  const lh = (h - top - 24) / Math.max(1, lines.length);
  g.clearRect(0, 0, w, h);
  g.fillStyle = c.paper;
  roundRect(g, 0, 0, w, h, 28);
  g.fill();
  g.fillStyle = c.inkMuted;
  g.font = `600 30px ${c.font}`;
  fill(g, title ?? "", 32, 58);
  lines.forEach((line, i) => {
    const y = top + i * lh;
    if (current === i + 1) {
      // 실행 중인 줄: 연한 판 색 바탕 + 방어색 ▶(기호 3:1 이상)
      g.fillStyle = c.paperDim;
      roundRect(g, 16, y, w - 32, lh - 6, 12);
      g.fill();
      g.fillStyle = c.inkDefense;
      fill(g, "▶", 20, y + lh * 0.68);
    }
    if (returnLines.has(i + 1)) {
      g.fillStyle = c.inkSymbol;
      g.font = `700 30px ${c.font}`;
      fill(g, "↩", w - 64, y + lh * 0.68);
    }
    g.fillStyle = c.inkMuted;
    g.font = `500 26px ${c.font}`;
    fill(g, String(i + 1).padStart(2, " "), 56, y + lh * 0.66);
    // 판은 두 테마 모두 밝은 종이색이라 글자는 장면 글자 토큰(두 테마 모두 어두운 값, DF-47·48)
    g.fillStyle = c.ink;
    g.font = `${current === i + 1 ? 700 : 500} 30px ui-monospace, Consolas, ${c.font}`;
    fill(g, line, 108, y + lh * 0.68, w - 190);
  });
  p.texture.needsUpdate = true;
}

/** 프레임 앞면: 호출식 + 지역 변수 칸. 맨 위(실행 중)가 아니면 연한 판·점선 테두리·흐린 글자색으로(투명도는 대비를 깎아 쓰지 않는다, DF-48) */
export function paintFrame(p: Painter, call: string, locals: readonly { name: string; value: string }[], running: boolean, c: Palette) {
  const { ctx: g, canvas } = p;
  const { width: w, height: h } = canvas;
  g.clearRect(0, 0, w, h);
  g.fillStyle = running ? c.paper : c.paperDim;
  roundRect(g, 5, 5, w - 10, h - 10, 24);
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = running ? c.inkDefense : c.inkMuted;
  g.setLineDash(running ? [] : [26, 18]);
  g.stroke();
  g.setLineDash([]);
  const strong = running ? c.ink : c.inkMuted;
  g.fillStyle = strong;
  g.font = `800 64px ui-monospace, Consolas, ${c.font}`;
  fill(g, call, 32, 96, w * 0.4);
  g.font = `700 54px ui-monospace, Consolas, ${c.font}`;
  locals.forEach((l, i) => {
    const x = w * 0.45;
    const y = 86 + i * 84;
    g.fillStyle = c.inkMuted;
    fill(g, l.name, x, y, w * 0.16);
    g.fillStyle = l.value.includes("▢") || l.value === "?" ? c.inkMuted : strong;
    fill(g, `= ${l.value}`, x + w * 0.17, y, w * 0.36);
  });
  p.texture.needsUpdate = true;
}

export function signPainter() {
  return makeCanvas(512, 128);
}

/** 간판·주소판: 사이트 이름(행위자 site)을 크게. 라벨이 가려져도 건물만 보고 구분되게 한다. 공격 쪽은 공격색 테두리 */
export function paintSign(p: Painter, text: string, tone: "attack" | "neutral", c: Palette) {
  const { ctx: g, canvas } = p;
  const { width: w, height: h } = canvas;
  g.clearRect(0, 0, w, h);
  g.fillStyle = c.paper;
  roundRect(g, 4, 4, w - 8, h - 8, 22);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = tone === "attack" ? c.inkAttack : c.objectDim;
  g.stroke();
  g.fillStyle = tone === "attack" ? c.inkAttack : c.ink;
  g.font = `700 ${Math.min(64, (w - 48) / Math.max(4, text.length * 0.56))}px ${c.font}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  fill(g, text, w / 2, h / 2 + 3, w - 40);
  g.textAlign = "start";
  g.textBaseline = "alphabetic";
  p.texture.needsUpdate = true;
}
