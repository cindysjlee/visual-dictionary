import { useEffect, useMemo, useReducer, useRef } from "react";
import type { Term } from "@app/content-schema";
import { lastStepIndex } from "@app/content-schema/scene";
import { initialState, lastStep, reduce, type PlaybackAction, type PlaybackConfig, type PlaybackState } from "./engine.ts";
import { readSpeed, writeSpeed } from "./speedStore.ts";

/** 엔진을 React 상태로 연결한다. onComplete는 공격 흐름을 끝까지 봤을 때 한 번 불린다 (읽음 저장은 6단계에서 연결) */
export function usePlayback(term: Term, onComplete?: () => void) {
  const config = useMemo<PlaybackConfig>(
    () => ({ stepCount: term.scenario.steps.length, modeSteps: term.defenses.map((_, i) => lastStepIndex(term, i) + 1) }),
    [term],
  );
  const [state, dispatch] = useReducer(
    (s: PlaybackState, a: PlaybackAction) => reduce(config, s, a).state,
    undefined,
    () => initialState(readSpeed()),
  );

  useEffect(() => writeSpeed(state.speed), [state.speed]);

  const fired = useRef(false);
  useEffect(() => {
    if (state.completed && !fired.current) {
      fired.current = true;
      onComplete?.();
    }
  }, [state.completed, onComplete]);

  return { state, dispatch, last: lastStep(config, state) };
}

export type Playback = ReturnType<typeof usePlayback>;
