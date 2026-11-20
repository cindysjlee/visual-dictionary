// sceneStateAt: n단계 직전까지의 효과를 모두 적용한 "결과 상태"(순수). 단계를 넘기거나 동작 줄이기일 때 바로 적용한다 (docs/06 4절)
import type { Item, Term } from "@app/content-schema";
import { deliveryTarget, lastStepIndex, stepView, type Mode } from "@app/content-schema/scene";

export type Screen = { title?: string; lines: string[] };

export type SceneState = {
  hidden: Set<string>; // 아직 나타나지 않은 행위자
  flipped: Set<string>;
  screens: Map<string, { front?: Screen; back?: Screen }>;
  holdings: Map<string, Map<Item, string | undefined>>; // 행위자 → 갖고 있는 물건(표시 글자)
  ran: Set<string>; // 스크립트가 실행된 탭
  balances: Map<string, number>;
  gained: Map<string, number>; // 잔액 필드가 없는 쪽이 받은 돈
  occupied: Map<string, number>; // 칸(slots)이 찬 개수
  opacity: Map<string, number>; // 겹친 화면(frame)의 불투명도(없으면 1)
};

/** upTo = 이 단계 번호(0부터) 직전까지 적용. upTo = 단계 수면 마지막까지 */
export function sceneStateAt(term: Term, mode: Mode, upTo: number): SceneState {
  const { actors } = term.scenario;
  const last = lastStepIndex(term, mode);
  const views = Array.from({ length: last + 1 }, (_, i) => stepView(term, mode, i));

  const state: SceneState = {
    hidden: new Set(views.flatMap((v) => v.effects.flatMap((e) => (e.type === "appear" ? [e.target] : [])))),
    flipped: new Set(),
    screens: new Map(actors.map((a) => [a.id, { front: a.screen, back: a.back }])),
    holdings: new Map(),
    ran: new Set(),
    balances: new Map(actors.flatMap((a) => (a.balance === undefined ? [] : [[a.id, a.balance] as const]))),
    gained: new Map(),
    occupied: new Map(),
    opacity: new Map(),
  };
  const hold = (id: string, item: Item, label?: string) =>
    state.holdings.set(id, (state.holdings.get(id) ?? new Map()).set(item, label));

  for (const view of views.slice(0, Math.max(0, upTo))) {
    const packet: Item[] = [];
    for (const e of view.effects) {
      switch (e.type) {
        case "appear":
          state.hidden.delete(e.target);
          break;
        case "flip":
          state.flipped.add(e.target);
          break;
        case "rewrite": {
          const s = state.screens.get(e.target) ?? {};
          state.screens.set(e.target, { ...s, [e.side]: e.screen });
          break;
        }
        case "store":
          hold(e.into, e.item, e.label);
          break;
        case "attach":
          if (!e.refused) packet.push(e.item);
          break;
        case "give":
          if (!e.refused) hold(e.to, e.item, e.label);
          break;
        case "run":
          if (!e.refused) state.ran.add(e.target);
          break;
        case "transfer":
          if (e.item === "coin" && e.amount) {
            for (const [id, sign] of [[e.from, -1], [e.to, 1]] as const) {
              if (state.balances.has(id)) state.balances.set(id, state.balances.get(id)! + sign * e.amount);
              else if (sign > 0) state.gained.set(id, (state.gained.get(id) ?? 0) + e.amount);
            }
          } else hold(e.to, e.item, e.label);
          break;
        case "occupy": {
          const size = actors.find((a) => a.id === e.target)?.slots?.size ?? 0;
          if (!e.refused) state.occupied.set(e.target, Math.min(size, (state.occupied.get(e.target) ?? 0) + e.count));
          break;
        }
        case "vacate":
          state.occupied.set(e.target, Math.max(0, (state.occupied.get(e.target) ?? 0) - e.count));
          break;
        case "opacity":
          state.opacity.set(e.target, e.value);
          break;
        case "inspect":
          break;
      }
    }
    for (const it of packet) hold(deliveryTarget(view), it);
  }
  return state;
}
