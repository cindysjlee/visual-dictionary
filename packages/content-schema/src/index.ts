// 용어 JSON의 유일한 스키마. 빌드 검증기(scripts)와 프론트엔드(apps/web)가 함께 쓴다. 규칙: docs/04-content-format.md
import { z } from "zod";

export const CATEGORY_LABELS = {
  "web-security": "웹 보안",
  network: "네트워크",
  os: "운영체제",
  runtime: "자료구조·런타임",
} as const;

export const ACTIONS_BY_PLAYER = {
  flow: ["send"],
  stack: ["push", "pop"],
  lock: ["acquire", "wait", "release"],
} as const;

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "소문자·숫자·하이픈만 쓸 수 있습니다");
const text = z.string().trim().min(1, "빈 문자열은 안 됩니다");

// strictObject: 오타 난 필드(예: "dangr")가 조용히 버려지지 않고 오류가 되게 한다
const actorSchema = z.strictObject({ id: text, name: text, role: text });

const stepSchema = z.strictObject({
  action: z.enum(["send", "push", "pop", "acquire", "wait", "release"]),
  from: text,
  to: text,
  label: text,
  caption: text,
  danger: z.boolean().default(false),
});

const defenseSchema = z.strictObject({
  name: text,
  kind: z.enum(["defense", "solution"]),
  description: text,
  blockedAtStep: z.int().min(1).optional(),
  blockedLabel: text.optional(),
  blockedCaption: text.optional(),
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
  });

/** 기본값이 채워진 용어. /content/terms/<id>.json의 형식 */
export type Term = z.output<typeof termSchema>;
export type Category = Term["category"];
export type PlayerType = Term["scenario"]["playerType"];

/** /content/index.json의 항목 하나 */
export type IndexEntry = Pick<Term, "id" | "name" | "englishName" | "aliases" | "category" | "summary"> & {
  playerType: PlayerType;
};
