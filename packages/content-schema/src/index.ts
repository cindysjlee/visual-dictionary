// 용어 JSON의 유일한 스키마. 빌드 검증기(scripts)와 프론트엔드(apps/web)가 함께 쓴다. 규칙: docs/04-content-format.md
import { z } from "zod";
import { ACTIONS_BY_PLAYER } from "./labels.ts";
import { checkScene } from "./scene.ts";

export { ACTIONS_BY_PLAYER, CATEGORY_LABELS, PLAYER_LABELS } from "./labels.ts";

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "소문자·숫자·하이픈만 쓸 수 있습니다");
const text = z.string().trim().min(1, "빈 문자열은 안 됩니다");

/* ---------- 3D 장면 어휘 (docs/06, 모두 선택 항목) ---------- */
export const ACTOR_KINDS = ["browser", "tab", "cookieJar", "server", "database", "network", "attacker", "person", "thread", "resource"] as const;
export const ZONES = ["client", "between", "server", "internal", "outside"] as const;
export const ITEMS = ["cookie", "token", "script", "data", "coin"] as const;
/** 행위자 생김새(docs/06 2절 "생김새"). 없으면 kind의 기본 모양. 어느 kind에 쓸 수 있는지는 scene.ts의 LOOK_KINDS */
export const LOOKS = ["bank", "web", "shop", "community", "database", "cloud-metadata", "wifi", "laptop", "printer", "scanner"] as const;
/** 데드락의 네 조건(점유형 condition 효과). 장면의 "교착 조건" 패널에 한 칸씩 켜진다 */
export const DEADLOCK_CONDITIONS = ["mutual-exclusion", "hold-and-wait", "no-preemption", "circular-wait"] as const;

const item = z.enum(ITEMS);
const screenSchema = z.strictObject({ title: text.optional(), lines: z.array(text).default([]) });
const refusal = { refused: z.boolean().default(false), reason: text.optional() };

export const effectSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("appear"), target: text }),
  z.strictObject({ type: z.literal("flip"), target: text }),
  z.strictObject({
    type: z.literal("rewrite"),
    target: text,
    side: z.enum(["front", "back"]).default("front"),
    screen: screenSchema,
  }),
  z.strictObject({ type: z.literal("store"), item, into: text, label: text.optional() }),
  // note: 붙일 때 보여 줄 설명. 없으면 "목적지 … 자동 첨부"(브라우저가 쿠키를 자동으로 붙이는 경우)
  z.strictObject({ type: z.literal("attach"), item, from: text, label: text.optional(), note: text.optional(), ...refusal }),
  z.strictObject({ type: z.literal("give"), item, from: text, to: text, label: text.optional(), ...refusal }),
  z.strictObject({ type: z.literal("run"), item, target: text, ...refusal }),
  z.strictObject({
    type: z.literal("inspect"),
    at: text,
    contents: z.array(text).default([]),
    checks: z.array(z.strictObject({ name: text, result: text, status: z.enum(["ok", "skip", "fail"]) })).min(1),
  }),
  /* 스택형(stack) */
  // 맨 위 프레임(또는 target 함수의 맨 위 프레임)의 지역 변수 칸을 정하거나 바꾼다
  z.strictObject({ type: z.literal("locals"), target: text.optional(), vars: z.array(z.strictObject({ name: text, value: text })).min(1) }),
  // pop 단계: 반환값이 호출한 프레임으로 전달된다. into는 받는 칸(변수 이름 또는 식의 빈칸 표시)
  z.strictObject({ type: z.literal("returnValue"), value: text, into: text.optional() }),
  /* 점유형(lock) */
  // 조건 패널 한 칸: 성립(기본) 또는 해결 방법이 그 조건을 깸(broken)
  z.strictObject({ type: z.literal("condition"), name: z.enum(DEADLOCK_CONDITIONS), broken: z.boolean().default(false) }),
  // 다른 스레드가 잡은 자원을 빼앗으려 함. 비선점이면 refused
  z.strictObject({ type: z.literal("take"), from: text, ...refusal }),
  z.strictObject({ type: z.literal("cycle") }), // 대기 관계가 고리를 이룸(바닥 고리, 위에서 보는 샷)
  z.strictObject({ type: z.literal("timeout") }), // 기다리다 포기(모래시계가 다 됨). 보통 release 단계에 붙는다
  z.strictObject({ type: z.literal("stamp"), label: text, tone: z.enum(["attack", "defense"]).default("attack") }),
  z.strictObject({
    type: z.literal("transfer"),
    item: z.enum(["coin", "data"]),
    from: text,
    to: text,
    amount: z.int().positive().optional(),
    label: text.optional(),
  }),
]);

