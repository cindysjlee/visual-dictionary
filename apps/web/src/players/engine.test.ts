import { describe, expect, it } from "vitest";
import { SPEEDS, initialState, lastStep, reduce, type PlaybackAction, type PlaybackConfig, type PlaybackState } from "./engine.ts";
import { holdMs } from "./stage.ts";

// CSRF와 같은 모양: 6단계, 방어 2개 모두 5단계에서 차단
const config: PlaybackConfig = { stepCount: 6, modeSteps: [5, 5] };

// 대부분의 테스트는 재생 버튼을 누른 뒤(재생 중)부터 시작한다
const PLAYING: PlaybackState = { ...initialState(), playing: true, started: true };

const run = (actions: PlaybackAction[], start: PlaybackState = PLAYING) => {
  let state = start;
  const events: string[] = [];
  for (const a of actions) {
    const r = reduce(config, state, a);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
};

describe("PlaybackEngine", () => {
  it("처음에서 이전, 끝에서 다음은 범위 안에 머문다", () => {
    expect(run([{ type: "prev" }]).state.step).toBe(0);
    expect(run([{ type: "goTo", step: 99 }, { type: "next" }]).state.step).toBe(5);
    expect(run([{ type: "goTo", step: -3 }]).state.step).toBe(0);
  });

  it("직접 이동하면 일시정지한다", () => {
    expect(run([{ type: "next" }]).state).toMatchObject({ step: 1, playing: false });
  });

  it("재생하면 stepDone마다 다음 단계, 마지막에서 멈춘다", () => {
    const { state } = run(Array(10).fill({ type: "stepDone" }));
    expect(state).toMatchObject({ step: 5, playing: false });
  });

  it("방어 모드의 마지막 단계는 차단 단계(5단계)다", () => {
    const { state } = run([{ type: "setDefense", defense: 0 }, ...Array(10).fill({ type: "stepDone" })]);
    expect(lastStep(config, state)).toBe(4);
    expect(state).toMatchObject({ step: 4, playing: false });
    expect(run([{ type: "setDefense", defense: 1 }, { type: "goTo", step: 5 }]).state.step).toBe(4);
  });

  it("끝까지 봄은 한 번만 나간다 (다시 보기 후에도)", () => {
    const toEnd = Array(6).fill({ type: "stepDone" });
    const { events } = run([...toEnd, { type: "replay" }, ...toEnd, { type: "play" }, ...toEnd]);
    expect(events).toEqual(["completed"]);
  });

  it("다음 버튼으로 끝까지 가도 끝까지 봄, 진행 막대로 건너뛰면 아님", () => {
    expect(run(Array(5).fill({ type: "next" })).events).toEqual(["completed"]);
    expect(run([{ type: "goTo", step: 5 }]).events).toEqual([]);
  });

  it("방어 모드에서 끝나면 끝까지 봄이 아니다", () => {
    const { events } = run([{ type: "setDefense", defense: 0 }, ...Array(6).fill({ type: "stepDone" })]);
    expect(events).toEqual([]);
  });

  it("재생 중 방어 모드로 바꾸면 1단계부터, 범위가 줄어든다", () => {
    const mid = run([{ type: "stepDone" }, { type: "stepDone" }, { type: "stepDone" }]).state;
    expect(mid.step).toBe(3);
    const switched = run([{ type: "setDefense", defense: 0 }], mid).state;
    expect(switched).toMatchObject({ step: 0, playing: true, defense: 0 });
    expect(run([{ type: "goTo", step: 5 }], switched).state.step).toBe(4);
  });

  it("멈춰 있을 때 모드를 바꾸면 1단계에서 멈춘 채로", () => {
    const paused = run([{ type: "next" }, { type: "next" }]).state;
    expect(run([{ type: "setDefense", defense: 1 }], paused).state).toMatchObject({ step: 0, playing: false, defense: 1 });
  });

  it("상세 진입 직후는 1단계에서 멈춘 상태, 재생 버튼·스페이스(toggle)·단계 이동이 시작이다", () => {
    const start = initialState();
    expect(start).toMatchObject({ step: 0, playing: false, started: false });
    expect(run([{ type: "stepDone" }], start).state).toMatchObject({ step: 0, started: false });
    expect(run([{ type: "setDefense", defense: 0 }, { type: "pause" }], start).state.started).toBe(false);
    expect(run([{ type: "play" }], start).state).toMatchObject({ step: 0, playing: true, started: true });
    expect(run([{ type: "toggle" }], start).state).toMatchObject({ step: 0, playing: true, started: true });
    expect(run([{ type: "next" }], start).state).toMatchObject({ step: 1, playing: false, started: true });
  });

  it("재생을 누르면 끝까지 이어서 재생하고 끝까지 봄을 낸다", () => {
    const { state, events } = run([{ type: "play" }, ...Array(10).fill({ type: "stepDone" })], initialState());
    expect(state).toMatchObject({ step: 5, playing: false, started: true });
    expect(events).toEqual(["completed"]);
  });

  it("끝에서 재생을 누르면 1단계부터 다시, 일시정지 중 stepDone은 무시", () => {
    const end = run([{ type: "goTo", step: 5 }]).state;
    expect(run([{ type: "play" }], end).state).toMatchObject({ step: 0, playing: true });
    expect(run([{ type: "pause" }, { type: "stepDone" }]).state.step).toBe(0);
    expect(run([{ type: "toggle" }]).state.playing).toBe(false);
  });
});

describe("holdMs: 자막을 다 읽을 시간", () => {
  it("3D는 0.8초 + 글자당 35ms(최소 2초), 연출이 없으면 1.5초 + 글자당 90ms(최소 2.6초)", () => {
    expect(holdMs({ title: "짧음", caption: "한 줄" }, true)).toBe(2000);
    expect(holdMs({ title: "짧음", caption: "한 줄" }, false)).toBe(2600);
    const view = { title: "세션 쿠키 발급", caption: "가".repeat(80) };
    expect(holdMs(view, true)).toBe(800 + 86 * 35);
    expect(holdMs(view, false)).toBe(1500 + 86 * 90);
  });
});

describe("해결 방법(대체 흐름)", () => {
  // 기본 흐름 5단계, 해결 방법은 3단계부터 갈라져 대체 흐름 5단계 → 모두 7단계
  const alt: PlaybackConfig = { stepCount: 5, modeSteps: [7] };
  it("모드의 단계 수만큼 진행하고 대체 흐름 끝에서 멈춘다", () => {
    let state: PlaybackState = reduce(alt, PLAYING, { type: "setDefense", defense: 0 }).state;
    expect(lastStep(alt, state)).toBe(6);
    for (let i = 0; i < 10; i++) state = reduce(alt, state, { type: "stepDone" }).state;
    expect(state).toMatchObject({ step: 6, playing: false });
    expect(reduce(alt, state, { type: "goTo", step: 99 }).state.step).toBe(6);
  });

  it("'끝까지 봄'은 기본 흐름 끝에서만 내보낸다", () => {
    const events: string[] = [];
    let state: PlaybackState = reduce(alt, PLAYING, { type: "setDefense", defense: 0 }).state;
    for (let i = 0; i < 10; i++) {
      const r = reduce(alt, state, { type: "stepDone" });
      state = r.state;
      events.push(...r.events);
    }
    expect(events).toEqual([]);
    state = reduce(alt, { ...state, playing: true }, { type: "setDefense", defense: null }).state;
    for (let i = 0; i < 10; i++) {
      const r = reduce(alt, state, { type: "stepDone" });
      state = r.state;
      events.push(...r.events);
    }
    expect(events).toEqual(["completed"]);
    expect(state.step).toBe(4);
  });
});

describe("재생 속도", () => {
  it("기본 1×, 저장된 값으로 시작할 수 있다", () => {
    expect(initialState().speed).toBe(1);
    expect(initialState(2).speed).toBe(2);
  });

  it("속도를 바꿔도 단계·재생·방어 상태는 그대로이고 시작으로 치지 않는다", () => {
    const { state } = run([{ type: "goTo", step: 3 }, { type: "play" }, { type: "setSpeed", speed: 1.5 }]);
    expect(state).toMatchObject({ step: 3, playing: true, speed: 1.5 });
    expect(reduce(config, initialState(), { type: "setSpeed", speed: 2 }).state).toMatchObject({ started: false, speed: 2 });
  });

  it("정한 배수(0.75·1·1.5·2)가 아니면 무시한다", () => {
    expect(reduce(config, PLAYING, { type: "setSpeed", speed: 3 as never }).state.speed).toBe(1);
    expect(SPEEDS).toEqual([0.75, 1, 1.5, 2]);
  });
});
