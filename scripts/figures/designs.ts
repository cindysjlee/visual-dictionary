// 용어 옆 그림 구성(docs/05 "그림 공통 도형"): 그림 하나 = 장면 하나. 도형은 shapes.ts의 것만 쓴다(같은 것은 같은 모양).
// build-figures.ts가 이 목록으로 content/figures/<id>.svg를 만든다. deadlock-intersection.svg는 손으로 그린 채로 둔다(검수 통과, 이 목록에 없음)
// 번호: 화살표 순서. 이름표: A 시작, B, C. 색: 중립 = 정상 흐름, 강조 = 문제·공격, 방어색 = 막는 쪽(SSL의 HTTPS)
import {
  along,
  alongQ,
  arrow,
  arrowQ,
  cell,
  cookie,
  disk,
  lock,
  packet,
  page,
  path,
  pc,
  person,
  plate,
  polygon,
  proc,
  ram,
  rect,
  router,
  server,
  tag,
  text,
  xmark,
} from "./shapes.ts";

export type FigureDesign = { id: string; parts: string[] };

const at = (p: [number, number]) => p;

/** TCP 3-way 핸드셰이크: 클라이언트 A와 서버 B가 신호 세 번을 위에서 아래로. 정상 흐름이라 모두 중립색 */
const tcpHandshake = (): string[] => [
  path("M52 90V232M188 90V232", "k-soft"),
  ...pc(52, 36, "A"),
  ...server(188, 36, "B"),
  ...arrow(56, 106, 184, 130),
  ...tag(120, 118, 1),
  ...arrow(184, 148, 56, 172),
  ...tag(120, 160, 2),
  ...arrow(56, 190, 184, 214),
  ...tag(120, 202, 3),
];

/** 콜 스택: 접시 한 장 = 함수 호출 한 번. 아래 A부터 쌓이고 맨 위 C만 실행 중. 정상 동작이라 중립색 */
const callStackPlates = (): string[] => [
  path("M22 199H150", "k-ink"),
  ...plate(30, 47, { ghost: true }),
  ...plate(30, 85, { label: "C" }),
  polygon([[12, 93], [12, 109], [24, 101]], "k-fill"),
  ...plate(30, 123, { label: "B" }),
  ...plate(30, 161, { label: "A" }),
  ...arrow(178, 188, 178, 56),
  ...tag(178, 122, 1),
  ...arrow(212, 56, 212, 188),
  ...tag(212, 122, 2),
];

/** 스택 오버플로: 같은 접시가 한도(점선)까지 차서 다음 한 장이 한도를 넘는다. 한도 위 접시와 점선이 문제라 강조색 */
const stackOverflowLimit = (): string[] => [
  path("M22 210H150", "k-ink"),
  ...plate(30, 172),
  ...plate(30, 134),
  ...plate(30, 96),
  ...plate(30, 58),
  path("M14 52H226", "k-accd"),
  ...plate(30, 14, { tone: "acc" }),
  xmark(186, 30, 9),
  ...arrow(188, 196, 188, 70),
];

/** ARP 스푸핑: A(PC)와 C(게이트웨이)의 직접 연결이 끊기고 패킷이 공격자 B를 거친다 */
const arpDetour = (): string[] => {
  const a1 = { from: [58, 160], to: [104, 102] } as const;
  const a2 = { from: [136, 102], to: [182, 162] } as const;
  return [
    path("M72 188H168", "k-soft"),
    xmark(120, 188, 9),
    ...pc(44, 188, "A"),
    ...router(196, 188, "C"),
    ...person(120, 48, "attacker", "B"),
    ...arrow(...a1.from, ...a1.to, "acc"),
    ...tag(...at(along(...a1.from, ...a1.to, 0.5)), 1),
    ...arrow(...a2.from, ...a2.to, "acc"),
    ...tag(...at(along(...a2.from, ...a2.to, 0.5)), 2),
  ];
};

