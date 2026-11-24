// [그림 1] 움직이는 연필 스케치: 예시 용어(CSRF)의 단계를 손그림으로 재생한다(three.js·WebGL 없음, SVG + Web Animations API).
// - 그림체: 점을 촘촘히 나눠 살짝 흔든 윤곽선을 두 번 겹치고, 면 색은 윤곽보다 어긋나게 칠한 형광펜(반투명).
// - 선 떨림(boil): 약 170ms마다 선을 새로 흔들어 그린다. 그림이 화면 밖이거나 탭이 숨으면 멈춘다.
// - 움직임: 초당 12장(steps 이징)으로 끊는 스톱모션. 날아가는 것은 살짝 흔들리며 난다.
// - 단계 순서·출발/도착·효과·차단 단계는 용어 JSON(stepView)에서 읽고, 행위자는 종류(kind)별 그리기 함수로 그린다(용어별 코드 없음).
// - 사람(사용자·공격자)은 Open Peeps(Pablo Stanley, CC0)를 한 번 SVG로 뽑아 둔 정적 파일(./peeps)이다.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { Actor, Term } from "@app/content-schema";
import { kindOf, lastStepIndex, modeDefenses, stepView, type Mode, type StepView } from "@app/content-schema/scene";
import { moods, sceneAt, sceneDuring, type Mood, type Scene } from "./sketchScene.ts";
import userBase from "./peeps/user-base.svg";
import attackerBase from "./peeps/attacker-base.svg";
import faceCalm from "./peeps/calm.svg";
import faceFear from "./peeps/concernedfear.svg";
import faceSmileBig from "./peeps/smilebig.svg";
import faceSerious from "./peeps/serious.svg";
import faceCheeky from "./peeps/cheeky.svg";
import faceLol from "./peeps/smilelol.svg";
import faceAngry from "./peeps/angry.svg";

type Pt = { x: number; y: number };
type Spot = Pt & { a: Pt; actor: Actor; kind: string };

// 그림판 800×410 위의 자리(종류별). 같은 종류가 여럿이면 나온 순서대로 채운다
const VW = 800;
const VH = 410;
const TAB: Pt[] = [{ x: 172, y: 212 }, { x: 350, y: 212 }];
const JAR: Pt = { x: 250, y: 324 };
const BANK: Pt = { x: 650, y: 104 };
const SERVER: Pt = { x: 640, y: 326 };
const ATTACKER: Pt = { x: 748, y: 304 };
const USER: Pt = { x: 46, y: 304 };
const GATE: Pt = { x: 512, y: 132 }; // 은행 앞 검문소(봉투가 멈춰 검사받는 곳)
/** 좁은 화면 카메라가 담을 행위자 영역(종류별, 자리 기준 [x, y, w, h]) */
const BOX: Record<string, [number, number, number, number]> = {
  tab: [-84, -76, 168, 152],
  cookieJar: [-150, -38, 190, 78],
  bank: [-94, -58, 188, 172],
  server: [-90, -76, 180, 156],
  attacker: [-58, -86, 116, 176],
};
const GATE_BOX: [number, number, number, number] = [404, 0, 236, 268]; // 검사 카드·검문소·도장
const HOLD = 1100;
const CUT = 2400; // 동작 줄이기: 정지 컷 하나를 보여 주는 시간
const BOIL_MS = 170;
const FRAME_MS = 1000 / 12;
// 그림판 안 글자(사용자 단위)의 최소는 손글씨 12×1.6 ≈ 19, 고딕(코드 줄) 18: 넓은 화면에서 그림판이 520px로 줄어도 화면에서 12px 이상
const TEXT = 1.6; // Gaegu는 같은 크기에서 글자가 작게 보여 고딕보다 더 키운다

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 행위자 id → 자리와 봉투가 닿는 곳(a) */
function layout(term: Term) {
  const m = new Map<string, Spot>();
  let tabs = 0;
  for (const actor of term.scenario.actors) {
    const kind = kindOf(actor);
    const p = kind === "tab" ? (TAB[tabs++] ?? TAB[1]!) : kind === "cookieJar" ? JAR : kind === "server" ? (actor.look === "bank" ? BANK : SERVER) : kind === "attacker" ? ATTACKER : { x: 235, y: 200 };
    const a =
      kind === "tab"
        ? { x: p.x, y: p.y - 10 }
        : kind === "cookieJar"
          ? { x: p.x, y: p.y - 44 }
          : kind === "server"
            ? actor.look === "bank"
              ? { x: p.x - 40, y: p.y + 32 }
              : { x: p.x - 8, y: p.y - 52 }
            : kind === "attacker"
              ? { x: p.x - 22, y: p.y - 18 }
              : p;
    m.set(actor.id, { ...p, a, actor, kind });
  }
  return m;
}

/* ── 연필 선 ── */

type Fill = "ink" | "paper" | "paper2" | "white" | "bank" | "bank-deep" | "attack" | "attack-deep" | "attack-soft" | "evil" | "evil-soft" | "glass" | "cookie" | "chip" | "gold" | "grey" | "grey-deep" | "green";
type Line = "none" | "thin" | "bank-deep";
type Shape = ({ t: "rect"; x: number; y: number; w: number; h: number } | { t: "ell"; cx: number; cy: number; rx: number; ry: number } | { t: "poly"; pts: [number, number][]; open?: boolean }) & { fill?: Fill; line?: Line };

const R = (x: number, y: number, w: number, h: number, fill?: Fill, line?: Line): Shape => ({ t: "rect", x, y, w, h, fill, line });
const E = (cx: number, cy: number, rx: number, ry: number, fill?: Fill, line?: Line): Shape => ({ t: "ell", cx, cy, rx, ry, fill, line });
const C = (cx: number, cy: number, r: number, fill?: Fill, line?: Line) => E(cx, cy, r, r, fill, line);
const P = (pts: [number, number][], fill?: Fill, line?: Line): Shape => ({ t: "poly", pts, fill, line });
const L = (pts: [number, number][], line?: Line): Shape => ({ t: "poly", pts, open: true, line });

