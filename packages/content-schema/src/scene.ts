// 장면 해석 규칙(zod 없음). 검증기·2D 대체 화면·3D 장면이 같은 규칙을 쓰도록 한 곳에 둔다. 규칙: docs/04, docs/06
import type { Actor, ActorKind, Effect, Item, Look, PlayerType, Step, Term, Zone } from "./index.ts";

/** null = 공격 흐름, 숫자 = 켜진 방어의 defenses 인덱스 */
export type Mode = number | null;
export type Tone = "neutral" | "attack" | "defense";
export type Issue = { path: (string | number)[]; message: string };

const KIND_BY_ROLE: Record<string, ActorKind> = { user: "person", attacker: "attacker", server: "server", database: "database", process: "thread", resource: "resource" };

/** 플레이어마다 쓸 수 있는 효과 어휘 (docs/04) */
export const EFFECTS_BY_PLAYER: Record<PlayerType, readonly Effect["type"][]> = {
  flow: ["appear", "flip", "rewrite", "store", "attach", "give", "run", "inspect", "transfer"],
  stack: ["locals", "returnValue"],
  lock: ["condition", "take", "cycle", "timeout", "stamp"],
};
const ZONE_BY_ROLE: Record<string, Zone> = { attacker: "outside", server: "server", database: "server" };

export const kindOf = (actor: Actor): ActorKind => actor.kind ?? KIND_BY_ROLE[actor.role] ?? "person";

export function zoneOf(actor: Actor, actors: readonly Actor[], depth = 0): Zone {
  if (actor.zone) return actor.zone;
  const parent = actor.parent ? actors.find((a) => a.id === actor.parent) : undefined;
  if (parent && depth < actors.length) return zoneOf(parent, actors, depth + 1);
  return ZONE_BY_ROLE[actor.role] ?? "client";
}

/** 구역의 깊이(사용자 쪽 0 → 사내망 3). 검문소는 서버 앞에 서므로 더 깊은 구역에서 오는 봉투는 검문소를 지나지 않는다 */
export const ZONE_DEPTH: Record<Zone, number> = { client: 0, outside: 0, between: 1, server: 2, internal: 3 };
export const passesGate = (term: Term, from: string, to: string) => {
  const { actors } = term.scenario;
  const a = actors.find((x) => x.id === from);
  const b = actors.find((x) => x.id === to);
  return Boolean(a && b && b.gate && from !== to && ZONE_DEPTH[zoneOf(a, actors)] <= ZONE_DEPTH[zoneOf(b, actors)]);
};

/** look을 쓸 수 있는 kind. 건물형(bank·web·shop·community)·메타데이터는 서버, database는 서버·DB, wifi는 네트워크 */
export const LOOK_KINDS: Record<Look, readonly ActorKind[]> = {
  bank: ["server"],
  web: ["server"],
  shop: ["server"],
  community: ["server"],
  "cloud-metadata": ["server"],
  database: ["server", "database"],
  wifi: ["network"],
  laptop: ["server"],
  printer: ["resource"],
  scanner: ["resource"],
};

/** 화면판이 있는 행위자: 탭은 항상, 서버·DB는 screen이 있을 때. rewrite·flip은 여기에만 쓸 수 있다 */
export const hasPanel = (actor: Actor) => {
  const kind = kindOf(actor);
  return kind === "tab" || ((kind === "server" || kind === "database") && actor.screen !== undefined);
};

/** 모드로 고를 수 있는지: 방어는 차단 단계가 있을 때(그 단계에서 멈춤), 해결 방법은 대체 흐름이 있을 때(갈림 단계부터 끝까지) */
const hasMode = (d: Term["defenses"][number]) => d.blockedAtStep !== undefined || d.branchAtStep !== undefined;

/** 모드 탭에서 고를 수 있는 방어·해결 방법(defenses 인덱스) */
export const modeDefenses = (term: Pick<Term, "defenses">) => term.defenses.flatMap((d, i) => (hasMode(d) ? [i] : []));

