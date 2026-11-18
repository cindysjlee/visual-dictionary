// 플레이어 진입점: 엔진·공통 UI는 항상, 3D 장면은 WebGL이 있을 때만 동적 import한다(홈 묶음에 three.js가 들어가지 않게)
import { Component, Suspense, lazy, useCallback, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import type { Term } from "@app/content-schema";
import { stepView } from "@app/content-schema/scene";
import PlayerShell from "./PlayerShell.tsx";
import StepList2D from "./StepList2D.tsx";
import type { StageProps } from "./stage.ts";
import { usePlayback } from "./usePlayback.ts";
import { canUseWebGL } from "./webgl.ts";

const FlowScene = lazy(() => import("./three/FlowScene.tsx"));

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const q = matchMedia(REDUCED_QUERY);
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};
const useReducedMotionPref = () => useSyncExternalStore(subscribeReduced, () => matchMedia(REDUCED_QUERY).matches);

/** 3D 묶음을 불러오지 못하거나 장면에서 오류가 나면 2D 대체 화면으로 */
class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function Player({ term, onComplete }: { term: Term; onComplete?: () => void }) {
  const reducedMotion = useReducedMotionPref();
  const [use3d] = useState(() => term.scenario.playerType === "flow" && canUseWebGL());
  const playback = usePlayback(term, onComplete);
  const [freeView, setFreeView] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = playback;
  const view = useMemo(() => stepView(term, state.defense, state.step), [term, state.defense, state.step]);
  const onStepDone = useCallback(() => dispatch({ type: "stepDone" }), [dispatch]);

  const stage: StageProps = { term, state, view, reducedMotion, freeView, onStepDone, stageRef };
  const fallback = <StepList2D {...stage} />;

  return (
    <MotionConfig reducedMotion="user">
      <PlayerShell
        term={term}
        playback={playback}
        view={view}
        freeView={freeView}
        onFreeViewChange={use3d ? setFreeView : undefined}
        stageRef={stageRef}
        stageClassName={use3d ? "is-3d" : "is-2d"}
      >
        {use3d ? (
          <SceneBoundary fallback={fallback}>
            <Suspense fallback={<p className="stage-loading">3D 장면을 불러오는 중…</p>}>
              <FlowScene {...stage} />
            </Suspense>
          </SceneBoundary>
        ) : (
          fallback
        )}
      </PlayerShell>
    </MotionConfig>
  );
}