const r1 = (n: number) => Math.round(n * 10) / 10;
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
/** 시드가 같으면 같은 떨림(상태가 바뀌어도 선이 튀지 않고, 프레임이 바뀔 때만 다시 흔들린다) */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pointsOf(s: Shape): [number, number][] {
  if (s.t === "rect") return [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]];
  if (s.t === "ell") {
    const n = s.rx > 8 ? 18 : 10;
    return Array.from({ length: n }, (_, i) => [s.cx + Math.cos((i / n) * Math.PI * 2) * s.rx, s.cy + Math.sin((i / n) * Math.PI * 2) * s.ry]);
  }
  return s.pts;
}

/** 변을 step 간격의 점으로 나눈다(흔들 점을 촘촘하게) */
function densify(p: [number, number][], closed: boolean, step = 12) {
  const out: [number, number][] = [];
  const segs = closed ? p.length : p.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    const k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  if (!closed) out.push(p.at(-1)!);
  return out;
}

/** Catmull-Rom → 베지어(열린 곡선) */
function smooth(p: [number, number][]) {
  const g = (i: number) => p[Math.max(0, Math.min(p.length - 1, i))]!;
  let d = `M${r1(p[0]![0])},${r1(p[0]![1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = g(i - 1), b = g(i), c = g(i + 1), e = g(i + 2);
    d += `C${r1(b[0] + (c[0] - a[0]) / 6)},${r1(b[1] + (c[1] - a[1]) / 6)} ${r1(c[0] - (e[0] - b[0]) / 6)},${r1(c[1] - (e[1] - b[1]) / 6)} ${r1(c[0])},${r1(c[1])}`;
  }
  return d;
}

const Boil = createContext(0);

function Rough({ s, k }: { s: Shape; k: string }) {
  const frame = useContext(Boil);
  const rnd = rng(hash(k) + frame * 7919);
  const pts = pointsOf(s);
  const closed = !(s.t === "poly" && s.open);
  const amt = Math.min(1.5, (s.t === "ell" ? Math.min(s.rx, s.ry) : 12) * 0.14);
  const jit = (v: number, m = amt) => v + (rnd() - 0.5) * 2 * m;
  let fill: string | null = null;
  if (s.fill) fill = "M" + pts.map((p) => `${r1(jit(p[0], amt * 0.8))},${r1(jit(p[1], amt * 0.8))}`).join("L") + "Z";
  let line = "";
  if (s.line !== "none") {
    const dense = densify(pts, closed);
    for (let pass = 0; pass < 2; pass++) {
      const q = dense.map((p): [number, number] => [jit(p[0]), jit(p[1])]);
      if (closed) q.push([jit(dense[0]![0]), jit(dense[0]![1])]);
      line += smooth(q);
    }
  }
  return (
    <>
      {fill && <path d={fill} className={`sk-f sk-f-${s.fill}`} transform="translate(2.4 2)" />}
      {line && <path d={line} className={s.line === "thin" ? "sk-l sk-l-thin" : s.line === "bank-deep" ? "sk-l sk-l-bank-deep" : "sk-l"} />}
    </>
  );
}

const rough = (id: string, list: Shape[]) => list.map((s, i) => <Rough key={`${id}${i}`} s={s} k={`${id}${i}`} />);

function Tx({ x, y, s = 13, c, a = "middle", plain, children }: { x: number; y: number; s?: number; c?: string; a?: "start" | "middle" | "end"; plain?: boolean; children: ReactNode }) {
  return (
    <text x={x} y={y} fontSize={r1(s * TEXT)} textAnchor={a} className={`sk-t${c ? ` sk-c-${c}` : ""}${plain ? " is-plain" : ""}`}>
      {children}
    </text>
  );
}

/** 대략의 글자 폭(한글은 글자 크기, 영숫자는 절반 남짓) */
const textW = (t: string, s: number) => [...t].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? s : s * 0.56), 0);

/** 칸보다 긴 코드 줄(띄어쓰기 없는 주소)은 글자 간격을 줄여 칸에 맞춘다 */
const CODE = 18; // .sk-code 글자 크기(dictionary.css와 같게)
const fit = (t: string, max: number) => (textW(t, CODE) > max ? { textLength: max, lengthAdjust: "spacingAndGlyphs" as const } : {});

/** 긴 줄을 칸 폭(max)에 맞춰 띄어쓰기에서, 그래도 길면 "/" 앞에서 나눈다(탭 안의 좁은 화면) */
export function wrap(lines: string[], max = 146) {
  const out: string[] = [];
  const words = (line: string) => line.split(" ").flatMap((w) => (textW(w, CODE) > max ? w.split(/(?=\/)/) : [w]));
  for (const line of lines) {
    let row = "";
    for (const w of words(line)) {
      const next = row ? (w.startsWith("/") ? row + w : `${row} ${w}`) : w;
      if (row && textW(next, CODE) > max) {
        out.push(row);
        row = w;
      } else row = next;
    }
    if (row) out.push(row);
  }
  return out;
}

/* ── 작은 물건 ── */

const cookie = (cx: number, cy: number, k = 1): Shape[] => [C(cx, cy, 11 * k, "cookie"), C(cx - 4 * k, cy - 3 * k, 2 * k, "chip", "none"), C(cx + 4 * k, cy + k, 2 * k, "chip", "none"), C(cx - k, cy + 5 * k, 1.8 * k, "chip", "none")];
const key = (cx: number, cy: number, k = 1): Shape[] => [R(cx - k, cy - 2.5 * k, 17 * k, 5 * k, "gold"), R(cx + 10 * k, cy + 2 * k, 3 * k, 5 * k, "gold"), R(cx + 5 * k, cy + 2 * k, 3 * k, 4 * k, "gold"), C(cx - 7 * k, cy, 7 * k, "gold"), C(cx - 7 * k, cy, 2.4 * k, "paper")];
const coin = (cx: number, cy: number): Shape[] => [C(cx, cy, 10, "gold")];

function face(m: Mood, cx: number, y: number, o: { sep?: number; whites?: boolean; blush?: boolean } = {}): Shape[] {
  const sep = o.sep ?? 8;
  const s: Shape[] = [];
  if (o.whites) s.push(E(cx - sep, y, 5, 6, "white"), E(cx + sep, y, 5, 6, "white"));
  const er = o.whites ? 2.4 : 3.2;
  if (m === "happy") s.push(L([[cx - sep - 3, y + 1], [cx - sep, y - 2.5], [cx - sep + 3, y + 1]]), L([[cx + sep - 3, y + 1], [cx + sep, y - 2.5], [cx + sep + 3, y + 1]]));
  else s.push(E(cx - sep, y, er, er * (m === "shock" ? 1.5 : 1.3), "ink", "none"), E(cx + sep, y, er, er * (m === "shock" ? 1.5 : 1.3), "ink", "none"));
  const my = y + 9;
  if (m === "neutral") s.push(L([[cx - 4, my], [cx, my + 2], [cx + 4, my]]));
  if (m === "smile") s.push(L([[cx - 6, my - 1], [cx, my + 4], [cx + 6, my - 1]]));
  if (m === "happy") s.push(P([[cx - 7, my - 2], [cx + 7, my - 2], [cx, my + 6]], "ink"));
  if (m === "shock") s.push(E(cx, my + 2, 3.2, 4.4, "ink", "none"), L([[cx - sep - 5, y - 9], [cx - sep + 3, y - 11]]), L([[cx + sep + 5, y - 9], [cx + sep - 3, y - 11]]));
  if (m === "angry") s.push(L([[cx - 6, my + 3], [cx, my - 1], [cx + 6, my + 3]]), L([[cx - sep - 5, y - 10], [cx - sep + 4, y - 6]]), L([[cx + sep + 5, y - 10], [cx + sep - 4, y - 6]]));
  if (m === "grin") s.push(P([[cx - 9, my - 2], [cx + 9, my - 2], [cx + 6, my + 5], [cx - 6, my + 5]], "white"), L([[cx - 8, my + 1.5], [cx + 8, my + 1.5]], "thin"));
  if (o.blush && (m === "neutral" || m === "happy" || m === "smile")) s.push(E(cx - sep - 5, y + 6, 3.6, 2.2, "attack-soft", "none"), E(cx + sep + 5, y + 6, 3.6, 2.2, "attack-soft", "none"));
  return s;
}

/* ── 사람: Open Peeps(바탕 + 표정 얼굴을 겹친다) ── */

const USER_FACE: Partial<Record<Mood, string>> = { neutral: faceCalm, shock: faceFear, happy: faceSmileBig };
const ATTACKER_FACE: Partial<Record<Mood, string>> = { neutral: faceSerious, grin: faceCheeky, happy: faceLol, angry: faceAngry };

function Peep({ at, base, face: f, flip }: { at: Pt; base: string; face: string; flip?: boolean }) {
  return (
    <g transform={`translate(${at.x} ${at.y})${flip ? " scale(-1 1)" : ""}`}>
      <image href={base} x="-48" y="-80" width="96" height="136" />
      <image href={f} x="-48" y="-80" width="96" height="136" />
    </g>
  );
}

/* ── 행위자 종류별 그리기 ── */

function Browser({ actor }: { actor: Actor }) {
  return (
    <g>
      {rough("br", [R(84, 70, 356, 290, "paper"), R(84, 70, 356, 32, "paper2"), C(102, 86, 4.5, "attack", "thin"), C(117, 86, 4.5, "gold", "thin"), C(132, 86, 4.5, "green", "thin"), R(146, 75, 284, 22, "white", "thin")])}
      <Tx x={288} y={92} s={13} c="grey-deep" plain>
        {actor.name}
      </Tx>
    </g>
  );
}

function Tab({ spot, scene, hidden }: { spot: Spot; scene: Scene; hidden: boolean }) {
  const { actor } = spot;
  const id = actor.id;
  const flipped = scene.flipped.has(id) && actor.back;
  const rewritten = scene.screen.get(id);
  const screen = rewritten ?? actor.screen;
  const attack = actor.tone === "attack";
  let body: ReactNode;
  if (flipped) {
    body = (
      <>
        {rough(`${id}b`, [R(-80, -72, 160, 144, "paper2"), R(-80, -72, 160, 26, "evil-soft")])}
        <Tx x={0} y={-53} s={13}>
          {actor.back!.title ?? ""}
        </Tx>
        {wrap(actor.back!.lines)
          .slice(0, 5)
          .map((l, i) => (
            <text key={i} x={-72} y={-24 + i * 21} className="sk-code" {...fit(l, 146)}>
              {l}
            </text>
          ))}
      </>
    );
  } else if (attack) {
    body = rewritten ? (
      <>
        {rough(`${id}r`, [R(-80, -72, 160, 144, "attack-soft"), R(-80, -72, 160, 26, "attack"), R(-24, -24, 48, 38, "attack"), R(-5, -24, 10, 38, "gold"), E(-10, -31, 10, 6, "gold"), E(10, -31, 10, 6, "gold")])}
        <Tx x={0} y={-53} s={13}>
          {actor.site ?? actor.name}
        </Tx>
        <Tx x={0} y={50} s={16} c="attack-deep">
          {screen?.title ?? ""}
        </Tx>
      </>
    ) : (
      <>
        {rough(`${id}n`, [R(-80, -72, 160, 144, "white"), R(-80, -72, 160, 26, "paper2")])}
        <Tx x={0} y={8} s={14} c="grey-deep">
          {screen?.title ?? actor.name}
        </Tx>
      </>
    );
  } else {
    body = (
      <>
        {rough(`${id}f`, [R(-80, -72, 160, 144, "white"), R(-80, -72, 160, 26, "bank")])}
        <Tx x={0} y={-53} s={13} c="bank-deep">
          {actor.site ?? actor.name}
        </Tx>
        <Tx x={0} y={-20} s={15}>
          {screen?.title ?? actor.name}
        </Tx>
        {(screen?.lines ?? []).slice(0, 2).map((l, i) => (
          <text key={i} x={0} y={8 + i * 24} textAnchor="middle" className="sk-code" {...fit(l, 146)}>
            {l}
          </text>
        ))}
        {scene.tokenAt === id && rough(`${id}k`, key(50, 56, 0.9))}
      </>
    );
  }
  return (
    <g transform={`translate(${spot.x} ${spot.y})`} visibility={hidden ? "hidden" : "visible"}>
      <g data-actor={id} className="sk-tab">
        {body}
      </g>
    </g>
  );
}

function Jar({ spot, full }: { spot: Spot; full: boolean }) {
  return (
    <g transform={`translate(${spot.x} ${spot.y})`}>
      {rough("jar", [R(-25, -22, 50, 44, "glass"), R(-21, -32, 42, 10, "grey-deep"), ...(full ? cookie(0, 3) : [])])}
      <Tx x={-36} y={7} s={13} a="end" c="grey-deep">
        {spot.actor.name}
      </Tx>
    </g>
  );
}

function Gate({ shut }: { shut: boolean }) {
  return (
    <g>
      <g transform={`translate(${GATE.x} 150)`}>
        {rough("gate", [R(-39, -44, 11, 66, "grey"), R(28, -44, 11, 66, "grey"), R(-47, 20, 94, 10, "grey-deep")])}
        <Tx x={0} y={48} s={14}>
          검문소
        </Tx>
      </g>
      <g transform={`translate(${GATE.x - 33} 120)`}>
        <g data-part="bar" className="sk-bar">
          {rough(shut ? "barS" : "bar", [R(0, -5, 68, 10, shut ? "bank-deep" : "attack"), R(12, -5, 9, 10, "white", "none"), R(32, -5, 9, 10, "white", "none"), R(52, -5, 9, 10, "white", "none")])}
        </g>
      </g>
    </g>
  );
}

function Bank({ spot, mood, paid }: { spot: Spot; mood: Mood; paid: number }) {
  const { actor } = spot;
  return (
    <g>
      <g transform={`translate(${spot.x} ${spot.y})`}>
        {rough("bank", [R(-62, -8, 124, 70, "bank"), P([[-72, -8], [0, -52], [72, -8]], "bank"), R(-52, 2, 10, 56, "white"), R(42, 2, 10, 56, "white"), R(-13, 34, 26, 28, "bank-deep"), ...face(mood, 0, 12, { sep: 12, blush: true })])}
        <Tx x={0} y={-17} s={13} c="bank-deep">
          {actor.name}
        </Tx>
      </g>
      {actor.balance !== undefined && (
        <g transform={`translate(${spot.x - 5} ${spot.y + 96})`}>
          {rough("sign", [R(-80, -17, 160, 34, "white")])}
          <Tx x={0} y={7} s={12} c={paid ? "attack-deep" : undefined} plain>
            잔액 {(actor.balance - paid).toLocaleString("ko-KR")}원
          </Tx>
        </g>
      )}
    </g>
  );
}

function Server({ spot, mood }: { spot: Spot; mood: Mood }) {
  return (
    <g transform={`translate(${spot.x} ${spot.y})`}>
      {rough("srv", [P([[-28, -44], [-40, -70], [-14, -46]], "evil-soft"), P([[28, -44], [40, -70], [14, -46]], "evil-soft"), R(-36, -48, 72, 94, "evil"), R(-36, 12, 72, 8, "attack", "none"), R(-36, 28, 72, 8, "attack", "none"), ...face(mood, 0, -22, { sep: 11, whites: true })])}
      <Tx x={0} y={68} s={13} c="evil">
        {spot.actor.name}
      </Tx>
    </g>
  );
}

function Attacker({ spot, mood, paid }: { spot: Spot; mood: Mood; paid: boolean }) {
  return (
    <g>
      <Peep at={spot} base={attackerBase} face={ATTACKER_FACE[mood] ?? faceSerious} flip />
      <g transform={`translate(${spot.x} ${spot.y})`}>
        {paid && rough("pile", [...coin(-52, 46), ...coin(-40, 50), ...coin(-46, 36)])}
        <Tx x={0} y={74} s={14}>
          {spot.actor.name}
        </Tx>
      </g>
    </g>
  );
}

function Pill({ text }: { text: string }) {
  if (!text) return null;
  const w = textW(text, 13 * TEXT) + 18;
  return (
    <>
      {rough(`pill${w}`, [R(-w / 2, 20, w, 26, "white", "thin")])}
      <Tx x={0} y={39} s={13} plain>
        {text}
      </Tx>
    </>
  );
}

/* ── 그림 1 ── */

/** 좁은 화면 카메라: 행위자들을 담는 viewBox [x, y, w](높이는 그림판 비율로) */
type Focus = string | [number, number, number, number] | undefined; // 행위자 id, "gate", 또는 그림판 좌표의 상자

function frameOf(ids: Focus[], spots: Map<string, Spot>): [number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of ids) {
    if (!id) continue;
    let b: [number, number, number, number] | undefined;
    if (Array.isArray(id)) b = id;
    else if (id === "gate") b = GATE_BOX;
    else {
      const sp = spots.get(id);
      const box = sp && BOX[sp.kind === "server" && sp.actor.look === "bank" ? "bank" : sp.kind];
      if (sp && box) b = [sp.x + box[0], sp.y + box[1], box[2], box[3]];
    }
    if (!b) continue;
    x0 = Math.min(x0, b[0]);
    y0 = Math.min(y0, b[1]);
    x1 = Math.max(x1, b[0] + b[2]);
    y1 = Math.max(y1, b[1] + b[3]);
  }
  if (x0 === Infinity) return [0, 0, VW];
  const w = Math.min(VW, Math.max(420, x1 - x0 + 24, ((y1 - y0 + 24) * VW) / VH));
  const h = (w * VH) / VW;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  return [clamp((x0 + x1) / 2 - w / 2, VW - w), clamp((y0 + y1) / 2 - h / 2, VH - h), w];
}

/** 한 단계에 나오는 행위자(동작 줄이기의 정지 컷 카메라) */
const stepIds = (v: StepView, spots: Map<string, Spot>) => {
  const ids: Focus[] = [v.from, v.to];
  for (const e of v.effects) for (const k of ["into", "from", "to", "target", "at"] as const) if (k in e) ids.push((e as Record<string, unknown>)[k] as string);
  if (spots.get(v.to)?.actor.gate && !spots.get(v.from)?.actor.gate) ids.push("gate");
  return ids;
};

export default function SketchFigure({ term, mine = false }: { term: Term; mine?: boolean }) {
  const modes = modeDefenses(term);
  const [mode, setMode] = useState<Mode>(null);
  const views = Array.from({ length: lastStepIndex(term, mode) + 1 }, (_, i) => stepView(term, mode, i));
  const total = term.scenario.steps.length;
  const spots = layout(term);
  // i: 지금 단계(-1 = 시작 전), done: 그 단계의 움직임이 끝났는가. beats: 진행 중인 단계에서 이미 연출한 효과
  const [cur, setCur] = useState({ i: -1, done: true });
  const [beats, setBeats] = useState<ReadonlySet<string>>(new Set());
  const [label, setLabel] = useState("");
  const [state, setState] = useState<"idle" | "playing" | "paused" | "ended">("idle");
  // 자동 재생 중에는 자막을 낭독하지 않는다(몇 초마다 읽히면 시끄럽다). 사용자가 조작한 뒤부터 aria-live
  const [touched, setTouched] = useState(false);
  const [frame, setFrame] = useState(0);
  const root = useRef<SVGSVGElement>(null);
  const run = useRef(0);
  const held = useRef(false); // 사용자가 일시정지했다(스크롤로 다시 들어와도 이어 재생하지 않는다)
  const viewsRef = useRef(views);
  viewsRef.current = views;
  const spotsRef = useRef(spots);
  spotsRef.current = spots;

  // 좁은 화면(600px 이하)에서는 단계마다 그 단계 행위자 쪽으로 viewBox를 옮겨 확대한다(카메라가 설명). 초당 12장으로 끊어 옮긴다
  const narrowQuery = "(max-width: 600px)";
  const [narrow, setNarrow] = useState(() => matchMedia(narrowQuery).matches);
  const narrowRef = useRef(narrow);
  narrowRef.current = narrow;
  const [cam, setCam] = useState<[number, number, number]>([0, 0, VW]);
  const camRef = useRef(cam);
  const camTimer = useRef(0);
  const moveCam = (to: [number, number, number]) => {
    clearInterval(camTimer.current);
    const from = camRef.current;
    if (reduced()) {
      camRef.current = to;
      setCam(to);
      return;
    }
    let k = 0;
    const n = 6; // 6장 × 83ms ≈ 0.5초
    camTimer.current = window.setInterval(() => {
      k++;
      const t = k / n;
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const next = from.map((v, i) => v + (to[i]! - v) * e) as [number, number, number];
      camRef.current = next;
      setCam(next);
      if (k >= n) clearInterval(camTimer.current);
    }, FRAME_MS);
  };
  const camGoal = useRef<[number, number, number]>([0, 0, VW]); // 일시정지로 멈춘 카메라를 이어서 재생할 때 갈 곳
  const look = (ids: Focus[]) => {
    if (!narrowRef.current) return;
    camGoal.current = frameOf(ids, spotsRef.current);
    moveCam(camGoal.current);
  };
  useEffect(() => {
    const mq = matchMedia(narrowQuery);
    const on = () => {
      setNarrow(mq.matches);
      if (!mq.matches) {
        clearInterval(camTimer.current);
        camRef.current = [0, 0, VW];
        setCam([0, 0, VW]);
      }
    };
    mq.addEventListener("change", on);
    return () => {
      mq.removeEventListener("change", on);
      clearInterval(camTimer.current);
    };
  }, []);

  const anims = () => root.current?.getAnimations({ subtree: true }) ?? [];
  const stop = () => {
    run.current++;
    for (const a of anims()) a.cancel();
  };
  const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = (ms: number) => root.current!.animate([{ opacity: 1 }, { opacity: 1 }], { duration: ms }).finished;

  /** from 단계부터 끝까지(once면 그 단계만) 재생 */
  const play = useCallback(async (from: number, once = false) => {
    stop();
    held.current = false;
    const token = run.current;
    setState("playing");
    const alive = () => token === run.current;
    try {
      for (let i = from; i < viewsRef.current.length; i++) {
        setBeats(new Set());
        setLabel("");
        setCur({ i, done: false });
        await settle();
        if (!alive()) return;
        if (reduced()) look(stepIds(viewsRef.current[i]!, spotsRef.current));
        else
          await animateStep({
            svg: root.current!,
            v: viewsRef.current[i]!,
            spots: spotsRef.current,
            look,
            beat: async (b) => {
              if (!alive()) throw new Error("cancelled");
              setBeats((s) => new Set(s).add(b));
              await settle();
            },
            label: async (t) => {
              setLabel(t);
              await settle();
            },
          });
        if (!alive()) return;
        setCur({ i, done: true });
        await wait(reduced() ? CUT : HOLD);
        if (!alive() || once) break;
      }
      if (alive()) setState("ended");
    } catch {
      // 취소(cancel)되면 finished가 거부된다: 다른 재생이 이어받았으므로 조용히 끝낸다
    }
    // look·moveCam은 ref만 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pause = () => {
    held.current = true;
    clearInterval(camTimer.current); // 카메라도 그 자리에서 멈춘다
    for (const a of anims()) a.pause();
    setState("paused");
  };
  const resume = () => {
    held.current = false;
    if (narrowRef.current) moveCam(camGoal.current);
    for (const a of anims()) a.play();
    setState("playing");
  };

  // 화면에 들어오면 한 번 재생, 화면 밖으로 나가면 멈춘다(다시 들어오면 이어서). 선 떨림도 화면 안·탭이 보일 때만
  const seen = useRef(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let visible = false;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        visible = e.isIntersecting;
        if (e.isIntersecting && !seen.current) {
          seen.current = true;
          void play(0);
        } else if (!e.isIntersecting) {
          for (const a of anims()) if (a.playState === "running") a.pause();
        } else if (!held.current) {
          for (const a of anims()) if (a.playState === "paused") a.play();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    const boil = reduced() ? 0 : window.setInterval(() => visible && !document.hidden && setFrame((f) => (f + 1) % 3), BOIL_MS);
    return () => {
      io.disconnect();
      clearInterval(boil);
      run.current++;
    };
  }, [play]);

  const pickMode = (m: Mode) => {
    stop();
    setMode(m);
    setCur({ i: -1, done: true });
    setState("idle");
    // 모드가 바뀌면 단계가 달라지므로 다음 그림에서 처음부터
    requestAnimationFrame(() => void play(0));
  };

  const view = cur.i >= 0 ? views[cur.i] : undefined;
  const scene = cur.done ? sceneAt(views, cur.i) : sceneDuring(views, cur.i, beats);
  const mood = moods(scene);
  // 나중에 나타나는 탭(appear 효과의 대상)은 나타나기 전까지 숨긴다
  const appears = new Set(term.scenario.steps.flatMap((s) => s.effects.flatMap((e) => (e.type === "appear" ? [e.target] : []))));
  const modeName = mode === null ? "공격 흐름" : `방어: ${term.defenses[mode]!.name}`;
  const all = [...spots.values()];
  const bank = all.find((s) => s.kind === "server" && s.actor.look === "bank");
  // 끝까지 재생했다(마지막 단계가 끝남): 그림 아래에 다음 행동 한 줄
  const finished = state === "ended" && cur.done && cur.i === views.length - 1;
  const box = narrow ? cam : ([0, 0, VW] as const);

  return (
    <figure className="la-fig" aria-labelledby="la-fig-cap" onClickCapture={() => setTouched(true)} onKeyDownCapture={() => setTouched(true)}>
      <div className="la-fig-modes" role="group" aria-label="그림 1 장면 고르기">
        <button type="button" aria-pressed={mode === null} onClick={() => pickMode(null)}>
          공격 흐름
        </button>
        {modes.map((m) => (
          <button key={m} type="button" className="is-defense" aria-pressed={mode === m} onClick={() => pickMode(m)}>
            방어: {term.defenses[m]!.name}
          </button>
        ))}
      </div>

      <Boil.Provider value={frame}>
        <svg ref={root} className="la-sketch" viewBox={`${r1(box[0])} ${r1(box[1])} ${r1(box[2])} ${r1((box[2] * VH) / VW)}`} role="img" aria-label={`${term.name} ${modeName} 손그림`}>
          {all.map((s) =>
            s.kind === "browser" ? (
              <g key={s.actor.id}>
                <Browser actor={s.actor} />
                <Peep at={USER} base={userBase} face={USER_FACE[mood.user] ?? faceCalm} />
              </g>
            ) : s.kind === "cookieJar" ? (
              <Jar key={s.actor.id} spot={s} full={scene.jar} />
            ) : null,
          )}
          {all.map((s) => (s.kind === "tab" ? <Tab key={s.actor.id} spot={s} scene={scene} hidden={appears.has(s.actor.id) && !scene.shown.has(s.actor.id)} /> : null))}
          {bank?.actor.gate && <Gate shut={scene.blocked} />}
          {all.map((s) =>
            s.kind === "server" ? (
              s.actor.look === "bank" ? (
                <Bank key={s.actor.id} spot={s} mood={mood.bank} paid={scene.paid} />
              ) : (
                <Server key={s.actor.id} spot={s} mood={mood.server} />
              )
            ) : s.kind === "attacker" ? (
              <Attacker key={s.actor.id} spot={s} mood={mood.attacker} paid={scene.paid > 0} />
            ) : null,
          )}

          {scene.card && (
            <g transform={`translate(${GATE.x} 24)`}>
              {rough(`card${scene.card.length}`, [R(-100, -14, 200, 20 + scene.card.length * 21, "white")])}
              {scene.card.map((c, i) => (
                <Tx key={i} x={-90} y={8 + i * 21} s={13} a="start" c={c.status === "fail" ? "bank-deep" : c.status === "skip" ? "attack-deep" : undefined} plain>
                  {c.name}: {c.result}
                </Tx>
              ))}
            </g>
          )}
          {scene.blocked && view?.blockedLabel && (
            <g transform={`translate(${GATE.x + 16} 236) rotate(6)`}>
              <g className="sk-stamp">
                {rough("stamp", [R(-86, -18, 172, 36, "white", "bank-deep")])}
                <text textAnchor="middle" y="6" className="sk-stamp-text">
                  {view.blockedLabel}
                </text>
              </g>
            </g>
          )}

          {/* 움직이는 것들: 평소엔 숨어 있다가 단계마다 Web Animations로 움직인다 */}
          <g data-part="env" className="sk-move">
            {rough("env", [R(-19, -13, 38, 26, "white"), L([[-19, -13], [0, 2], [19, -13]]), ...(scene.carry ? cookie(16, -13, 0.62) : [])])}
            <Pill text={label} />
          </g>
          <g data-part="plane" className="sk-move">
            {rough("plane", [P([[-18, 0], [18, -9], [-6, 11]], "white"), L([[18, -9], [-3, 4]])])}
            <Pill text={label} />
          </g>
          <g data-part="cookie" className="sk-move">
            {rough("mck", cookie(0, 0))}
          </g>
          <g data-part="key" className="sk-move">
            {rough("mkey", key(0, 0, 0.9))}
          </g>
          {[0, 1, 2].map((i) => (
            <g key={i} data-part={`coin${i}`} className="sk-move">
              {rough(`mcoin${i}`, coin(0, 0))}
            </g>
          ))}
          {[0, 1].map((i) => (
            <g key={i} data-part={`word${i}`} className="sk-word sk-move">
              <text textAnchor="middle" y="0" />
              <path d="M-26 9C-14 12-6 6 0 10S14 13 26 7" />
            </g>
          ))}
        </svg>
      </Boil.Provider>

      {/* 자리를 미리 잡아 두고(레이아웃이 밀리지 않게) 끝까지 재생하면 보인다 */}
      <p className="la-fig-next" data-on={finished}>
        <Link className="la-btn la-btn-sm la-btn-ink" to={`/terms/${term.id}#term-fig`} tabIndex={finished ? undefined : -1}>
          3D로 자세히 보기 → {term.name} 용어
        </Link>
        {mine ? (
          <Link className="la-btn la-btn-sm" to="/me" tabIndex={finished ? undefined : -1}>
            내 단어장 보기
          </Link>
        ) : (
          <>
            <span>가입하면 완독한 용어에 完 도장이 찍혀요</span>
            <Link className="la-btn la-btn-sm la-btn-mark" to="/auth/signup" tabIndex={finished ? undefined : -1}>
              회원가입
            </Link>
          </>
        )}
      </p>

      <div className="la-player">
        <div className="la-steps-nav" role="group" aria-label="단계로 가기">
          {Array.from({ length: total }, (_, i) => {
            const v = views[i];
            const off = !v;
            return (
              <button
                key={i}
                type="button"
                className={v?.blocked ? "la-step-no is-block" : v?.tone === "attack" ? "la-step-no is-danger" : "la-step-no"}
                aria-pressed={cur.i === i}
                disabled={off}
                onClick={() => void play(i, true)}
              >
                {i + 1}
                <span className="visually-hidden">
                  단계: {(v ?? stepView(term, null, i)).title}
                  {off && " (이 방어에서는 일어나지 않음)"}
                </span>
              </button>
            );
          })}
        </div>
        <div className="la-player-ctl">
          {state === "playing" ? (
            <button type="button" className="la-btn la-btn-sm" onClick={pause}>
              일시정지
            </button>
          ) : state === "paused" ? (
            <button type="button" className="la-btn la-btn-sm" onClick={resume}>
              이어서 재생
            </button>
          ) : (
            <button type="button" className="la-btn la-btn-sm la-btn-ink" onClick={() => void play(0)}>
              {state === "ended" ? "다시 보기" : "재생"}
            </button>
          )}
          {state !== "idle" && state !== "ended" && (
            <button type="button" className="la-btn la-btn-sm" onClick={() => void play(0)}>
              다시 보기
            </button>
          )}
        </div>
      </div>

      <p className="la-subtitle" aria-live={touched ? "polite" : "off"}>
        {view ? (
          <>
            <b className={view.blocked ? "is-block" : view.tone === "attack" ? "is-danger" : undefined}>
              {cur.i + 1}단계. {view.title}
            </b>{" "}
            {view.caption}
          </>
        ) : (
          `${term.name}의 ${views.length}단계를 손그림으로 보여 줍니다. 위에서 공격 흐름이나 방어를 고르세요.`
        )}
      </p>

      <figcaption id="la-fig-cap">
        <b>그림 1.</b> {term.name} {modeName}.{mode !== null && views.at(-1)?.blocked && ` ${views.length}단계에서 막힌다.`}{" "}
        <span className="la-see-inline">
          → 3D 장면: <Link to={`/terms/${term.id}`}>{term.name} 용어</Link>
        </span>
      </figcaption>
    </figure>
  );
}

