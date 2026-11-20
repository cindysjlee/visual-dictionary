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

export function paintStamp(p: Painter, text: string, c: Palette, tone: "attack" | "defense" = "defense") {
  const { ctx: g, canvas } = p;
  const { width: w, height: h } = canvas;
  g.clearRect(0, 0, w, h);
  g.fillStyle = c.paper;
  roundRect(g, 10, 10, w - 20, h - 20, 36);
  g.fill();
  g.lineWidth = 14;
  g.strokeStyle = c[tone];
  g.stroke();
  g.fillStyle = c[tone];
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
  g.fillStyle = c.textMuted;
  g.font = `600 30px ${FONT}`;
  g.fillText(title ?? "", 32, 58);
  lines.forEach((line, i) => {
    const y = top + i * lh;
    if (current === i + 1) {
      g.fillStyle = c.neutral;
      g.globalAlpha = 0.18;
      roundRect(g, 16, y, w - 32, lh - 6, 12);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = c.neutral;
      g.fillText("▶", 20, y + lh * 0.68);
    }
    if (returnLines.has(i + 1)) {
      g.fillStyle = c.gold;
      g.font = `700 30px ${FONT}`;
      g.fillText("↩", w - 64, y + lh * 0.68);
    }
    g.fillStyle = c.textMuted;
    g.font = `500 26px ${FONT}`;
    g.fillText(String(i + 1).padStart(2, " "), 56, y + lh * 0.66);
    // 판은 두 테마 모두 밝은 종이색이라 글자는 화면판 줄과 같은 어두운 토큰(c.text는 다크 테마에서 밝아 안 보인다)
    g.fillStyle = c.villain;
    g.font = `${current === i + 1 ? 700 : 500} 30px ui-monospace, Consolas, ${FONT}`;
    g.fillText(line, 108, y + lh * 0.68, w - 190);
  });
  p.texture.needsUpdate = true;
}

/** 프레임 앞면: 호출식 + 지역 변수 칸. 맨 위(실행 중)가 아니면 흐리게 */
export function paintFrame(p: Painter, call: string, locals: readonly { name: string; value: string }[], running: boolean, c: Palette) {
  const { ctx: g, canvas } = p;
  const { width: w, height: h } = canvas;
  g.clearRect(0, 0, w, h);
  g.fillStyle = c.paper;
  roundRect(g, 0, 0, w, h, 24);
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = running ? c.neutral : c.objectDim;
  g.stroke();
  g.globalAlpha = running ? 1 : 0.6;
  g.fillStyle = c.villain;
  g.font = `800 64px ui-monospace, Consolas, ${FONT}`;
  g.fillText(call, 32, 96, w * 0.4);
  g.font = `700 54px ui-monospace, Consolas, ${FONT}`;
  locals.forEach((l, i) => {
    const x = w * 0.45;
    const y = 86 + i * 84;
    g.fillStyle = c.textMuted;
    g.fillText(l.name, x, y, w * 0.16);
    g.fillStyle = l.value.includes("▢") || l.value === "?" ? c.textMuted : c.villain;
    g.fillText(`= ${l.value}`, x + w * 0.17, y, w * 0.36);
  });
  g.globalAlpha = 1;
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
  g.strokeStyle = tone === "attack" ? c.attack : c.objectDim;
  g.stroke();
  g.fillStyle = tone === "attack" ? c.attack : c.villain;
  g.font = `700 ${Math.min(64, (w - 48) / Math.max(4, text.length * 0.56))}px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 3, w - 40);
  g.textAlign = "start";
  g.textBaseline = "alphabetic";
  p.texture.needsUpdate = true;
}
