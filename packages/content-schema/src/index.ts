// 용어 JSON의 유일한 스키마. 빌드 검증기(scripts)와 프론트엔드(apps/web)가 함께 쓴다. 규칙: docs/04-content-format.md
import { z } from "zod";
import { ACTIONS_BY_PLAYER } from "./labels.ts";
import { checkScene } from "./scene.ts";

export { ACTIONS_BY_PLAYER, CATEGORY_LABELS, PLAYER_LABELS } from "./labels.ts";

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "소문자·숫자·하이픈만 쓸 수 있습니다");
const text = z.string().trim().min(1, "빈 문자열은 안 됩니다");

/* ---------- 3D 장면 어휘 (docs/06, 모두 선택 항목) ---------- */
export const ACTOR_KINDS = ["browser", "tab", "cookieJar", "server", "database", "network", "attacker", "person"] as const;
export const ZONES = ["client", "between", "server", "internal", "outside"] as const;
export const ITEMS = ["cookie", "token", "script", "data", "coin"] as const;

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
  zone: z.enum(ZONES).optional(),
  parent: text.optional(),
  site: text.optional(),
  tone: z.enum(["attack", "neutral"]).optional(),
  gate: z.boolean().default(false),
  balance: z.int().nonnegative().optional(),
  screen: screenSchema.optional(),
  back: screenSchema.optional(),
});

const stepSchema = z.strictObject({
  action: z.enum(["send", "push", "pop", "acquire", "wait", "release"]),
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
});

const defenseSchema = z.strictObject({
  name: text,
  kind: z.enum(["defense", "solution"]),
  description: text,
  blockedAtStep: z.int().min(1).optional(),
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
    }),
    defenses: z.array(defenseSchema).default([]),
    references: z.array(z.strictObject({ title: text, url: z.url() })).min(1),
    related: z.array(id).default([]),
  })
  .superRefine((term, ctx) => {
    const { playerType, actors, steps } = term.scenario;
    const actorIds = new Set<string>();
    actors.forEach((actor, i) => {
      if (actorIds.has(actor.id)) {
        ctx.addIssue({ code: "custom", path: ["scenario", "actors", i, "id"], message: `중복된 행위자 id: ${actor.id}` });
      }
      actorIds.add(actor.id);
    });

    const allowed: readonly string[] = ACTIONS_BY_PLAYER[playerType];
    steps.forEach((step, i) => {
      if (!allowed.includes(step.action)) {
        ctx.addIssue({
          code: "custom",
          path: ["scenario", "steps", i, "action"],
          message: `${playerType} 플레이어에서 쓸 수 없는 action: ${step.action} (허용: ${allowed.join(", ")})`,
        });
      }
      for (const key of ["from", "to"] as const) {
        if (!actorIds.has(step[key])) {
          ctx.addIssue({ code: "custom", path: ["scenario", "steps", i, key], message: `actors에 없는 행위자: ${step[key]}` });
        }
      }
    });

    term.defenses.forEach((defense, i) => {
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

/** /content/index.json의 항목 하나 */
export type IndexEntry = Pick<Term, "id" | "name" | "englishName" | "aliases" | "category" | "summary"> & {
  playerType: PlayerType;
  stepCount: number;
  defenseCount: number;
};