/* ── 한 단계의 움직임(초당 12장 스톱모션). 끝나면 resolve, 취소되면 reject ── */

type Ctx = { svg: SVGSVGElement; v: StepView; spots: Map<string, Spot>; look: (ids: Focus[]) => void; beat: (b: string) => Promise<void>; label: (t: string) => Promise<void> };

async function animateStep({ svg, v, spots, look, beat, label }: Ctx) {
  const part = (n: string) => svg.querySelector<SVGGElement>(`[data-part="${n}"]`)!;
  const at = (id: string) => spots.get(id)?.a ?? { x: 400, y: 210 };
  const kind = (id: string) => spots.get(id)?.kind;
  const gated = (id: string) => !!spots.get(id)?.actor.gate;
  const tr = (p: Pt, rot = 0, s = 1) => `translate(${r1(p.x)}px, ${r1(p.y)}px) rotate(${r1(rot)}deg) scale(${s})`;
  const go = (el: Element, kf: Keyframe[], ms: number) => el.animate(kf, { duration: ms, fill: "forwards", easing: `steps(${Math.max(2, Math.round(ms / FRAME_MS))}, end)` }).finished;
  const hide = (el: Element) => el.getAnimations().forEach((a) => a.cancel());
  const wait = (ms: number) => svg.animate([{ opacity: 1 }, { opacity: 1 }], { duration: ms }).finished;
  const io = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  /** 포물선을 9장으로 나눈 키프레임. 날아가는 동안 ±7° 흔들린다 */
  const fly = (el: Element, a: Pt, b: Pt, ms: number, lift = 50, wobble = 7) => {
    const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift };
    const kf = Array.from({ length: 9 }, (_, i): Keyframe => {
      const o = i / 8;
      const t = io(o);
      const q = (p: number, m: number, n: number) => (1 - t) * (1 - t) * p + 2 * (1 - t) * t * m + t * t * n;
      return { offset: o, opacity: 1, transform: tr({ x: q(a.x, c.x, b.x), y: q(a.y, c.y, b.y) }, Math.sin(o * Math.PI * 5) * wobble) };
    });
    return go(el, kf, ms);
  };
  let slot = 0;
  /** 효과음: 손글씨 + 흔들린 밑줄. 앞 효과음이 아직 떠 있어도 다른 칸에 띄운다 */
  const say = (text: string, p: Pt, tone: "neutral" | "attack" | "defense" | "coin" = "neutral") => {
    const w = part(`word${slot++ % 2}`);
    hide(w);
    w.setAttribute("class", `sk-word sk-move is-${tone}`);
    w.querySelector("text")!.textContent = text;
    w.querySelector("path")!.setAttribute("transform", `scale(${r1(Math.max(0.7, [...text].length * 0.36))} 1)`);
    void go(
      w,
      [
        { transform: tr(p, 0, 0.3), opacity: 0 },
        { transform: tr(p, -4, 1.15), opacity: 1, offset: 0.25 },
        { transform: tr(p, 0, 1), opacity: 1, offset: 0.8 },
        { transform: tr(p, 0, 1), opacity: 0 },
      ],
      1100,
    ).catch(() => {});
  };
  const fx = <T extends StepView["effects"][number]["type"]>(t: T) => v.effects.find((e): e is Extract<StepView["effects"][number], { type: T }> => e.type === t);

  const from = at(v.from);
  const dest = at(v.to);
  const byPlane = kind(v.from) === "attacker";
  const mover = part(byPlane ? "plane" : "env");
  await label(v.label);
  const store = fx("store");
  if (store) await beat("carry"); // 쿠키를 실어 보낸다(Set-Cookie)
  if (byPlane) say("휙!", { x: from.x - 20, y: from.y - 66 }, "attack");

  // 봉투가 보관함에 들러 쿠키를 붙인다(착!) / SameSite면 쿠키가 튕긴다(안 붙어!)
  let start = from;
  const attach = fx("attach");
  const toGate = gated(v.to) && !gated(v.from);
  // 카메라(좁은 화면): 출발지와 첫 목적지를 함께 담는다
  // SameSite처럼 쿠키가 튕기면 보관함 아래 "안 붙어!" 자리까지 담는다
  const nopeAt = attach?.refused ? at(attach.from) : undefined;
  look(attach ? [v.from, attach.from, nopeAt && [nopeAt.x - 80, nopeAt.y + 84, 160, 44]] : [v.from, toGate ? "gate" : v.to]);
  if (attach) {
    const jar = at(attach.from);
    const inJar = { x: jar.x, y: jar.y + 47 };
    const stop = { x: jar.x + 80, y: jar.y + 30 }; // 보관함 오른쪽에 멈춘다(이름표는 보관함 왼쪽, 위는 탭이라 가리지 않게)
    await fly(mover, from, stop, 750, 30);
    start = stop;
    const ck = part("cookie");
    if (attach.refused) {
      await go(ck, [{ transform: tr(inJar), opacity: 1 }, { transform: tr({ x: stop.x + 10, y: stop.y + 4 }, -12), opacity: 1, offset: 0.5 }, { transform: tr(inJar), opacity: 1 }], 540);
      say("안 붙어!", { x: jar.x, y: jar.y + 116 }, "defense"); // 브라우저 창 아래 빈 띠
      await wait(600);
    } else {
      await fly(ck, inJar, { x: stop.x + 16, y: stop.y - 13 }, 420, 16, 0);
      await beat("attach");
      say("착!", { x: stop.x + 62, y: stop.y + 8 }, v.tone === "attack" ? "attack" : "neutral");
    }
    hide(ck);
    look([attach.from, toGate ? "gate" : v.to]);
  }

  // 토큰(열쇠)은 봉투와 함께 따로 날아간다
  const give = fx("give");
  const giving =
    give && !give.refused
      ? (async () => {
          await wait(220);
          const k = part("key");
          const to = at(give.to);
          await fly(k, at(give.from), { x: to.x + 30, y: to.y + 56 }, 1000, 110);
          await beat("give");
          hide(k);
        })()
      : null;

  if (toGate) {
    // 검문소에서 멈춰 검사받는다. 막히면 쾅! 하고 떨어진다
    await fly(mover, start, GATE, 900, 50);
    if (fx("inspect")) {
      await beat("inspect");
      await wait(1000);
    }
    if (v.blocked) {
      await beat("block");
      say("쾅!", { x: GATE.x + 36, y: GATE.y - 32 }, "defense"); // 검사 카드와 차단봉 사이
      await go(mover, [{ transform: tr(GATE), opacity: 1 }, { transform: tr({ x: GATE.x - 8, y: GATE.y + 20 }, 20), opacity: 1, offset: 0.4 }, { transform: tr({ x: GATE.x - 20, y: GATE.y + 70 }, 40), opacity: 0 }], 700);
      hide(mover);
      return;
    }
    look(["gate", v.to]);
    const bar = part("bar");
    await go(bar, [{ transform: "rotate(0deg)" }, { transform: "rotate(-74deg)" }], 300);
    await fly(mover, GATE, dest, 600, 20);
    hide(mover);
    await go(bar, [{ transform: "rotate(-74deg)" }, { transform: "rotate(0deg)" }], 260);
    hide(bar);
  } else {
    await fly(mover, start, dest, byPlane ? 1150 : 900, byPlane ? 150 : 60);
    if (v.roundTrip) {
      await label(v.returnLabel ?? v.label);
      await fly(mover, dest, start, 800, 50);
    }
    hide(mover);
  }
  await giving;

  // 도착한 뒤: 쿠키 보관 / 탭 등장 / 화면 바뀜·뒤집기 / 송금
  if (store) {
    look([v.to, store.into]);
    const ck = part("cookie");
    const jar = at(store.into);
    await fly(ck, dest, { x: jar.x, y: jar.y + 47 }, 600, 24);
    await beat("store");
    hide(ck);
    say("착!", { x: jar.x + 46, y: jar.y - 4 });
  }
  const appear = fx("appear");
  if (appear) {
    look([appear.target]);
    await beat("appear");
    const p = at(appear.target);
    say("뿅!", { x: p.x + 44, y: p.y - 58 }, "attack");
    const tab = svg.querySelector(`[data-actor="${appear.target}"]`);
    if (tab) {
      await go(tab, [{ transform: "scale(0.1)" }, { transform: "scale(1.12)", offset: 0.7 }, { transform: "scale(1)" }], 500);
      hide(tab);
    }
  }
  if (fx("rewrite")) await beat("rewrite");
  const flip = fx("flip");
  if (flip) {
    look([flip.target]);
    const tab = svg.querySelector(`[data-actor="${flip.target}"]`);
    await wait(300);
    if (tab) await go(tab, [{ transform: "scaleX(1)" }, { transform: "scaleX(0.02)" }], 260);
    await beat("flip");
    if (tab) {
      await go(tab, [{ transform: "scaleX(0.02)" }, { transform: "scaleX(1)" }], 320);
      hide(tab);
    }
  }
  const transfer = fx("transfer");
  if (transfer) {
    look([transfer.from, transfer.to]);
    const a = at(transfer.from);
    const b = at(transfer.to);
    say("짤랑!", { x: b.x + 40, y: b.y - 62 }, "coin"); // 잔액 표 오른쪽, 공격자 머리 위
    await Promise.all(
      [0, 1, 2].map(async (i) => {
        await wait(i * 180);
        const c = part(`coin${i}`);
        await fly(c, { x: a.x + 40, y: a.y - 40 }, { x: b.x - 30 + i * 6, y: b.y + 60 - i * 8 }, 1000, 90);
        hide(c);
      }),
    );
    await beat("transfer");
  }
}