/** 목록·상세 카드의 개수: 모드가 있는 방어·해결 방법과, 설명만 있는 보조(모드 없음)를 따로 센다 */
export const defenseCounts = (term: Pick<Term, "defenses">) => {
  const defenseCount = term.defenses.filter(hasMode).length;
  return { defenseCount, supportCount: term.defenses.length - defenseCount };
};

/** 이 모드의 마지막 단계(0부터): 기본 흐름은 끝, 방어는 차단 단계, 해결 방법은 갈림 단계 앞 + 대체 흐름 길이 */
export function lastStepIndex(term: Term, mode: Mode): number {
  const d = mode === null ? undefined : term.defenses[mode];
  if (d?.branchAtStep !== undefined && d.steps) return d.branchAtStep - 1 + d.steps.length - 1;
  return (d?.blockedAtStep ?? term.scenario.steps.length) - 1;
}

/** 이 모드의 index번째 단계 원본(해결 방법이면 갈림 단계부터 대체 흐름) */
export function stepAt(term: Term, mode: Mode, index: number): Step {
  const d = mode === null ? undefined : term.defenses[mode];
  if (d?.branchAtStep !== undefined && d.steps && index >= d.branchAtStep - 1) return d.steps[index - (d.branchAtStep - 1)]!;
  return term.scenario.steps[index]!;
}

export type StepView = {
  index: number;
  from: string;
  to: string;
  title: string;
  caption: string;
  /** 출발할 때의 봉투 라벨 */
  label: string;
  /** attach 효과로 물건이 실제로 붙은 뒤의 라벨 (예: "POST /transfer + Cookie") */
  attachedLabel: string;
  tone: Tone;
  blocked: boolean;
  blockedLabel?: string;
  effects: Effect[];
  roundTrip: boolean;
  returnLabel?: string;
  via?: string;
  camera?: { focus: string; distance?: "near" | "mid" | "far" };
  action: Step["action"];
  line?: number;
};

export function stepView(term: Term, mode: Mode, index: number): StepView {
  const step = stepAt(term, mode, index);
  const defense = mode === null ? undefined : term.defenses[mode];
  const branched = defense?.branchAtStep !== undefined && index >= defense.branchAtStep - 1;
  const override = branched ? undefined : defense?.overrides.find((o) => o.step === index + 1);
  const blocked = defense?.blockedAtStep === index + 1;
  const effects = override?.effects ?? step.effects;
  const attached = effects.flatMap((e) => (e.type === "attach" && !e.refused && e.label ? [e.label] : []));
  return {
    index,
    from: step.from,
    to: step.to,
    title: (blocked ? defense?.blockedTitle : undefined) ?? override?.title ?? step.title,
    caption: blocked ? defense!.blockedCaption! : (override?.caption ?? step.caption),
    label: step.label,
    attachedLabel: [step.label, ...attached].join(" + "),
    tone: blocked ? "defense" : step.danger ? "attack" : "neutral",
    blocked,
    blockedLabel: blocked ? defense?.blockedLabel : undefined,
    effects,
    roundTrip: step.roundTrip,
    returnLabel: step.returnLabel,
    via: step.via,
    camera: step.camera,
    action: step.action,
    line: step.line,
  };
}

/**
 * 차단 도장을 찍는 행위자. 검사(inspect)가 있으면 그 검문소, 없으면 거부된 효과의 대상
 * (run → 실행하려던 탭, attach → 꺼내려던 곳, give → 받으려던 쪽), 그것도 없으면 목적지 (docs/04 방어 모드 동작)
 */
export function blockTarget(view: Pick<StepView, "to" | "effects">): string {
  for (const e of view.effects) if (e.type === "inspect") return e.at;
  for (const e of view.effects) {
    if (e.type === "run" && e.refused) return e.target;
    if (e.type === "attach" && e.refused) return e.from;
    if (e.type === "give" && e.refused) return e.to;
  }
  return view.to;
}

/** 봉투가 도착해 물건을 내려놓는 곳. 왕복이면 출발한 쪽으로 돌아온다 */
export const deliveryTarget = (view: Pick<StepView, "from" | "to" | "roundTrip">) => (view.roundTrip ? view.from : view.to);

/* ---------- 검증 ---------- */

