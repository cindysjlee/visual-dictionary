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

/**
 * 단계 연출이 끝난 뒤 다음 단계로 넘어가기 전 대기 시간. 자막(제목+본문, 공백 제외)을 다 읽기 전에 넘어가지 않게 글자 수에 비례한다.
 * 연출이 있으면(3D) 연출 중에도 자막을 읽으므로 글자당 50ms, 연출이 없으면(동작 줄이기·2D) 읽는 시간 전부인 글자당 100ms. 최소 3초.
 */
export function holdMs(view: Pick<StepView, "title" | "caption">, animated: boolean): number {
  const chars = (view.title + view.caption).replace(/\s/g, "").length;
  return Math.max(3000, 1700 + chars * (animated ? 50 : 100));
}