/** SSL 스트리핑: 사용자 A와 공격자 B 사이는 암호화가 없고(열린 자물쇠, 붉은 점선), B와 서버 C 사이는 HTTPS(닫힌 자물쇠, 파란 실선) */
const sslStrippingPath = (): string[] => {
  const l1 = { from: [50, 152], to: [104, 96] } as const;
  const l2 = { from: [136, 96], to: [190, 152] } as const;
  return [
    ...arrow(...l1.from, ...l1.to, "acc", true),
    ...arrow(...l2.from, ...l2.to, "def"),
    ...lock(...at(along(...l1.from, ...l1.to, 0.5)), true),
    ...lock(...at(along(...l2.from, ...l2.to, 0.5)), false),
    ...person(34, 184, "user", "A"),
    ...person(120, 40, "attacker", "B"),
    ...server(206, 184, "C"),
    ...tag(...at(along(...l1.from, ...l1.to, 0.13)), 1),
    ...tag(...at(along(...l2.from, ...l2.to, 0.13)), 2),
  ];
};

/** 클릭재킹: 투명한 은행 화면(점선)이 미끼 화면 위에 겹쳐 있어, 1을 누른다고 믿는 클릭이 2에 닿는다 */
const clickjackingLayers = (): string[] => [
  rect(24, 96, 160, 116, 8, "k-box"),
  path("M40 114H108M40 128H86", "k-ink"),
  rect(62, 170, 84, 30, 8, "k-box"),
  text(70, 186, "1"),
  rect(40, 80, 160, 116, 8, "k-soft"),
  rect(78, 154, 84, 30, 8, "k-accd"),
  text(154, 169, "2"),
  ...arrow(150, 10, 150, 150, "acc"),
];

/** 경쟁 상태: 두 스레드 A·B가 같은 100을 읽고(1, 2) 각자 150을 써서(3, 4) 한쪽 변경이 사라진다 */
const raceConditionLostUpdate = (): string[] => {
  const r1 = [98, 60, 48, 64, 44, 101] as const;
  const r2 = [142, 60, 192, 64, 196, 101] as const;
  const w1 = [44, 141, 50, 196, 84, 199] as const;
  const w2 = [196, 141, 190, 196, 156, 199] as const;
  return [
    ...cell(120, 41, "100"),
    ...cell(120, 199, "150", "acc"),
    ...proc(40, 120, "A"),
    ...proc(200, 120, "B"),
    ...arrowQ(...r1),
    ...arrowQ(...r2),
    ...arrowQ(...w1, "acc"),
    ...arrowQ(...w2, "acc"),
    ...tag(...at(alongQ(...r1, 0.4)), 1),
    ...tag(...at(alongQ(...r2, 0.4)), 2),
    ...tag(...at(alongQ(...w1, 0.55)), 3),
    ...tag(...at(alongQ(...w2, 0.55)), 4),
  ];
};

/** SYN 플러드: 공격자 B가 SYN만 쏟아 서버 C의 반쯤 열린 연결 대기열(여섯 칸)이 가득 차, 정상 클라이언트 A의 SYN은 들어갈 칸이 없다 */
const synFloodQueue = (): string[] => {
  const atk = { from: [62, 72], to: [146, 108] } as const;
  const ok = { from: [64, 182], to: [134, 148] } as const;
  const slots = [0, 1].flatMap((j) => [0, 1, 2].map((i) => rect(155 + i * 26, 98 + j * 28, 22, 22, 4, "k-accf")));
  return [
    ...person(38, 64, "attacker", "B"),
    ...pc(38, 186, "A"),
    ...server(192, 34, "C"),
    rect(148, 88, 88, 70, 8, "k-box"),
    ...slots,
    ...arrow(...atk.from, ...atk.to, "acc"),
    ...[0.32, 0.52, 0.72].flatMap((t) => packet(...at(along(...atk.from, ...atk.to, t)))),
    ...tag(72, 58, 1),
    ...arrow(...ok.from, ...ok.to),
    xmark(146, 142, 8),
    ...tag(...at(along(...ok.from, ...ok.to, 0.38)), 2),
  ];
};

/** 세션 하이재킹: 서버 C가 사용자 A에게 준 쿠키(1)를 공격자 B가 가로채(2) 서버에 내밀면(3) 본인으로 믿는다 */
const sessionHijackingCookie = (): string[] => {
  const c1 = { from: [106, 86], to: [56, 148] } as const;
  const c2 = { from: [64, 176], to: [178, 176] } as const;
  const c3 = { from: [186, 148], to: [134, 86] } as const;
  return [
    ...arrow(...c1.from, ...c1.to),
    ...arrow(...c2.from, ...c2.to, "acc"),
    ...arrow(...c3.from, ...c3.to, "acc"),
    ...server(120, 34, "C"),
    ...person(40, 176, "user", "A"),
    ...person(200, 176, "attacker", "B"),
    ...cookie(...at(along(...c1.from, ...c1.to, 0.56))),
    ...cookie(...at(along(...c2.from, ...c2.to, 0.66)), "acc"),
    ...cookie(...at(along(...c3.from, ...c3.to, 0.56)), "acc"),
    ...tag(...at(along(...c1.from, ...c1.to, 0.14)), 1),
    ...tag(...at(along(...c2.from, ...c2.to, 0.22)), 2),
    ...tag(...at(along(...c3.from, ...c3.to, 0.14)), 3),
  ];
};

