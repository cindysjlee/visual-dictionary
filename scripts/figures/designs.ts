// 용어 옆 그림 구성(docs/05 "그림 공통 도형"): 그림 하나 = 장면 하나. 도형은 shapes.ts의 것만 쓴다(같은 것은 같은 모양).
// build-figures.ts가 이 목록으로 content/figures/<id>.svg를 만든다. deadlock-intersection.svg는 손으로 그린 채로 둔다(이 목록에 없음)
// 읽는 법: 그림만 봐도 이해되도록 사물에는 이름을, 화살표에는 한마디 설명을 그림 안에 직접 쓴다(낱말·구, 20자 이하). 번호는 순서.
// 색: 중립 = 정상 흐름, 강조(공격색 하나) = 문제·공격·불가능(X), 방어색 = 막는 쪽(SSL의 HTTPS). 한 그림에 3가지를 넘기지 않는다
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
/** 그림 맨 아래 한 줄: 이 그림의 결론 */
const headline = (s: string) => text(120, 226, s);

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

/** 콜 스택: 함수가 다른 함수를 부를 때마다 접시(호출 한 번)가 쌓이고, 맨 위만 실행 중이며, 끝나면 맨 위부터 빠진다 */
const callStackPlates = (): string[] => [
  path("M8 202H132", "k-ink"),
  ...plate(14, 20, { ghost: true }),
  text(70, 36, "다음 호출"),
  ...plate(14, 58, { label: "C() 실행 중" }),
  ...plate(14, 96, { label: "B()" }),
  ...plate(14, 134, { label: "A()" }),
  ...plate(14, 164, { label: "main()" }),
  ...arrow(164, 190, 164, 60),
  ...tag(164, 126, 1),
  text(180, 46, "호출하면 쌓임"),
  ...arrow(212, 60, 212, 190),
  ...tag(212, 126, 2),
  text(196, 206, "끝나면 빠짐"),
  headline("맨 위 한 장만 실행된다"),
];

/** 스택 오버플로: 같은 함수가 끝없이 자신을 불러 접시가 한도(점선)까지 차고, 한 장 더 쌓으려는 순간 프로그램이 멈춘다 */
const stackOverflowLimit = (): string[] => [
  path("M8 202H132", "k-ink"),
  ...plate(14, 164, { label: "f()" }),
  ...plate(14, 126, { label: "f()" }),
  ...plate(14, 88, { label: "f()" }),
  ...plate(14, 50, { label: "f()" }),
  path("M8 40H232", "k-accd"),
  text(190, 54, "스택 한도"),
  ...plate(14, 4, { tone: "acc", label: "f()" }),
  xmark(168, 20, 9),
  text(204, 20, "넘침"),
  text(190, 100, "자기 자신을"),
  text(190, 116, "계속 호출"),
  ...arrow(190, 190, 190, 134),
  headline("한도를 넘으면 프로그램이 멈춘다"),
];

/** ARP 스푸핑: 같은 망의 공격자가 "내가 공유기"라고 속여, PC의 패킷이 공유기로 곧장 가지 않고 공격자를 거쳐 간다 */
const arpDetour = (): string[] => {
  const a1 = { from: [56, 134], to: [100, 98] } as const;
  const a2 = { from: [140, 98], to: [184, 134] } as const;
  return [
    path("M74 160H166", "k-soft"),
    xmark(120, 160, 9),
    text(120, 182, "원래 가던 길"),
    ...pc(44, 158, "내 PC"),
    ...router(196, 158, "공유기"),
    text(120, 8, "“내가 공유기야”"),
    ...person(120, 46, "attacker", "공격자"),
    ...arrow(...a1.from, ...a1.to, "acc"),
    ...tag(...at(along(...a1.from, ...a1.to, 0.5)), 1),
    ...arrow(...a2.from, ...a2.to, "acc"),
    ...tag(...at(along(...a2.from, ...a2.to, 0.5)), 2),
    headline("패킷이 공격자를 거쳐 간다"),
  ];
};

/** SSL 스트리핑: 사용자와 공격자 사이는 암호화가 없고(열린 자물쇠, 붉은 점선), 공격자와 서버 사이는 HTTPS(닫힌 자물쇠, 파란 실선) */
const sslStrippingPath = (): string[] => {
  const l1 = { from: [50, 142], to: [104, 92] } as const;
  const l2 = { from: [136, 92], to: [190, 142] } as const;
  return [
    ...arrow(...l1.from, ...l1.to, "acc", true),
    ...arrow(...l2.from, ...l2.to, "def"),
    ...lock(...at(along(...l1.from, ...l1.to, 0.5)), true),
    ...lock(...at(along(...l2.from, ...l2.to, 0.5)), false),
    ...person(34, 164, "user", "사용자"),
    ...person(120, 34, "attacker", "공격자"),
    ...server(206, 164, "서버"),
    text(40, 82, "HTTP 평문"),
    text(194, 82, "HTTPS 암호문"),
    ...tag(...at(along(...l1.from, ...l1.to, 0.12)), 1),
    ...tag(...at(along(...l2.from, ...l2.to, 0.8)), 2),
    headline("공격자는 사용자 쪽 내용을 읽는다"),
  ];
};

