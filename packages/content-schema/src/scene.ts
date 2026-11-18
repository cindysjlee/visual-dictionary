// 장면 해석 규칙(zod 없음). 검증기·2D 대체 화면·3D 장면이 같은 규칙을 쓰도록 한 곳에 둔다. 규칙: docs/04, docs/06
import type { Actor, ActorKind, Effect, Item, Term, Zone } from "./index.ts";

/** null = 공격 흐름, 숫자 = 켜진 방어의 defenses 인덱스 */
export type Mode = number | null;
export type Tone = "neutral" | "attack" | "defense";
export type Issue = { path: (string | number)[]; message: string };

const KIND_BY_ROLE: Record<string, ActorKind> = { user: "person", attacker: "attacker", server: "server", database: "database" };
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

/** 화면판이 있는 행위자: 탭은 항상, 서버·DB는 screen이 있을 때. rewrite·flip은 여기에만 쓸 수 있다 */
export const hasPanel = (actor: Actor) => {
  const kind = kindOf(actor);
  return kind === "tab" || ((kind === "server" || kind === "database") && actor.screen !== undefined);
};

/** 방어 모드에서 고를 수 있는 방어 = 차단 단계가 있는 방어 */
export const blockingDefenses = (term: Term) =>
  term.defenses.flatMap((d, i) => (d.blockedAtStep === undefined ? [] : [i]));

export function lastStepIndex(term: Term, mode: Mode): number {
  const blockedAt = mode === null ? undefined : term.defenses[mode]?.blockedAtStep;
  return (blockedAt ?? term.scenario.steps.length) - 1;
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
};

export function stepView(term: Term, mode: Mode, index: number): StepView {
  const step = term.scenario.steps[index]!;
  const defense = mode === null ? undefined : term.defenses[mode];
  const override = defense?.overrides.find((o) => o.step === index + 1);
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
  }
}

const ITEM_NAMES: Record<Item, string> = { cookie: "쿠키", token: "토큰", script: "스크립트", data: "데이터", coin: "돈" };

export function checkScene(term: Term): Issue[] {
  const issues: Issue[] = [];
  const { actors, steps, playerType } = term.scenario;
  const byId = new Map(actors.map((a) => [a.id, a]));

  actors.forEach((a, i) => {
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

  const checkEffects = (effects: Effect[], base: (string | number)[], stepIndex: number) =>
    effects.forEach((e, j) => {
      const path = [...base, j];
      if (playerType !== "flow") {
        issues.push({ path: [...path, "type"], message: `${playerType} 플레이어의 효과 어휘는 4단계에서 정합니다` });
      }
      for (const [key, ref] of refsOf(e)) {
        if (!byId.has(ref)) issues.push({ path: [...path, key], message: `actors에 없는 행위자: ${ref}` });
      }
      const target = "target" in e ? byId.get(e.target) : undefined;
      if ((e.type === "flip" || e.type === "rewrite") && target && !hasPanel(target)) {
        issues.push({ path: [...path, "target"], message: `${e.target}에는 화면판이 없습니다(탭, 또는 screen이 있는 server·database만)` });
      }
      const step = steps[stepIndex];
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
    checkEffects(s.effects, ["scenario", "steps", i, "effects"], i);
  });

  term.defenses.forEach((d, di) => {
    const seenSteps = new Set<number>();
    d.overrides.forEach((o, oi) => {
      const path = ["defenses", di, "overrides", oi];
      const limit = d.blockedAtStep ?? steps.length;
      if (o.step > limit) issues.push({ path: [...path, "step"], message: `override 단계 ${o.step}가 범위(1~${limit})를 벗어납니다` });
      if (seenSteps.has(o.step)) issues.push({ path: [...path, "step"], message: `같은 단계의 override가 두 번 있습니다: ${o.step}` });
      seenSteps.add(o.step);
      if (o.effects) checkEffects(o.effects, [...path, "effects"], o.step - 1);
    });
  });

  // 물건 흐름: 꺼내려는 곳에 그 물건이 그 시점에 실제로 있는지, 모드(공격 흐름·방어별)마다 단계를 따라가며 확인한다
  const effectPath = (mode: Mode, i: number, j: number): (string | number)[] => {
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
  return issues;
}