function refsOf(e: Effect): [string, string][] {
  switch (e.type) {
    case "appear":
    case "flip":
    case "rewrite":
    case "run":
      return [["target", e.target]];
    case "store":
      return [["into", e.into]];
    case "attach":
      return [["from", e.from]];
    case "give":
      return e.from === "packet" ? [["to", e.to]] : [["from", e.from], ["to", e.to]];
    case "inspect":
      return [["at", e.at]];
    case "transfer":
      return [["from", e.from], ["to", e.to]];
    case "locals":
      return e.target ? [["target", e.target]] : [];
    case "take":
      return [["from", e.from]];
    case "returnValue":
    case "condition":
    case "cycle":
    case "timeout":
    case "stamp":
      return [];
  }
}

const ITEM_NAMES: Record<Item, string> = { cookie: "쿠키", token: "토큰", script: "스크립트", data: "데이터", coin: "돈" };

export function checkScene(term: Term): Issue[] {
  const issues: Issue[] = [];
  const { actors, steps, playerType } = term.scenario;
  const byId = new Map(actors.map((a) => [a.id, a]));

  actors.forEach((a, i) => {
    if (a.look && !LOOK_KINDS[a.look].includes(kindOf(a))) {
      issues.push({ path: ["scenario", "actors", i, "look"], message: `look ${a.look}은(는) ${LOOK_KINDS[a.look].join("·")}에만 쓸 수 있습니다(지금 kind: ${kindOf(a)})` });
    }
    if (!a.parent) return;
    if (!byId.has(a.parent)) {
      issues.push({ path: ["scenario", "actors", i, "parent"], message: `actors에 없는 행위자: ${a.parent}` });
      return;
    }
    const chain = [a.id];
    for (let p = byId.get(a.parent); p; p = p.parent ? byId.get(p.parent) : undefined) {
      if (chain.includes(p.id)) {
        issues.push({ path: ["scenario", "actors", i, "parent"], message: `parent가 순환합니다: ${[...chain, p.id].join(" → ")}` });
        break;
      }
      chain.push(p.id);
    }
  });

  const checkEffects = (effects: Effect[], base: (string | number)[], step: Step | undefined) =>
    effects.forEach((e, j) => {
      const path = [...base, j];
      if (!EFFECTS_BY_PLAYER[playerType].includes(e.type)) {
        issues.push({ path: [...path, "type"], message: `${playerType} 플레이어에서 쓸 수 없는 효과: ${e.type} (허용: ${EFFECTS_BY_PLAYER[playerType].join(", ")})` });
      }
      for (const [key, ref] of refsOf(e)) {
        if (!byId.has(ref)) issues.push({ path: [...path, key], message: `actors에 없는 행위자: ${ref}` });
      }
      const target = "target" in e && e.target ? byId.get(e.target) : undefined;
      if ((e.type === "flip" || e.type === "rewrite") && target && !hasPanel(target)) {
        issues.push({ path: [...path, "target"], message: `${e.target}에는 화면판이 없습니다(탭, 또는 screen이 있는 server·database만)` });
      }
      if (e.type === "inspect" && step && byId.has(step.to)) {
        if (e.at !== step.to) issues.push({ path: [...path, "at"], message: `inspect.at은 이 단계의 목적지(${step.to})여야 합니다` });
        else if (!byId.get(step.to)!.gate) issues.push({ path: [...path, "at"], message: `inspect는 검문소(gate)가 있는 목적지에서만 그려집니다: ${step.to}` });
        else if (!passesGate(term, step.from, step.to)) issues.push({ path: [...path, "at"], message: `뒤쪽 구역에서 오는 봉투는 ${step.to}의 검문소를 지나지 않습니다` });
      }
      if (e.type === "flip" && target && !target.back) {
        issues.push({ path: [...path, "target"], message: `뒤집을 ${e.target}에 back 화면이 없습니다` });
      }
      if (e.type === "rewrite" && e.side === "back" && target && !target.back) {
        issues.push({ path: [...path, "side"], message: `${e.target}에 back 화면이 없습니다` });
      }
      if (e.type === "run" && target && kindOf(target) !== "tab") {
        issues.push({ path: [...path, "target"], message: `run은 tab에서만 실행됩니다: ${e.target}` });
      }
    });

  steps.forEach((s, i) => {
    if (s.via && !byId.has(s.via)) issues.push({ path: ["scenario", "steps", i, "via"], message: `actors에 없는 행위자: ${s.via}` });
    if (s.camera && s.camera.focus !== "all" && !byId.has(s.camera.focus)) {
      issues.push({ path: ["scenario", "steps", i, "camera", "focus"], message: `actors에 없는 행위자: ${s.camera.focus}` });
    }
    checkEffects(s.effects, ["scenario", "steps", i, "effects"], s);
  });

  term.defenses.forEach((d, di) => {
    const seenSteps = new Set<number>();
    d.overrides.forEach((o, oi) => {
      const path = ["defenses", di, "overrides", oi];
      const limit = d.blockedAtStep ?? steps.length;
      if (o.step > limit) issues.push({ path: [...path, "step"], message: `override 단계 ${o.step}가 범위(1~${limit})를 벗어납니다` });
      if (seenSteps.has(o.step)) issues.push({ path: [...path, "step"], message: `같은 단계의 override가 두 번 있습니다: ${o.step}` });
      seenSteps.add(o.step);
      if (o.effects) checkEffects(o.effects, [...path, "effects"], steps[o.step - 1]);
    });
    d.steps?.forEach((s, si) => {
      if (s.via && !byId.has(s.via)) issues.push({ path: ["defenses", di, "steps", si, "via"], message: `actors에 없는 행위자: ${s.via}` });
      checkEffects(s.effects, ["defenses", di, "steps", si, "effects"], s);
    });
  });

  // 물건 흐름: 꺼내려는 곳에 그 물건이 그 시점에 실제로 있는지, 모드(공격 흐름·방어별)마다 단계를 따라가며 확인한다
  const effectPath = (mode: Mode, i: number, j: number): (string | number)[] => {
    const d = mode === null ? undefined : term.defenses[mode]!;
    if (d?.branchAtStep !== undefined && d.steps && i >= d.branchAtStep - 1) return ["defenses", mode!, "steps", i - (d.branchAtStep - 1), "effects", j];
    const oi = mode === null ? -1 : term.defenses[mode]!.overrides.findIndex((o) => o.step === i + 1 && o.effects);
    return oi >= 0 ? ["defenses", mode!, "overrides", oi, "effects", j] : ["scenario", "steps", i, "effects", j];
  };
  const reported = new Set<string>();
  const report = (path: (string | number)[], message: string) => {
    const key = path.join(".");
    if (reported.has(key)) return;
    reported.add(key);
    issues.push({ path, message });
  };
  for (const mode of [null, ...term.defenses.map((_, i) => i)] as Mode[]) {
    const holdings = new Map<string, Set<Item>>();
    const holds = (id: string, it: Item) => holdings.get(id)?.has(it) ?? false;
    const add = (id: string, it: Item) => holdings.set(id, (holdings.get(id) ?? new Set<Item>()).add(it));
    for (let i = 0; i <= Math.min(lastStepIndex(term, mode), steps.length - 1); i++) {
      const view = stepView(term, mode, i);
      const packet = new Set<Item>();
      view.effects.forEach((e, j) => {
        const path = effectPath(mode, i, j);
        if (e.type === "store") add(e.into, e.item);
        if (e.type === "attach") {
          if (!holds(e.from, e.item)) report([...path, "from"], `${i + 1}단계에서 ${e.from}에 ${ITEM_NAMES[e.item]}이(가) 없습니다`);
          if (!e.refused) packet.add(e.item);
        }
        if (e.type === "give") {
          if (e.from === "packet" && !packet.has(e.item)) {
            report([...path, "from"], `${i + 1}단계 봉투에 ${ITEM_NAMES[e.item]}이(가) 붙어 있지 않습니다`);
          }
          if (!e.refused) add(e.to, e.item);
        }
        if (e.type === "transfer") add(e.to, e.item);
        if (e.type === "run" && !holds(e.target, e.item)) {
          report([...path, "target"], `${i + 1}단계에서 ${e.target}에 실행할 ${ITEM_NAMES[e.item]}이(가) 없습니다`);
        }
      });
      for (const it of packet) add(deliveryTarget(view), it);
    }
  }
  issues.push(...checkMachine(term));
  return issues;
}

