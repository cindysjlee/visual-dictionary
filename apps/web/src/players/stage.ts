import type { RefObject } from "react";
import type { Term } from "@app/content-schema";
import type { StepView } from "@app/content-schema/scene";
import type { PlaybackState } from "./engine.ts";

/** 무대(3D 장면 또는 2D 대체 화면)가 받는 것. 무대는 그리기만 하고, 단계를 마치면 onStepDone을 부른다 */
export type StageProps = {
  term: Term;
  state: PlaybackState;
  view: StepView;
  reducedMotion: boolean;
  freeView: boolean;
  onStepDone: () => void;
  /** 무대 영역(포커스 가능). 자유 시점 키보드 조작을 여기서 받는다 */
  stageRef: RefObject<HTMLDivElement | null>;
};

/** 시안(docs/design/csrf-3d-prototype.html) 기준: 단계 연출이 끝난 뒤 대기 시간 */
export const HOLD_MS = 1700;
export const REDUCED_HOLD_MS = 3200;
