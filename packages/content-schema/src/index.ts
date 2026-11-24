// 용어 JSON의 유일한 스키마. 빌드 검증기(scripts)와 프론트엔드(apps/web)가 함께 쓴다. 규칙: docs/04-content-format.md
import { z } from "zod";
import { DEFINITION_MAX, DRAFT_DESCRIPTION, NOTES_MAX, explanationParagraphs, sentencesOf } from "./explain.ts";
import { ACTIONS_BY_PLAYER } from "./labels.ts";
import { markCount, parseMarks, plainText } from "./marks.ts";
import { checkScene } from "./scene.ts";

export { ACTIONS_BY_PLAYER, CATEGORY_LABELS, PLAYER_LABELS } from "./labels.ts";
export { markCount, noteWords, parseMarks, plainText, type MarkSegment } from "./marks.ts";

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "소문자·숫자·하이픈만 쓸 수 있습니다");
const text = z.string().trim().min(1, "빈 문자열은 안 됩니다");
/** 본문(방어 설명, 이전 형식의 뜻풀이): ==형광펜==과 `코드` 표시를 쓸 수 있다. 짝이 안 맞거나 다른 문법이면 실패, 형광펜은 문단마다 최대 한 군데(docs/04 "본문 표시"). 각주([[ ]])는 설명 틀(noted)에서만 */
const marked = text.superRefine((v, ctx) => {
  const { segments, error } = parseMarks(v);
  if (error) ctx.addIssue({ code: "custom", message: error });
  else if (markCount(v) > 1) ctx.addIssue({ code: "custom", message: "형광펜(==)은 문단마다 최대 한 군데입니다" });
  else if (segments.some((s) => s.kind === "note")) ctx.addIssue({ code: "custom", message: "각주([[ ]])는 설명 틀(description의 정의·비유·과정·이유) 안에서만 씁니다" });
});
/** 설명 틀의 문단: marked와 같은 규칙에 각주([[단어]])를 더 쓸 수 있다 */
const noted = text.superRefine((v, ctx) => {
  const { error } = parseMarks(v);
  if (error) ctx.addIssue({ code: "custom", message: error });
  else if (markCount(v) > 1) ctx.addIssue({ code: "custom", message: "형광펜(==)은 문단마다 최대 한 군데입니다" });
});

/**
 * 설명 틀(docs/04 "설명 틀"): 한 줄 정의 → 쉬운 비유 → 어떻게 일어나나(조건과 흐름) → 왜 위험한가(CS 용어는 왜 중요한가).
 * 문단 배열의 원소 하나가 문단 하나다(형광펜은 문단마다 최대 한 군데). 정의는 한 문장
 */
export const explanationSchema = z.strictObject({
  definition: noted.superRefine((v, ctx) => {
    if ([...plainText(v)].length > DEFINITION_MAX) ctx.addIssue({ code: "custom", message: `한 줄 정의는 ${DEFINITION_MAX}자 이하입니다` });
    if (sentencesOf(v).length > 1) ctx.addIssue({ code: "custom", message: "한 줄 정의는 한 문장입니다" });
  }),
  analogy: z.array(noted).min(1).max(3),
  how: z.array(noted).min(2).max(4),
  why: z.array(noted).min(1).max(3),
});
export type Explanation = z.output<typeof explanationSchema>;

/**
 * description: 설명 틀(객체). 문자열 한 문단(이전 형식)은 없어졌고, 초안 자리 표시 DRAFT_DESCRIPTION만 문자열로 허용한다(status draft에서만, 아래 termSchema).
 * 값의 종류로 갈라 검사해서, 오류 위치가 description.how[1]처럼 자세히 나온다(z.union은 위치를 뭉갠다)
 */