// strictObject: 오타 난 필드(예: "dangr")가 조용히 버려지지 않고 오류가 되게 한다
const actorSchema = z.strictObject({
  id: text,
  name: text,
  role: text,
  kind: z.enum(ACTOR_KINDS).optional(),
  look: z.enum(LOOKS).optional(),
  zone: z.enum(ZONES).optional(),
  parent: text.optional(),
  site: text.optional(),
  tone: z.enum(["attack", "neutral"]).optional(),
  gate: z.boolean().default(false),
  balance: z.int().nonnegative().optional(),
  screen: screenSchema.optional(),
  back: screenSchema.optional(),
  /** 화면판 내용을 늘 HTML 라벨로도 보여 준다(판 글씨가 작아도 상태가 읽히게). 화면판이 있는 행위자만 */
  mirrorScreen: z.boolean().default(false),
});

const stepSchema = z.strictObject({
  action: z.enum(["send", "push", "pop", "run", "acquire", "wait", "release"]),
  from: text,
  to: text,
  title: text,
  label: text,
  caption: text,
  danger: z.boolean().default(false),
  effects: z.array(effectSchema).default([]),
  roundTrip: z.boolean().default(false),
  returnLabel: text.optional(),
  via: text.optional(),
  camera: z.strictObject({ focus: text, distance: z.enum(["near", "mid", "far"]).optional() }).optional(),
  line: z.int().min(1).optional(), // 스택형: 이 단계 뒤 맨 위 프레임이 실행 중인 코드 줄(scenario.code, 1부터)
});

// 방어(kind: defense)는 blockedAtStep에서 차단되어 멈춘다. 해결 방법(kind: solution)은 branchAtStep부터 steps로 바꿔 끝까지 재생하는 대체 흐름이다
const defenseSchema = z.strictObject({
  name: text,
  kind: z.enum(["defense", "solution"]),
  description: text,
  blockedAtStep: z.int().min(1).optional(),
  branchAtStep: z.int().min(1).optional(),
  steps: z.array(stepSchema).min(1).optional(),
  blockedTitle: text.optional(),
  blockedLabel: text.optional(), // 차단 표시 글자(도장·2D 대체 화면). 예: "403 · 토큰 없음"
  blockedCaption: text.optional(),
  overrides: z
    .array(
      z.strictObject({
        step: z.int().min(1),
        title: text.optional(),
        caption: text.optional(),
        effects: z.array(effectSchema).optional(), // 있으면 이 방어에서 그 단계의 effects를 대신한다
      }),
    )
    .default([]),
});

