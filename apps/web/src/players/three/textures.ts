// 탭 화면·도장·내용 카드의 글자를 캔버스 텍스처로 그린다(실제 3D 면이라 뒤집기·가림이 자연스럽다). 글꼴은 번들에 포함된 Noto Sans KR
import { CanvasTexture, SRGBColorSpace } from "three";
import type { Palette } from "./tokens.ts";
import type { Screen } from "./sceneState.ts";

const FONT = "'Noto Sans KR', system-ui, sans-serif";

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
  g.fillStyle = c.objectDim;
  roundRect(g, 24, 22, w - 48, 52, 26);
  g.fill();
  g.fillStyle = tone === "attack" ? c.attack : c.defense;
  g.beginPath();
  g.arc(56, 48, 11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = c.textMuted;
  g.font = `500 26px ${FONT}`;
  g.fillText(site ?? "", 80, 57);
  if (screen?.title) {
    g.fillStyle = tone === "attack" ? c.attack : c.villain;
    g.font = `800 52px ${FONT}`;
    g.fillText(screen.title, 40, 150, w - 80);
  }
  g.font = `500 32px ${FONT}`;
  (screen?.lines ?? []).forEach((line, i) => {
    g.fillStyle = c.villain;
    g.fillText(line, 40, 210 + i * 54, w - 80);
  });
  p.texture.needsUpdate = true;
}

export function paintStamp(p: Painter, text: string, c: Palette) {
  const { ctx: g, canvas } = p;
  const { width: w, height: h } = canvas;
  g.clearRect(0, 0, w, h);
  g.fillStyle = c.paper;
  roundRect(g, 10, 10, w - 20, h - 20, 36);
  g.fill();
  g.lineWidth = 14;
  g.strokeStyle = c.defense;
  g.stroke();
  g.fillStyle = c.defense;
  g.font = `800 ${Math.min(110, (w - 80) / Math.max(4, text.length * 0.62))}px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 4, w - 60);
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
  g.font = `600 30px ${FONT}`;
  lines.forEach((line, i) => {
    g.fillStyle = /없음|비어/.test(line) ? c.defense : i === 0 ? c.villain : c.textMuted;
    g.fillText(line, 32, 64 + i * 56, w - 64);
  });
  p.texture.needsUpdate = true;
}
