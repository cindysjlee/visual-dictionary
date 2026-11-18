// WebGL을 쓸 수 없을 때의 무대: 단계 목록 + 현재 단계 강조 + 차단 표시. 방어 모드도 같은 규칙(stepView)으로 동작한다
import { lastStepIndex, stepView } from "@app/content-schema/scene";
import type { StageProps } from "./stage.ts";
import { useHold } from "./useHold.ts";

export default function StepList2D({ term, state, reducedMotion, onStepDone }: StageProps) {
  useHold(reducedMotion ? 3200 : 2700, state.playing, `${state.defense}-${state.step}`, onStepDone);
  const last = lastStepIndex(term, state.defense);

  return (
    <ol className="steps2d" aria-label="단계 목록">
      {Array.from({ length: last + 1 }, (_, i) => {
        const v = stepView(term, state.defense, i);
        const status = i < state.step ? " is-done" : i === state.step ? " is-current" : "";
        return (
          <li key={i} className={`steps2d-item tone-${v.tone}${status}`} aria-current={i === state.step ? "step" : undefined}>
            <span className="step-no">{String(i + 1).padStart(2, "0")}</span>
            <span className="steps2d-title">{v.title}</span>
            <span className="steps2d-label num">{v.blocked ? v.blockedLabel : v.attachedLabel}</span>
          </li>
        );
      })}
    </ol>
  );
}
