// content/terms의 모든 용어(published·draft) × (공격 흐름 + 방어별 모드)를 화면 없이 끝까지 돌린다.
// 용어 파일을 추가하면 테스트 코드를 고치지 않아도 대상이 늘어난다
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { termSchema, type Term } from "@app/content-schema";
import { checkScene, lastStepIndex, stepView, type Mode } from "@app/content-schema/scene";
import { initialState, reduce, type PlaybackConfig } from "./engine.ts";
import { sceneStateAt } from "./three/sceneState.ts";

const dir = new URL("../../../../content/terms/", import.meta.url);
const terms: Term[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => termSchema.parse(JSON.parse(readFileSync(new URL(f, dir), "utf8"))))
  .filter((t) => t.status !== "retired");

describe.each(terms.map((t) => [t.id, t] as const))("용어 %s", (_, term) => {
  const config: PlaybackConfig = { stepCount: term.scenario.steps.length, modeSteps: term.defenses.map((_, i) => lastStepIndex(term, i) + 1) };
  const modes: Mode[] = [null, ...term.defenses.map((_, i) => i)];
  const actorIds = new Set(term.scenario.actors.map((a) => a.id));

  it("장면 참조·물건 흐름 오류가 없다", () => {
    expect(checkScene(term)).toEqual([]);
  });

  it.each(modes.map((m) => [m === null ? "공격 흐름" : term.defenses[m]!.name, m] as const))("%s: 끝까지 재생된다", (_, mode) => {
    let { state } = reduce(config, reduce(config, initialState(), { type: "play" }).state, { type: "setDefense", defense: mode });
    for (let guard = 0; state.playing && guard < 100; guard++) {
      const view = stepView(term, mode, state.step);
      for (const e of view.effects) {
        for (const ref of Object.entries(e).flatMap(([k, v]) => (["target", "into", "to", "at"].includes(k) || (k === "from" && v !== "packet") ? [v as string] : []))) {
          expect(actorIds.has(ref), `${state.step + 1}단계 ${e.type}.${ref}`).toBe(true);
        }
      }
      expect(() => sceneStateAt(term, mode, state.step + 1)).not.toThrow();
      state = reduce(config, state, { type: "stepDone" }).state;
    }
    expect(state.playing).toBe(false);
    expect(state.step).toBe(lastStepIndex(term, mode));
    const d = mode === null ? undefined : term.defenses[mode]!;
    if (d?.blockedAtStep) {
      expect(state.step).toBe(d.blockedAtStep - 1);
      expect(stepView(term, mode, state.step).blocked).toBe(true);
    }
    // 해결 방법(대체 흐름)은 멈추지 않고 대체 흐름 끝까지 간다
    if (d?.branchAtStep && d.steps) {
      expect(state.step).toBe(d.branchAtStep - 1 + d.steps.length - 1);
      expect(stepView(term, mode, state.step).blocked).toBe(false);
    }
  });
});
