// 용어 옆 그림의 공통 도형(docs/05 "그림 공통 도형"). 그림마다 같은 것은 늘 같은 모양으로 나오게, 도형은 여기서 한 번만 정의한다.
// SVG의 <use>·<symbol>은 그림 검사(checkFigureSvg)가 막으므로 파일 안에서 재사용하지 않고, 이 모듈이 요소를 풀어 쓴다.
// 색은 쓰지 않고 클래스 k-*만 쓴다(스타일은 styles/dictionary.css의 .la-tfig-svg). 좌표는 240×240 캔버스, 도형은 (cx, cy)가 가운데다.
//   그림 안 글자: 사람·기기 이름표는 도형 아래(LABEL_DY), 상자 모양 도형은 안쪽, 순서 번호는 화살표 위의 동그라미(tag)
//   색 역할: 중립(k-ink·k-soft·k-box·k-flow·k-fill) = 정상 흐름, 강조(k-acc*·k-boxa) = 문제·공격, 방어(k-def*) = 막는 쪽. 한 그림에 3가지를 넘기지 않는다
export type Tone = "ink" | "acc" | "def";

/** 소수 첫째 자리까지(파일 크기와 읽기 쉬움) */
export const n = (v: number) => String(Math.round(v * 10) / 10);
const P = (...v: number[]) => v.map(n).join(" ");

/** SVG 요소를 만드는 가장 작은 부품 */
export const path = (d: string, cls: string) => `<path class="${cls}" d="${d}"/>`;
export const rect = (x: number, y: number, w: number, h: number, rx: number, cls: string) =>
  `<rect class="${cls}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(rx)}"/>`;
export const circle = (cx: number, cy: number, r: number, cls: string) => `<circle class="${cls}" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`;
export const polygon = (pts: [number, number][], cls: string) => `<polygon class="${cls}" points="${pts.map(([x, y]) => `${n(x)},${n(y)}`).join(" ")}"/>`;
/** 가운데 정렬 글자(CSS가 정렬·크기를 준다). 이름·설명 같은 낱말(한글이거나 4자 넘게)은 작은 글자(k-t), 번호·A·B·100은 큰 글자 */
export const text = (x: number, y: number, s: string) => `<text${/[가-힣]/.test(s) || s.length > 3 ? ' class="k-t"' : ""} x="${n(x)}" y="${n(y + 0.5)}">${s}</text>`;

/** 도형 아래 이름표(A, B, C) 자리 */
export const LABEL_DY = 38;
const labelOf = (cx: number, cy: number, ch?: string) => (ch ? [text(cx, cy + LABEL_DY, ch)] : []);

/* ───── 화살표와 표식 ───── */
const ARROW = {
  ink: { line: "k-flow", dashed: "k-soft", head: "k-fill" },
  acc: { line: "k-acc", dashed: "k-accd", head: "k-accf" },
  def: { line: "k-defl", dashed: "k-defl", head: "k-deff" },
} as const;
const HEAD = { length: 11, half: 5.5 };

/** 끝(x2, y2)에 화살촉이 있는 곧은 화살표 */
export function arrow(x1: number, y1: number, x2: number, y2: number, tone: Tone = "ink", dashed = false): string[] {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const bx = x2 - ux * HEAD.length;
  const by = y2 - uy * HEAD.length;
  return [
    path(`M${P(x1, y1)}L${P(bx, by)}`, dashed ? ARROW[tone].dashed : ARROW[tone].line),
    polygon([[x2, y2], [bx - uy * HEAD.half, by + ux * HEAD.half], [bx + uy * HEAD.half, by - ux * HEAD.half]], ARROW[tone].head),
  ];
}

/** 제어점 (cx, cy)로 휘어지는 화살표 */
export function arrowQ(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, tone: Tone = "ink"): string[] {
  const len = Math.hypot(x2 - cx, y2 - cy);
  const ux = (x2 - cx) / len;
  const uy = (y2 - cy) / len;
  const bx = x2 - ux * HEAD.length;
  const by = y2 - uy * HEAD.length;
  return [
    path(`M${P(x1, y1)}Q${P(cx, cy)} ${P(bx, by)}`, ARROW[tone].line),
    polygon([[x2, y2], [bx - uy * HEAD.half, by + ux * HEAD.half], [bx + uy * HEAD.half, by - ux * HEAD.half]], ARROW[tone].head),
  ];
}

