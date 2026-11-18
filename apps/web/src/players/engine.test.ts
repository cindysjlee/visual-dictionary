import { describe, expect, it } from "vitest";
import { initialState, lastStep, reduce, type PlaybackAction, type PlaybackConfig, type PlaybackState } from "./engine.ts";

// CSRF와 같은 모양: 6단계, 방어 2개 모두 5단계에서 차단
const config: PlaybackConfig = { stepCount: 6, blockedAtStep: [5, 5] };

const run = (actions: PlaybackAction[], start: PlaybackState = initialState(true)) => {
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
    const { state } = run([{ type: "setDefense", defense: 0, autoplay: true }, ...Array(10).fill({ type: "stepDone" })]);
    expect(lastStep(config, state)).toBe(4);
    expect(state).toMatchObject({ step: 4, playing: false });
    expect(run([{ type: "setDefense", defense: 1, autoplay: true }, { type: "goTo", step: 5 }]).state.step).toBe(4);
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
    const { events } = run([{ type: "setDefense", defense: 0, autoplay: true }, ...Array(6).fill({ type: "stepDone" })]);
    expect(events).toEqual([]);
  });

  it("재생 중 방어 모드로 바꾸면 1단계부터, 범위가 줄어든다", () => {
    const mid = run([{ type: "stepDone" }, { type: "stepDone" }, { type: "stepDone" }]).state;
    expect(mid.step).toBe(3);
    const switched = run([{ type: "setDefense", defense: 0, autoplay: true }], mid).state;
    expect(switched).toMatchObject({ step: 0, playing: true, defense: 0 });
    expect(run([{ type: "goTo", step: 5 }], switched).state.step).toBe(4);
  });

  it("동작 줄이기면 모드를 바꿔도 정지 상태로 시작한다", () => {
    const s = run([{ type: "setDefense", defense: 1, autoplay: false }], initialState(false)).state;
    expect(s).toMatchObject({ step: 0, playing: false, defense: 1 });
  });

  it("끝에서 재생을 누르면 1단계부터 다시, 일시정지 중 stepDone은 무시", () => {
    const end = run([{ type: "goTo", step: 5 }]).state;
    expect(run([{ type: "play" }], end).state).toMatchObject({ step: 0, playing: true });
    expect(run([{ type: "pause" }, { type: "stepDone" }]).state.step).toBe(0);
    expect(run([{ type: "toggle" }]).state.playing).toBe(false);
  });
});
