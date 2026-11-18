// PlaybackEngine: 화면·three.js를 모르는 순수 재생 로직. 모든 플레이어 유형(flow·stack·lock)이 그대로 쓴다 (CLAUDE.md 8번)

export type PlaybackConfig = {
  stepCount: number;
  /** defenses[i].blockedAtStep (1부터, 없으면 undefined) */
  blockedAtStep: (number | undefined)[];
};

export type PlaybackState = {
  step: number; // 0부터
  playing: boolean;
  defense: number | null; // null = 공격 흐름
  completed: boolean; // "끝까지 봄"을 이미 내보냈는지 (페이지당 한 번)
  started: boolean; // 사용자가 재생하거나 단계를 옮겼는지. 아니면 1단계 장면에서 멈춰 있고 무대 가운데 재생 버튼을 띄운다
};

export type PlaybackAction =
  | { type: "next" }
  | { type: "prev" }
  | { type: "goTo"; step: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "toggle" }
  | { type: "stepDone" } // 장면이 이 단계의 연출과 대기를 마쳤다
  | { type: "replay" }
  | { type: "setDefense"; defense: number | null }; // 1단계로, 재생 상태는 그대로

export type PlaybackEvent = "completed";

const STARTS = new Set<PlaybackAction["type"]>(["play", "toggle", "next", "prev", "goTo", "replay"]);

/** 상세 진입 시 항상 1단계에서 멈춘 상태 (설명을 먼저 읽을 수 있게) */
export const initialState = (): PlaybackState => ({ step: 0, playing: false, defense: null, completed: false, started: false });

/** 이 모드의 마지막 단계(0부터). 방어 모드면 차단 단계에서 끝난다 */
export const lastStep = (config: PlaybackConfig, state: Pick<PlaybackState, "defense">) =>
  ((state.defense === null ? undefined : config.blockedAtStep[state.defense]) ?? config.stepCount) - 1;

export function reduce(
  config: PlaybackConfig,
  state: PlaybackState,
  action: PlaybackAction,
): { state: PlaybackState; events: PlaybackEvent[] } {
  const r = transition(config, state, action);
  // 재생 버튼·스페이스·단계 이동은 "시작"이다. 모드 전환·일시정지·장면의 stepDone은 아니다
  if (!r.state.started && STARTS.has(action.type)) r.state = { ...r.state, started: true };
  return r;
}

function transition(
  config: PlaybackConfig,
  state: PlaybackState,
  action: PlaybackAction,
): { state: PlaybackState; events: PlaybackEvent[] } {
  const last = lastStep(config, state);
  const clamp = (n: number) => Math.max(0, Math.min(last, n));
  const same = { state, events: [] as PlaybackEvent[] };
  const set = (patch: Partial<PlaybackState>) => ({ state: { ...state, ...patch }, events: [] as PlaybackEvent[] });

  // 순서대로 진행해(재생·다음) 공격 흐름의 마지막 단계에 도착하면 "끝까지 봄"을 한 번 내보낸다
  const advanceTo = (step: number, playing: boolean) => {
    const next = { ...state, step, playing };
    if (state.defense === null && step === last && step !== state.step && !state.completed) {
      return { state: { ...next, completed: true }, events: ["completed"] as PlaybackEvent[] };
    }
    return { state: next, events: [] as PlaybackEvent[] };
  };

  switch (action.type) {
    case "next":
      return advanceTo(clamp(state.step + 1), false);
    case "prev":
      return set({ step: clamp(state.step - 1), playing: false });
    case "goTo":
      return set({ step: clamp(action.step), playing: false });
    case "play":
      return state.step >= last ? set({ step: 0, playing: true }) : set({ playing: true });
    case "pause":
      return set({ playing: false });
    case "toggle":
      return reduce(config, state, { type: state.playing ? "pause" : "play" });
    case "stepDone":
      if (!state.playing) return same;
      return state.step >= last ? set({ playing: false }) : advanceTo(state.step + 1, true);
    case "replay":
      return set({ step: 0, playing: true });
    case "setDefense":
      return set({ defense: action.defense, step: 0 });
  }
}