/** 두 점 사이의 t(0~1) 지점 */
export const along = (x1: number, y1: number, x2: number, y2: number, t: number): [number, number] => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
/** 휘는 선(제어점 하나)의 t 지점 */
export const alongQ = (x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number): [number, number] => [
  (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t ** 2 * x2,
  (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t ** 2 * y2,
];

/** 순서 번호(화살표 위 동그라미) */
export const tag = (cx: number, cy: number, k: number): string[] => [circle(cx, cy, 11, "k-box"), text(cx, cy, String(k))];
/** 막힘·불가 표시(강조색 가위표) */
export const xmark = (cx: number, cy: number, s = 8) => path(`M${P(cx - s, cy - s)}L${P(cx + s, cy + s)}M${P(cx + s, cy - s)}L${P(cx - s, cy + s)}`, "k-acc");

/* ───── 사람과 기기: 가운데 (cx, cy), 위아래 약 ±24. 이름표는 아래 ───── */
/** 사람. user = 정상 사용자(중립), attacker = 공격자(강조색 테두리) */
export function person(cx: number, cy: number, role: "user" | "attacker" = "user", ch?: string): string[] {
  const c = role === "attacker" ? "k-boxa" : "k-box";
  return [
    path(`M${P(cx - 18, cy + 22)}C${P(cx - 18, cy - 8)} ${P(cx + 18, cy - 8)} ${P(cx + 18, cy + 22)}Z`, c),
    circle(cx, cy - 15, 8, c),
    ...labelOf(cx, cy, ch),
  ];
}
/** 클라이언트 기기(PC) */
export const pc = (cx: number, cy: number, ch?: string): string[] => [
  rect(cx - 22, cy - 20, 44, 28, 5, "k-box"),
  path(`M${P(cx, cy + 8)}V${P(cy + 18)}M${P(cx - 12, cy + 18)}H${P(cx + 12)}`, "k-ink"),
  ...labelOf(cx, cy, ch),
];
/** 서버(랙) */
export const server = (cx: number, cy: number, ch?: string): string[] => [
  rect(cx - 23, cy - 20, 46, 16, 5, "k-box"),
  rect(cx - 23, cy + 2, 46, 16, 5, "k-box"),
  circle(cx - 14, cy - 12, 2, "k-fill"),
  circle(cx - 14, cy + 10, 2, "k-fill"),
  ...labelOf(cx, cy, ch),
];
/** 게이트웨이(공유기) */
export const router = (cx: number, cy: number, ch?: string): string[] => [
  path(`M${P(cx - 12, cy - 2)}L${P(cx - 18, cy - 18)}M${P(cx + 12, cy - 2)}L${P(cx + 18, cy - 18)}`, "k-ink"),
  rect(cx - 24, cy - 2, 48, 18, 6, "k-box"),
  circle(cx - 12, cy + 7, 2, "k-fill"),
  circle(cx - 4, cy + 7, 2, "k-fill"),
  ...labelOf(cx, cy, ch),
];

/* ───── 실행하는 것: 프로세스·스레드 ───── */
/** 저장된 상태 카드(작은 쪽지) */
export const stateCard = (cx: number, cy: number): string[] => [
  rect(cx - 7, cy - 9, 14, 18, 3, "k-box"),
  path(`M${P(cx - 3, cy - 3)}H${P(cx + 3)}M${P(cx - 3, cy + 3)}H${P(cx + 1)}`, "k-ink"),
];
/** 프로세스·스레드 상자. run = CPU를 쓰는 중(실선 + 재생 표시), 아니면 기다리는 중(점선 + 저장된 상태 카드) */
export function proc(cx: number, cy: number, label: string, run = true): string[] {
  if (run) return [rect(cx - 26, cy - 17, 52, 34, 8, "k-box"), polygon([[cx - 18, cy - 6], [cx - 18, cy + 6], [cx - 9, cy]], "k-fill"), text(cx + 8, cy, label)];
  return [rect(cx - 26, cy - 17, 52, 34, 8, "k-soft"), text(cx - 6, cy, label), ...stateCard(cx + 14, cy)];
}

/* ───── 호출 스택의 접시(프레임) ───── */
export const PLATE = { w: 112, h: 32, pitch: 38 };
/** 접시 한 장 = 함수 호출 하나(함수 이름이 적힌다). 왼쪽 위 (x, y). ghost = 앞으로 쌓일 빈자리 */
export function plate(x: number, y: number, opt: { label?: string; tone?: "ink" | "acc"; ghost?: boolean } = {}): string[] {
  if (opt.ghost) return [rect(x, y, PLATE.w, PLATE.h, 8, "k-soft")];
  return [
    rect(x, y, PLATE.w, PLATE.h, 8, opt.tone === "acc" ? "k-boxa" : "k-box"),
    ...(opt.label ? [text(x + PLATE.w / 2, y + PLATE.h / 2, opt.label)] : []),
  ];
}

/* ───── 메모리와 디스크 ───── */
/** 메모리 한 쪽(페이지) */
export function page(cx: number, cy: number, tone: "ink" | "acc" = "ink"): string[] {
  if (tone === "acc") return [rect(cx - 7, cy - 9, 14, 18, 3, "k-accf")];
  return [rect(cx - 7, cy - 9, 14, 18, 3, "k-box"), path(`M${P(cx - 3, cy - 3)}H${P(cx + 3)}M${P(cx - 3, cy + 3)}H${P(cx + 1)}`, "k-ink")];
}
/** 메모리(칸 네 개). filled[i]가 참이면 그 칸에 페이지가 있다. 칸 가운데 x는 cx - 33 + 22 i */
export function ram(cx: number, cy: number, filled: boolean[], ch?: string): string[] {
  return [
    rect(cx - 48, cy - 19, 96, 38, 6, "k-box"),
    ...[0, 1, 2, 3].flatMap((i) => {
      const x = cx - 42 + i * 22;
      return filled[i] ? page(x + 9, cy) : [rect(x, cy - 13, 18, 26, 3, "k-soft")];
    }),
    path([-30, -10, 10, 30].map((d) => `M${P(cx + d, cy + 19)}V${P(cy + 25)}`).join(""), "k-ink"),
    ...labelOf(cx, cy, ch),
  ];
}
/** 디스크(원통) */
export const disk = (cx: number, cy: number, ch?: string): string[] => [
  path(`M${P(cx - 24, cy - 14)}V${P(cy + 14)}A24 8 0 0 0 ${P(cx + 24, cy + 14)}V${P(cy - 14)}Z`, "k-box"),
  `<ellipse class="k-box" cx="${n(cx)}" cy="${n(cy - 14)}" rx="24" ry="8"/>`,
  path(`M${P(cx - 24, cy)}A24 8 0 0 0 ${P(cx + 24, cy)}`, "k-ink"),
  ...labelOf(cx, cy, ch),
];

/* ───── 값·쿠키·패킷·자물쇠 ───── */
/** 값 상자(숫자 기록). 가운데 (cx, cy), 기본 68×38 */
export const cell = (cx: number, cy: number, label: string, tone: "ink" | "acc" = "ink", w = 68, h = 38): string[] => [
  rect(cx - w / 2, cy - h / 2, w, h, 8, tone === "acc" ? "k-boxa" : "k-box"),
  text(cx, cy, label),
];
/** 쿠키 */
export const cookie = (cx: number, cy: number, tone: "ink" | "acc" = "ink"): string[] => [
  circle(cx, cy, 12, tone === "acc" ? "k-boxa" : "k-box"),
  circle(cx - 4, cy - 3, 1.8, "k-fill"),
  circle(cx + 4, cy - 4, 1.8, "k-fill"),
  circle(cx, cy + 5, 1.8, "k-fill"),
];
/** 패킷(봉투) */
export const packet = (cx: number, cy: number): string[] => [
  rect(cx - 10, cy - 7, 20, 14, 3, "k-box"),
  path(`M${P(cx - 10, cy - 7)}L${P(cx, cy + 1)}L${P(cx + 10, cy - 7)}`, "k-ink"),
];
/** 자물쇠(동그라미 안). open = 암호화 없음(강조색), 닫힘 = 암호화(방어색) */
export function lock(cx: number, cy: number, open: boolean): string[] {
  const body = open ? "k-accf" : "k-deff";
  const shackle = open ? "k-acc" : "k-defl";
  return [
    circle(cx, cy, 14, "k-box"),
    rect(cx - 7, cy - 1, 14, 10, 2, body),
    path(`M${P(cx - 4, cy - 1)}V${P(cy - 4)}a4 4 0 0 1 8 0V${n(open ? cy - 2 : cy - 1)}`, shackle),
  ];
}