/** 클릭재킹: 눈에 보이는 건 미끼 화면의 버튼이지만, 그 위에 투명하게 겹쳐 놓은 은행 화면의 버튼이 클릭을 받는다 */
const clickjackingLayers = (): string[] => [
  rect(14, 70, 170, 118, 8, "k-box"),
  text(76, 86, "미끼 페이지"),
  rect(24, 136, 110, 34, 8, "k-box"),
  text(60, 153, "경품 받기"),
  rect(6, 54, 228, 142, 8, "k-soft"),
  text(170, 42, "투명한 은행 화면"),
  rect(96, 130, 100, 34, 8, "k-accd"),
  text(166, 147, "송금"),
  text(120, 8, "사용자는 여기를 클릭"),
  ...arrow(116, 22, 116, 126, "acc"),
  headline("보이는 버튼 대신 송금이 눌린다"),
];

/** 경쟁 상태: 두 스레드가 같은 값 100을 읽고(1, 2) 각자 +50을 해 150을 써서(3, 4) 한쪽의 변경이 사라진다 */
const raceConditionLostUpdate = (): string[] => {
  const r1 = [100, 58, 52, 64, 46, 98] as const;
  const r2 = [140, 58, 188, 64, 194, 98] as const;
  const w1 = [46, 144, 52, 190, 88, 192] as const;
  const w2 = [194, 144, 188, 190, 152, 192] as const;
  return [
    ...cell(120, 38, "잔액 100", "ink", 88, 36),
    ...cell(120, 192, "잔액 150", "acc", 88, 36),
    ...proc(40, 120, "A"),
    ...proc(200, 120, "B"),
    text(120, 120, "A·B = 스레드"),
    ...arrowQ(...r1),
    ...arrowQ(...r2),
    ...arrowQ(...w1, "acc"),
    ...arrowQ(...w2, "acc"),
    ...tag(...at(alongQ(...r1, 0.4)), 1),
    ...tag(...at(alongQ(...r2, 0.4)), 2),
    ...tag(...at(alongQ(...w1, 0.55)), 3),
    ...tag(...at(alongQ(...w2, 0.55)), 4),
    headline("둘 다 +50 해서 150이 됨"),
  ];
};

/** SYN 플러딩: 공격자가 SYN만 쏟아 서버의 대기열(반쯤 열린 연결을 적어 두는 칸)이 가득 차, 정상 사용자는 들어갈 칸이 없다 */
const synFloodQueue = (): string[] => {
  const atk = { from: [68, 54], to: [126, 92] } as const;
  const ok = { from: [68, 150], to: [126, 134] } as const;
  const slots = [0, 1].flatMap((j) => [0, 1, 2].map((i) => rect(150 + i * 26, 96 + j * 28, 22, 22, 4, "k-accf")));
  return [
    ...person(38, 44, "attacker", "공격자"),
    ...pc(38, 150, "사용자"),
    rect(132, 72, 100, 100, 8, "k-box"),
    text(182, 60, "서버의 대기열"),
    ...slots,
    text(182, 156, "가득 참"),
    ...arrow(...atk.from, ...atk.to, "acc"),
    ...[0.35, 0.6, 0.85].flatMap((t) => packet(...at(along(...atk.from, ...atk.to, t)))),
    text(112, 30, "SYN만 계속"),
    ...tag(70, 54, 1),
    ...arrow(...ok.from, ...ok.to),
    xmark(106, 142, 8),
    text(96, 176, "자리 없음"),
    ...tag(80, 148, 2),
    headline("정상 요청이 거절된다"),
  ];
};

