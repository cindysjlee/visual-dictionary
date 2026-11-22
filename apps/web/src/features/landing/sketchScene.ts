// [그림 1] 연필 스케치 장면 상태: 단계 효과(store·give·appear·rewrite·flip·attach·inspect·transfer)를 쌓아
// "지금 그림에 무엇이 보이는가"를 정한다. 그리기(SketchFigure.tsx)와 분리해 단위 테스트한다.
import type { Effect } from "@app/content-schema";
import type { StepView } from "@app/content-schema/scene";

type Screen = { title?: string; lines: string[] };
type Check = Extract<Effect, { type: "inspect" }>["checks"][number];

export type Scene = {
  jar: boolean; // 쿠키 보관함에 쿠키가 있다
  tokenAt: string | null; // 토큰(열쇠)을 받은 탭
  shown: Set<string>; // 나타난 탭
  screen: Map<string, Screen>; // 바뀐 앞면
  flipped: Set<string>;
  paid: number; // 빠져나간 금액(송금)
  carry: boolean; // 지금 날아가는 봉투에 쿠키가 붙어 있다(이번 단계에만)
  card: Check[] | null; // 검문소 검사 카드(이번 단계에만, 막히면 남는다)
  blocked: boolean;
};

const empty = (): Scene => ({ jar: false, tokenAt: null, shown: new Set(), screen: new Map(), flipped: new Set(), paid: 0, carry: false, card: null, blocked: false });

/** 효과 하나를 장면에 적용. "carry"·"block"은 효과가 아닌 연출 박자(봉투에 쿠키 실음, 차단) */
function apply(s: Scene, e: Effect | "carry" | "block") {
  if (e === "carry") s.carry = true;
  else if (e === "block") s.blocked = true;
  else if (e.type === "store" && e.item === "cookie") s.jar = true;
  else if (e.type === "give" && e.item === "token" && !e.refused) s.tokenAt = e.to;
  else if (e.type === "appear") s.shown.add(e.target);
  else if (e.type === "rewrite") s.screen.set(e.target, e.screen);
  else if (e.type === "flip") s.flipped.add(e.target);
  else if (e.type === "attach" && !e.refused) s.carry = true;
  else if (e.type === "inspect") s.card = e.checks;
  else if (e.type === "transfer") s.paid += e.amount ?? 0;
}

/** 0..upto 단계가 끝난 뒤의 장면(봉투·카드는 지나간 단계 것이 남지 않는다. 막힌 마지막 단계의 카드만 남는다) */
export function sceneAt(views: StepView[], upto: number): Scene {
  const s = empty();
  for (const v of views.slice(0, upto + 1)) {
    s.card = null;
    for (const e of v.effects) apply(s, e);
    if (v.blocked) s.blocked = true;
  }
  s.carry = false;
  if (!views[upto]?.blocked) s.card = null;
  return s;
}

/** 진행 중인 단계: 끝난 장면 위에 지금까지 연출한 박자(효과 종류 또는 carry·block)만 더한다 */
export function sceneDuring(views: StepView[], i: number, beats: ReadonlySet<string>): Scene {
  const s = sceneAt(views, i - 1);
  s.card = null;
  const v = views[i];
  if (!v) return s;
  for (const e of v.effects) if (beats.has(e.type)) apply(s, e);
  if (beats.has("carry")) apply(s, "carry");
  if (beats.has("block")) apply(s, "block");
  return s;
}

export type Mood = "neutral" | "smile" | "happy" | "grin" | "shock" | "angry";

/** 결과에 따른 표정: 송금되면 사용자·은행은 놀라고 공격자는 웃는다, 막히면 반대 */
export const moods = (s: Scene) => ({
  user: (s.paid ? "shock" : s.blocked ? "happy" : "neutral") as Mood,
  bank: (s.paid ? "shock" : s.blocked ? "smile" : "neutral") as Mood,
  attacker: (s.paid ? "happy" : s.blocked ? "angry" : s.flipped.size ? "grin" : "neutral") as Mood,
  server: (s.blocked ? "angry" : "grin") as Mood,
});