/** 페이지 폴트: 프로세스 A가 메모리 B에 없는 페이지를 찾다 실패하고(1), 디스크 C에서 읽어 오라고 하면(2) 그 페이지가 메모리의 빈 칸으로 올라온다(3) */
const pageFaultPath = (): string[] => [
  ...proc(40, 58, "A"),
  ...ram(170, 58, [true, true, true, false], "B"),
  ...disk(175, 190, "C"),
  ...arrow(70, 58, 106, 58),
  xmark(116, 58, 7),
  ...tag(88, 36, 1),
  ...arrow(155, 92, 157, 162),
  ...tag(156, 127, 2),
  ...arrow(196, 164, 202, 93),
  ...page(199, 150, "acc"),
  ...tag(200, 116, 3),
];

/** 컨텍스트 스위칭: 실선은 CPU를 쓰는 중, 점선은 상태를 저장해 두고 기다리는 중. A→B→A로 번갈아 쓰며 저장(1, 3)과 복원(2, 4)이 따른다 */
const contextSwitchStates = (): string[] => [
  ...arrow(120, 28, 120, 214, "ink", true),
  ...proc(56, 44, "A"),
  ...proc(184, 44, "B", false),
  ...proc(56, 120, "A", false),
  ...proc(184, 120, "B"),
  ...proc(56, 196, "A"),
  ...proc(184, 196, "B", false),
  ...arrow(56, 65, 56, 100),
  ...arrow(184, 65, 184, 100),
  ...arrow(184, 141, 184, 176),
  ...arrow(56, 141, 56, 176),
  ...tag(82, 82, 1),
  ...tag(158, 82, 2),
  ...tag(158, 158, 3),
  ...tag(82, 158, 4),
];

/** IDOR: 공격자 A가 요청 속 번호 101을 남의 번호 102로 바꿔(1) 요청하면(2) 서버 B가 주인을 확인하지 않고 남의 기록 102를 돌려준다(3) */
const idorIdSwap = (): string[] => [
  rect(38, 26, 52, 28, 8, "k-soft"),
  text(64, 40, "101"),
  ...arrow(96, 40, 144, 40),
  rect(150, 26, 52, 28, 8, "k-boxa"),
  text(176, 40, "102"),
  ...tag(120, 40, 1),
  ...person(36, 146, "attacker", "A"),
  ...server(204, 146, "B"),
  ...arrow(62, 118, 176, 118, "acc"),
  ...tag(118, 118, 2),
  ...arrow(176, 172, 62, 172, "acc"),
  ...cell(119, 172, "102", "acc", 48, 32),
  ...tag(160, 172, 3),
];

/** SVG 파일 내용(요소 하나가 한 줄). checkFigureSvg가 요구하는 xmlns·viewBox를 붙인다 */
export const renderSvg = (d: FigureDesign) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">\n${d.parts.join("\n")}\n</svg>\n`;

export const FIGURES: FigureDesign[] = [
  { id: "tcp-handshake-arrows", parts: tcpHandshake() },
  { id: "call-stack-plates", parts: callStackPlates() },
  { id: "stack-overflow-limit", parts: stackOverflowLimit() },
  { id: "arp-spoofing-detour", parts: arpDetour() },
  { id: "ssl-stripping-path", parts: sslStrippingPath() },
  { id: "clickjacking-layers", parts: clickjackingLayers() },
  { id: "race-condition-lost-update", parts: raceConditionLostUpdate() },
  { id: "syn-flood-queue", parts: synFloodQueue() },
  { id: "session-hijacking-cookie", parts: sessionHijackingCookie() },
  { id: "page-fault-path", parts: pageFaultPath() },
  { id: "context-switch-states", parts: contextSwitchStates() },
  { id: "idor-id-swap", parts: idorIdSwap() },
];
