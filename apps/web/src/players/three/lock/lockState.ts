// 점유형 결과 상태(순수): upTo 단계 직전까지 acquire·wait·release와 조건·고리·도장을 적용한 결과. 단계를 넘기거나 동작 줄이기일 때 바로 적용한다 (docs/04 점유형)
import type { DEADLOCK_CONDITIONS, Term } from "@app/content-schema";
import { lastStepIndex, stepView, type Mode } from "@app/content-schema/scene";

export type Condition = (typeof DEADLOCK_CONDITIONS)[number];
export const CONDITION_NAMES: Record<Condition, string> = {
  "mutual-exclusion": "상호 배제",
  "hold-and-wait": "점유 대기",
  "no-preemption": "비선점",
  "circular-wait": "순환 대기",
};

export type LockState = {
  owner: Map<string, string>; // 자원 → 쥔 스레드
  waiting: Map<string, string>; // 스레드 → 기다리는 자원
  conditions: Map<Condition, "met" | "broken">;
  cycle: boolean; // 대기 고리가 보이는지
  /** 이 상태를 만든 마지막 단계의 도장(그 단계 결과로만 보인다) */
  stamp?: { label: string; tone: "attack" | "defense" };
  /** 자원의 공유 값(write로 바뀐다) */
  values: Map<string, string>;
  /** 스레드 손의 메모 카드: 마지막으로 읽은 값 또는 쓴 값 */
  memos: Map<string, { kind: "read" | "write"; value: string; note?: string }>;
};

export function lockStateAt(term: Term, mode: Mode, upTo: number): LockState {
  const s: LockState = {
    owner: new Map(),
    waiting: new Map(),
    conditions: new Map(),
    cycle: false,
    values: new Map(term.scenario.actors.flatMap((a) => (a.value === undefined ? [] : [[a.id, a.value] as const]))),
    memos: new Map(),
  };
  const last = lastStepIndex(term, mode);
  for (let i = 0; i < Math.min(upTo, last + 1); i++) {
    const v = stepView(term, mode, i);
    s.stamp = undefined;
    if (v.action === "acquire") {
      s.owner.set(v.to, v.from);
      s.waiting.delete(v.from);
    } else if (v.action === "wait") {
      s.waiting.set(v.from, v.to);
    } else if (v.action === "release") {
      s.owner.delete(v.to);
      s.cycle = false;
      s.memos.delete(v.from); // 작업을 마치고 내려놓으면 메모도 치운다
    }
    for (const e of v.effects) {
      if (e.type === "condition") s.conditions.set(e.name, e.broken ? "broken" : "met");
      if (e.type === "cycle") s.cycle = true;
      if (e.type === "timeout") s.waiting.delete(v.from); // 기다리기를 포기한다
      if (e.type === "take" && !e.refused) s.owner.set(v.to, v.from);
      if (e.type === "stamp") s.stamp = { label: e.label, tone: e.tone };
      if (e.type === "read") s.memos.set(v.from, { kind: "read", value: e.value });
      if (e.type === "write") {
        s.values.set(v.to, e.value);
        s.memos.set(v.from, { kind: "write", value: e.value, note: e.note });
      }
    }
  }
  return s;
}
