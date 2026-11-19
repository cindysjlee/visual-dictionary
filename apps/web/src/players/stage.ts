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
 * 단계 연출이 끝난 뒤 다음 단계로 넘어가기 전 대기 시간(1× 기준, 재생 속도로 나눈다). 자막(제목+본문, 공백 제외) 글자 수에 비례한다.
 * 연출이 있으면(3D) 연출 중에도 자막을 읽으므로 0.8초 + 글자당 35ms(최소 2초),
 * 연출이 없으면(동작 줄이기·2D) 읽는 시간 전부라 1.5초 + 글자당 90ms(최소 2.6초)
 */
export function holdMs(view: Pick<StepView, "title" | "caption">, animated: boolean): number {
  const chars = (view.title + view.caption).replace(/\s/g, "").length;
  return animated ? Math.max(2000, 800 + chars * 35) : Math.max(2600, 1500 + chars * 90);
}