export const termSchema = z
  .strictObject({
    id,
    name: text,
    englishName: text.optional(),
    aliases: z.array(text).default([]),
    category: z.enum(["web-security", "network", "os", "runtime"]),
    summary: text,
    description: text,
    status: z.enum(["draft", "published", "retired"]),
    scenario: z.strictObject({
      playerType: z.enum(["flow", "stack", "lock"]),
      actors: z.array(actorSchema).min(1),
      steps: z.array(stepSchema).min(1),
      code: z.strictObject({ title: text.optional(), lines: z.array(z.string()).min(1) }).optional(), // 스택형 코드 판
    }),
    defenses: z.array(defenseSchema).default([]),
    references: z.array(z.strictObject({ title: text, url: z.url() })).min(1),
    related: z.array(id).default([]),
  })
  .superRefine((term, ctx) => {
    // 관련 용어는 다른 용어여야 한다(자기 자신으로 가는 링크 금지). 없는 id는 검증기가 경고만 낸다(scripts/validate-content.ts)
    term.related.forEach((relatedId, i) => {
      if (relatedId === term.id) ctx.addIssue({ code: "custom", path: ["related", i], message: `자기 자신을 관련 용어로 둘 수 없습니다: ${relatedId}` });
    });
    const { playerType, actors, steps } = term.scenario;
    const actorIds = new Set<string>();
    actors.forEach((actor, i) => {
      if (actorIds.has(actor.id)) {
        ctx.addIssue({ code: "custom", path: ["scenario", "actors", i, "id"], message: `중복된 행위자 id: ${actor.id}` });
      }
      actorIds.add(actor.id);
    });

    const allowed: readonly string[] = ACTIONS_BY_PLAYER[playerType];
    const checkSteps = (list: typeof steps, base: (string | number)[]) =>
      list.forEach((step, i) => {
        if (!allowed.includes(step.action)) {
          ctx.addIssue({
            code: "custom",
            path: [...base, i, "action"],
            message: `${playerType} 플레이어에서 쓸 수 없는 action: ${step.action} (허용: ${allowed.join(", ")})`,
          });
        }
        for (const key of ["from", "to"] as const) {
          if (!actorIds.has(step[key])) {
            ctx.addIssue({ code: "custom", path: [...base, i, key], message: `actors에 없는 행위자: ${step[key]}` });
          }
        }
      });
    checkSteps(steps, ["scenario", "steps"]);

    term.defenses.forEach((defense, i) => {
      const issue = (key: string, message: string) => ctx.addIssue({ code: "custom", path: ["defenses", i, key], message });
      // 방어는 멈추는 지점(blockedAtStep), 해결 방법은 갈라지는 지점(branchAtStep) + 대체 흐름(steps)
      if (defense.kind === "defense") {
        if (defense.branchAtStep !== undefined || defense.steps) issue(defense.steps ? "steps" : "branchAtStep", "branchAtStep·steps(대체 흐름)는 해결 방법(kind: solution)에만 씁니다");
      } else {
        if (defense.blockedAtStep !== undefined) issue("blockedAtStep", "해결 방법은 멈추지 않습니다. blockedAtStep 대신 branchAtStep과 steps(대체 흐름)를 씁니다");
        if ((defense.branchAtStep === undefined) !== (defense.steps === undefined)) issue(defense.steps ? "branchAtStep" : "steps", "branchAtStep과 steps는 함께 씁니다");
        if (defense.branchAtStep !== undefined && defense.branchAtStep > steps.length) {
          issue("branchAtStep", `단계 수(${steps.length})를 넘는 갈림 단계: ${defense.branchAtStep}`);
        }
        if (defense.steps) checkSteps(defense.steps, ["defenses", i, "steps"]);
        for (const o of defense.overrides) {
          if (defense.branchAtStep !== undefined && o.step >= defense.branchAtStep) {
            issue("overrides", `override 단계 ${o.step}는 갈림 단계(${defense.branchAtStep}) 앞이어야 합니다. 그 뒤는 steps에 씁니다`);
          }
        }
      }
      if (defense.blockedAtStep === undefined) return;
      if (defense.blockedAtStep > steps.length) {
        ctx.addIssue({
          code: "custom",
          path: ["defenses", i, "blockedAtStep"],
          message: `단계 수(${steps.length})를 넘는 차단 단계: ${defense.blockedAtStep}`,
        });
      }
      for (const key of ["blockedLabel", "blockedCaption"] as const) {
        if (defense[key] === undefined) {
          ctx.addIssue({ code: "custom", path: ["defenses", i, key], message: "blockedAtStep이 있으면 필수입니다" });
        }
      }
    });

    // 3D 장면 참조·물건 흐름 검사 (zod와 무관한 순수 함수라 화면 쪽과 같은 규칙을 쓴다)
    for (const issue of checkScene(term)) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
  });

/** 기본값이 채워진 용어. /content/terms/<id>.json의 형식 */
export type Term = z.output<typeof termSchema>;
export type Category = Term["category"];
export type PlayerType = Term["scenario"]["playerType"];
export type Actor = Term["scenario"]["actors"][number];
export type Step = Term["scenario"]["steps"][number];
export type Defense = Term["defenses"][number];
export type Effect = z.output<typeof effectSchema>;
export type Item = (typeof ITEMS)[number];
export type ActorKind = (typeof ACTOR_KINDS)[number];
export type Zone = (typeof ZONES)[number];
export type Look = (typeof LOOKS)[number];

/** /content/index.json의 항목 하나 */
export type IndexEntry = Pick<Term, "id" | "name" | "englishName" | "aliases" | "category" | "summary"> & {
  playerType: PlayerType;
  stepCount: number;
  defenseCount: number; // 차단 단계가 있는 방어 수
  supportCount: number; // 차단 단계 없는 보조 방어 수
};