/** 세션 하이재킹: 사용자의 로그인 쿠키가 서버로 가는 길에서 공격자가 몰래 복사해(2), 그 쿠키를 서버에 내밀면(3) 본인으로 믿는다 */
const sessionHijackingCookie = (): string[] => {
  const main = { from: [66, 160], to: [176, 160] } as const;
  const steal = { from: [100, 154], to: [100, 100] } as const;
  const use = { from: [124, 76], to: [190, 126] } as const;
  return [
    ...person(36, 150, "user", "사용자"),
    ...server(204, 150, "서버"),
    ...person(100, 46, "attacker", "공격자"),
    ...arrow(...main.from, ...main.to),
    ...cookie(...at(along(...main.from, ...main.to, 0.62))),
    text(120, 190, "로그인 쿠키"),
    ...tag(...at(along(...main.from, ...main.to, 0.12)), 1),
    ...arrow(...steal.from, ...steal.to, "acc", true),
    text(56, 108, "몰래 복사"),
    ...tag(122, 126, 2),
    ...arrow(...use.from, ...use.to, "acc"),
    ...cookie(...at(along(...use.from, ...use.to, 0.5)), "acc"),
    text(182, 62, "훔친 쿠키 사용"),
    ...tag(...at(along(...use.from, ...use.to, 0.2)), 3),
    headline("서버는 공격자를 본인으로 믿는다"),
  ];
};

/** 페이지 폴트: 프로그램이 메모리에 없는 페이지를 찾다 실패하고(1), 운영체제가 디스크에서 그 페이지를 읽어 메모리 빈 칸에 올린 뒤(2) 프로그램이 이어서 실행된다(3) */
const pageFaultPath = (): string[] => [
  rect(8, 22, 56, 36, 8, "k-box"),
  polygon([[28, 31], [28, 49], [44, 40]], "k-fill"),
  text(36, 72, "프로그램"),
  ...ram(176, 46, [true, true, true, false]),
  text(176, 84, "메모리"),
  text(84, 10, "이 페이지 줘"),
  ...arrow(68, 40, 102, 40),
  xmark(114, 40, 7),
  ...tag(80, 60, 1),
  text(108, 78, "없음!"),
  ...disk(176, 168),
  text(176, 206, "디스크"),
  ...arrow(209, 142, 209, 78),
  ...page(209, 112, "acc"),
  text(148, 112, "읽어 옴"),
  ...tag(184, 112, 2),
  ...arrowQ(132, 78, 96, 118, 44, 88),
  ...tag(...at(alongQ(132, 78, 96, 118, 44, 88, 0.5)), 3),
  text(84, 132, "이어서 실행"),
];

/** 컨텍스트 스위칭: CPU 하나를 A와 B가 번갈아 쓴다. 바꿀 때 멈추는 쪽의 상태를 저장하고(1), 이어받는 쪽의 저장된 상태를 불러온다(2) */
const contextSwitchStates = (): string[] => [
  text(120, 10, "CPU 하나, 시간 순서"),
  rect(8, 28, 80, 40, 8, "k-box"),
  polygon([[18, 41], [18, 55], [30, 48]], "k-fill"),
  text(58, 48, "A 실행"),
  rect(96, 32, 48, 32, 6, "k-soft"),
  text(120, 48, "전환"),
  rect(152, 28, 80, 40, 8, "k-box"),
  polygon([[162, 41], [162, 55], [174, 48]], "k-fill"),
  text(202, 48, "B 실행"),
  ...arrow(108, 74, 62, 126),
  ...tag(98, 88, 1),
  text(46, 94, "A 상태 저장"),
  ...arrow(178, 126, 132, 74),
  ...tag(150, 90, 2),
  text(198, 94, "B 상태 복원"),
  rect(14, 130, 76, 46, 8, "k-box"),
  text(52, 143, "A의 저장 칸"),
  ...[0, 1, 2].map((i) => rect(28 + i * 20, 156, 16, 12, 3, "k-soft")),
  rect(150, 130, 76, 46, 8, "k-box"),
  text(188, 143, "B의 저장 칸"),
  ...[0, 1, 2].map((i) => rect(164 + i * 20, 156, 16, 12, 3, "k-soft")),
  headline("전환할 때마다 상태를 옮긴다"),
];

/** IDOR: 로그인한 사용자가 주소의 번호만 101에서 102로 바꿔 보내면(1, 2), 서버가 주인을 확인하지 않고 남의 주문을 돌려준다(3) */
const idorIdSwap = (): string[] => [
  rect(14, 10, 212, 30, 8, "k-box"),
  text(120, 25, "/orders/101 (내 주문)"),
  ...arrow(120, 44, 120, 66),
  ...tag(88, 55, 1),
  text(172, 55, "번호만 바꿈"),
  rect(14, 70, 212, 30, 8, "k-boxa"),
  text(120, 85, "/orders/102 (남의 주문)"),
  ...arrow(120, 104, 120, 128, "acc"),
  ...tag(88, 116, 2),
  text(166, 116, "요청"),
  rect(14, 132, 212, 36, 8, "k-box"),
  text(120, 144, "서버"),
  text(120, 158, "주인 확인은 안 함"),
  ...arrow(120, 172, 120, 192, "acc"),
  ...tag(88, 182, 3),
  rect(14, 196, 212, 30, 8, "k-boxa"),
  text(120, 211, "남의 주문 내용이 보임"),
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
