// 화면 표시용 이름. zod를 import하지 않으므로 웹 번들에 스키마가 딸려 들어가지 않는다
export const CATEGORY_LABELS = {
  "web-security": "웹 보안",
  network: "네트워크",
  os: "운영체제",
  runtime: "자료구조·런타임",
} as const;

export const PLAYER_LABELS = {
  flow: "흐름형",
  stack: "스택형",
  lock: "점유형",
} as const;

export const ACTIONS_BY_PLAYER = {
  flow: ["send"],
  stack: ["push", "pop", "run"],
  lock: ["acquire", "wait", "release"],
} as const;