const descriptionSchema = z.unknown().transform((value, ctx): typeof DRAFT_DESCRIPTION | Explanation => {
  if (value === DRAFT_DESCRIPTION) return DRAFT_DESCRIPTION;
  if (typeof value === "string") {
    ctx.addIssue({ code: "custom", message: "설명은 한 줄 정의·쉬운 비유·어떻게 일어나나·왜 위험한가(중요한가) 네 부분 객체로 씁니다. 문자열 한 문단(이전 형식)은 쓸 수 없습니다" });
    return z.NEVER;
  }
  const result = explanationSchema.safeParse(value);
  if (result.success) return result.data;
  for (const issue of result.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
  return z.NEVER;
});

/** 각주 풀이 사전 content/glossary.json의 항목(docs/04 "각주"). word는 본문의 [[단어]]와 같아야 한다 */
export const glossaryEntrySchema = z.strictObject({
  word: z
    .string()
    .trim()
    .min(1, "빈 문자열은 안 됩니다")
    .max(20)
    .refine((w) => !/[[\]`=\n]/.test(w), "단어에는 [ ] ` = 와 줄바꿈을 쓸 수 없습니다"),
  /** 짧은 풀이: 1~2문장. `코드` 표기만 쓸 수 있다 */
  gloss: text.max(120, "풀이는 120자 이하로 짧게 씁니다").superRefine((v, ctx) => {
    const { segments, error } = parseMarks(v);
    if (error) ctx.addIssue({ code: "custom", message: error });
    else if (segments.some((s) => s.kind !== "text" && s.kind !== "code")) ctx.addIssue({ code: "custom", message: "풀이에는 `코드` 표기만 쓸 수 있습니다(형광펜·각주 없음)" });
    if (sentencesOf(v).length > 2) ctx.addIssue({ code: "custom", message: "풀이는 1~2문장입니다" });
  }),
  /** 같은 이름의 용어가 있으면 그 id. 그 용어가 공개돼 있으면 화면은 풀이 대신 그 용어 쪽으로 링크한다 */
  term: id.optional(),
});
export const glossarySchema = z.array(glossaryEntrySchema).superRefine((entries, ctx) => {
  const seen = new Set<string>();
  entries.forEach((e, i) => {
    if (seen.has(e.word)) ctx.addIssue({ code: "custom", path: [i, "word"], message: `중복된 단어: ${e.word}` });
    seen.add(e.word);
  });
});
export type GlossaryEntry = z.output<typeof glossaryEntrySchema>;

/* ---------- 3D 장면 어휘 (docs/06, 모두 선택 항목) ---------- */
export const ACTOR_KINDS = ["browser", "tab", "frame", "cookieJar", "server", "database", "network", "attacker", "person", "thread", "resource"] as const;
export const ZONES = ["client", "between", "server", "internal", "outside"] as const;
export const ITEMS = ["cookie", "token", "script", "data", "coin"] as const;
/** 행위자 생김새(docs/06 2절 "생김새"). 없으면 kind의 기본 모양. 어느 kind에 쓸 수 있는지는 scene.ts의 LOOK_KINDS */
export const LOOKS = ["bank", "web", "shop", "community", "database", "cloud-metadata", "wifi", "laptop", "printer", "scanner", "memory"] as const;
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
  // 칸(slots)이 있는 행위자의 칸을 채움(가득 차 있으면 refused로 거절)·비움. 예: SYN-RECEIVED 대기열, 연결 풀
  z.strictObject({ type: z.literal("occupy"), target: text, count: z.int().min(1).default(1), label: text.optional(), ...refusal }),
  z.strictObject({ type: z.literal("vacate"), target: text, count: z.int().min(1).default(1) }),
  // 겹친 화면(frame)의 불투명도(0 = 완전히 투명, 1 = 그대로). 예: 클릭재킹의 투명 iframe
  z.strictObject({ type: z.literal("opacity"), target: text, value: z.number().min(0).max(1) }),
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
  // 스택 한도(scenario.stackLimit)를 넘는 push: 프레임이 한도선을 뚫고 선이 공격색으로 깜빡인다. 그 모드의 마지막 단계
  z.strictObject({ type: z.literal("overflow") }),
  /* 점유형(lock) */
  // 조건 패널 한 칸: 성립(기본) 또는 해결 방법이 그 조건을 깸(broken)
  z.strictObject({ type: z.literal("condition"), name: z.enum(DEADLOCK_CONDITIONS), broken: z.boolean().default(false) }),
  // 다른 스레드가 잡은 자원을 빼앗으려 함. 비선점이면 refused
  z.strictObject({ type: z.literal("take"), from: text, ...refusal }),
  z.strictObject({ type: z.literal("cycle") }), // 대기 관계가 고리를 이룸(바닥 고리, 위에서 보는 샷)
  z.strictObject({ type: z.literal("timeout") }), // 기다리다 포기(모래시계가 다 됨). 보통 release 단계에 붙는다
  z.strictObject({ type: z.literal("stamp"), label: text, tone: z.enum(["attack", "defense"]).default("attack") }),
  // 점유형 공유 값: access 단계에서 스레드가 자원의 값을 읽어 손의 메모 카드에 적거나(read), 카드의 값을 자원에 쓴다(write, note는 계산식)
  z.strictObject({ type: z.literal("read"), value: text }),
  z.strictObject({ type: z.literal("write"), value: text, note: text.optional() }),
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
  /** 점유형 자원의 공유 값(값판에 보인다). write로 바뀐다. 예: "100" */
  value: text.optional(),
  screen: screenSchema.optional(),
  back: screenSchema.optional(),
  /** 화면판 내용을 늘 HTML 라벨로도 보여 준다(판 글씨가 작아도 상태가 읽히게). 화면판이 있는 행위자만 */
  mirrorScreen: z.boolean().default(false),
  /** 서버·DB 앞에 놓인 칸 선반(occupy·vacate로 채우고 비움). 예: { label: "SYN-RECEIVED 대기열", size: 6 } */
  slots: z.strictObject({ label: text, size: z.int().min(1).max(8) }).optional(),
});

const stepSchema = z.strictObject({
  action: z.enum(["send", "push", "pop", "run", "acquire", "wait", "release", "access"]),
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
  // view "side": 이 단계만 옆에서 본다(겹친 두 판이 앞뒤로 떨어져 있는 것 등). 다음 단계는 기본 방향으로 돌아온다
  camera: z.strictObject({ focus: text, distance: z.enum(["near", "mid", "far"]).optional(), view: z.enum(["side"]).optional() }).optional(),
  line: z.int().min(1).optional(), // 스택형: 이 단계 뒤 맨 위 프레임이 실행 중인 코드 줄(scenario.code, 1부터)
  burst: z.int().min(2).max(8).optional(), // 흐름형: 같은 봉투가 여러 개 연달아 날아감(보이는 개수, 실제 개수는 label에)
});

// 방어(kind: defense)는 blockedAtStep에서 차단되어 멈춘다. 해결 방법(kind: solution)은 branchAtStep부터 steps로 바꿔 끝까지 재생하는 대체 흐름이다
const codeSchema = z.strictObject({ title: text.optional(), lines: z.array(z.string()).min(1) });

const defenseSchema = z.strictObject({
  name: text,
  kind: z.enum(["defense", "solution"]),
  description: marked,
  blockedAtStep: z.int().min(1).optional(),
  branchAtStep: z.int().min(1).optional(),
  steps: z.array(stepSchema).min(1).optional(),
  blockedTitle: text.optional(),
  blockedLabel: text.optional(), // 차단 표시 글자(도장·2D 대체 화면). 예: "403 · 토큰 없음"
  blockedCaption: text.optional(),
  code: codeSchema.optional(), // 스택형 해결 방법: 갈림 단계부터 코드 판이 이 코드로 바뀐다(고친 코드)
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
    description: descriptionSchema,
    status: z.enum(["draft", "published", "retired"]),
    scenario: z.strictObject({
      playerType: z.enum(["flow", "stack", "lock"]),
      actors: z.array(actorSchema).min(1),
      steps: z.array(stepSchema).min(1),
      code: codeSchema.optional(), // 스택형 코드 판
      stackLimit: z.int().min(1).max(12).optional(), // 스택형: 기둥에 긋는 "스택 한도" 선(프레임 칸 수). 넘는 push에는 overflow
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
    // 설명 틀의 각주: 용어당 NOTES_MAX개 이하, 같은 단어는 한 번만(첫 자리에만 표시). 초안 자리 표시는 공개 용어에 남을 수 없다
    if (typeof term.description === "string") {
      if (term.description === DRAFT_DESCRIPTION && term.status !== "draft") {
        ctx.addIssue({ code: "custom", path: ["description"], message: "설명이 아직 초안 자리 표시입니다. 공개(published)하기 전에 설명을 쓰세요" });
      }
    } else {
      const seenNotes = new Set<string>();
      for (const p of explanationParagraphs(term.description)) {
        for (const word of parseMarks(p.text).segments.flatMap((s) => (s.kind === "note" ? [s.text] : []))) {
          if (seenNotes.has(word)) {
            ctx.addIssue({ code: "custom", path: p.part === "definition" ? ["description", "definition"] : ["description", p.part, p.index], message: `같은 각주 단어를 두 번 표시했습니다(첫 번째에만 씁니다): ${word}` });
          }
          seenNotes.add(word);
        }
      }
      if (seenNotes.size > NOTES_MAX) ctx.addIssue({ code: "custom", path: ["description"], message: `각주는 용어당 ${NOTES_MAX}개 이하입니다(지금 ${seenNotes.size}개)` });
    }
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

/** 기본값이 채워진 용어. 원본 content/terms/<id>.json의 형식 */
export type Term = z.output<typeof termSchema>;
/** 화면에 보이는 각주 하나(빌드가 glossary.json에서 찾아 넣는다). link가 있으면 그 용어가 공개돼 있어 풀이 대신 그 용어 쪽으로 링크한다 */
export type Footnote = { word: string; gloss: string; link?: { id: string; name: string } };
/** /content/terms/<id>.json(배포본): 원본에 설명의 각주(나온 순서 = 번호 순서)를 더한 것. 각주가 없으면 빈 배열 */
export type BuiltTerm = Term & { footnotes: Footnote[] };
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
export type IndexEntry = Pick<Term, "id" | "name" | "englishName" | "aliases" | "category" | "summary" | "related"> & {
  playerType: PlayerType;
  stepCount: number;
  defenseCount: number; // 차단 단계가 있는 방어 수
  supportCount: number; // 차단 단계 없는 보조 방어 수
  dangerFrom: number | null; // 처음 위험해지는 단계 번호(1부터), 없으면 null
  blockedAt: number[]; // 방어가 막는 단계 번호들(중복 없이 오름차순)
};
