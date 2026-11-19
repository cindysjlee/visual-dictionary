// 스택형 결과 상태(순수): upTo 단계 직전까지 push·pop·run과 locals·returnValue를 적용한 콜 스택. 단계를 넘기거나 동작 줄이기일 때 바로 적용한다 (docs/04 스택형)
import type { Term } from "@app/content-schema";
import { lastStepIndex, stepView, type Mode } from "@app/content-schema/scene";

export type Frame = {
  /** 스택 안에서의 자리(0 = 맨 아래). 같은 함수가 여러 번 쌓여도 자리로 구분한다 */
  depth: number;
  fn: string; // 함수 행위자 id
  call: string; // 호출식(push 단계의 label). 예: factorial(3)
  locals: { name: string; value: string }[];
  /** 반환 주소: 이 프레임이 끝나면 돌아갈 곳(호출한 함수와 그 줄). 진입점은 없음 */
  returnTo?: { fn: string; line?: number };
};

export type StackState = {
  frames: Frame[];
  /** 맨 위 프레임이 실행 중인 줄(코드 판 강조) */
  line?: number;
  /** 바로 직전 pop에서 전달된 반환값(받은 칸 표시용) */
  lastReturn?: { value: string; into?: string; depth: number };
};

const setLocals = (frame: Frame | undefined, vars: { name: string; value: string }[]) => {
  if (!frame) return;
  for (const v of vars) {
    const slot = frame.locals.find((l) => l.name === v.name);
    if (slot) slot.value = v.value;
    else frame.locals.push({ ...v });
  }
};

/** upTo = 이 단계 번호(0부터) 직전까지 적용. upTo = 단계 수면 마지막까지 */
export function stackStateAt(term: Term, mode: Mode, upTo: number): StackState {
  const state: StackState = { frames: [] };
  const last = lastStepIndex(term, mode);
  for (let i = 0; i < Math.min(upTo, last + 1); i++) {
    const v = stepView(term, mode, i);
    const top = state.frames.at(-1);
    state.lastReturn = undefined;
    if (v.action === "push") {
      state.frames.push({
        depth: state.frames.length,
        fn: v.to,
        call: v.label,
        locals: [],
        returnTo: top ? { fn: top.fn, line: state.line } : undefined,
      });
    } else if (v.action === "pop") {
      state.frames.pop();
    }
    for (const e of v.effects) {
      if (e.type === "returnValue") state.lastReturn = { value: e.value, into: e.into, depth: state.frames.length - 1 };
      if (e.type === "locals") {
        const target = e.target ? [...state.frames].reverse().find((f) => f.fn === e.target) : state.frames.at(-1);
        setLocals(target, e.vars);
      }
    }
    if (v.line !== undefined) state.line = v.line;
  }
  return state;
}