/** 단계 위치(모드마다 기본 흐름·override·대체 흐름 중 어디에 적혔는지) */
function stepPath(term: Term, mode: Mode, i: number): (string | number)[] {
  const d = mode === null ? undefined : term.defenses[mode]!;
  if (d?.branchAtStep !== undefined && d.steps && i >= d.branchAtStep - 1) return ["defenses", mode!, "steps", i - (d.branchAtStep - 1)];
  return ["scenario", "steps", i];
}

/**
 * 스택형·점유형 상태 검사(모드마다 단계를 따라간다).
 * 스택: push는 맨 위 함수가 부른다(첫 push는 from === to로 진입점), pop은 맨 위 함수가 바로 아래 함수로 돌아간다, run은 맨 위 함수가 제자리에서 실행.
 * 점유: acquire는 아무도 안 잡은 자원, wait는 다른 스레드가 잡은 자원, release는 자기가 잡은 자원
 */
function checkMachine(term: Term): Issue[] {
  const { playerType, code } = term.scenario;
  if (playerType === "flow") return [];
  const issues: Issue[] = [];
  const reported = new Set<string>();
  const report = (path: (string | number)[], message: string) => {
    const key = path.join(".");
    if (!reported.has(key)) issues.push({ path, message });
    reported.add(key);
  };
  for (const mode of [null, ...term.defenses.map((_, i) => i)] as Mode[]) {
    const stack: string[] = [];
    const owner = new Map<string, string>(); // 자원 → 잡은 스레드
    for (let i = 0; i <= lastStepIndex(term, mode); i++) {
      const s = stepAt(term, mode, i);
      const path = stepPath(term, mode, i);
      if (playerType === "stack") {
        const top = stack.at(-1);
        if (s.line !== undefined && code && s.line > code.lines.length) report([...path, "line"], `코드 판에 ${s.line}행이 없습니다(${code.lines.length}행)`);
        if (s.action === "push") {
          if (top === undefined ? s.from !== s.to : s.from !== top) report([...path, "from"], top === undefined ? "첫 push는 진입점이라 from과 to가 같아야 합니다" : `push는 맨 위 함수(${top})가 부릅니다`);
          stack.push(s.to);
        } else if (s.action === "pop") {
          if (s.from !== top) report([...path, "from"], `pop은 맨 위 함수(${top ?? "없음"})가 돌아갑니다`);
          else if (stack.length > 1 && s.to !== stack.at(-2)) report([...path, "to"], `돌아갈 곳은 바로 아래 함수(${stack.at(-2)})입니다`);
          stack.pop();
        } else if (s.action === "run" && (s.from !== top || s.to !== top)) report([...path, "from"], `run은 맨 위 함수(${top ?? "없음"})가 제자리에서 실행합니다`);
        s.effects.forEach((e, j) => {
          if (e.type === "returnValue" && s.action !== "pop") report([...path, "effects", j, "type"], "returnValue는 pop 단계에만 씁니다");
        });
      } else {
        const held = owner.get(s.to);
        if (s.action === "acquire" && held !== undefined && held !== s.from) report([...path, "to"], `${s.to}는 ${held}가 잡고 있어 acquire할 수 없습니다(wait를 쓰세요)`);
        if (s.action === "wait" && (held === undefined || held === s.from)) report([...path, "to"], `${s.to}를 다른 스레드가 잡고 있지 않아 기다릴 필요가 없습니다`);
        if (s.action === "release" && held !== s.from) report([...path, "to"], `${s.from}는 ${s.to}를 잡고 있지 않습니다`);
        if (s.action === "acquire") owner.set(s.to, s.from);
        if (s.action === "release") owner.delete(s.to);
        s.effects.forEach((e, j) => {
          if (e.type === "take" && owner.get(s.to) !== e.from) report([...path, "effects", j, "from"], `${e.from}는 ${s.to}를 잡고 있지 않습니다`);
          if (e.type === "take" && !e.refused) owner.set(s.to, s.from);
        });
      }
    }
  }
  return issues;
}
