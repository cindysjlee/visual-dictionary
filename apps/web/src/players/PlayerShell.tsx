// 모든 플레이어 공통 UI: 모드 탭·방어 선택·단계 위치·자유 시점·자막·컨트롤·진행 막대·단축키. 무대는 children으로 받는다
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Term } from "@app/content-schema";
import { blockingDefenses, type StepView, type Tone } from "@app/content-schema/scene";
import { NextIcon, OrbitIcon, PauseIcon, PlayIcon, PrevIcon, ShieldIcon } from "../icons.tsx";
import type { Playback } from "./usePlayback.ts";

const TONE_CLASS: Record<Tone, string> = { neutral: "step-neutral", attack: "step-danger", defense: "step-blocked" };

type Props = {
  term: Term;
  playback: Playback;
  view: StepView;
  autoplay: boolean;
  freeView: boolean;
  onFreeViewChange?: (on: boolean) => void; // 없으면 자유 시점 버튼을 숨긴다(2D)
  stageRef: RefObject<HTMLDivElement | null>;
  stageClassName?: string;
  children: ReactNode;
};

export default function PlayerShell({ term, playback, view, autoplay, freeView, onFreeViewChange, stageRef, stageClassName, children }: Props) {
  const { state, dispatch, last } = playback;
  const defenses = blockingDefenses(term);
  const setDefense = (defense: number | null) => dispatch({ type: "setDefense", defense, autoplay });

  // 단축키는 플레이어 안에 포커스가 있을 때만. 스페이스는 버튼의 기본 동작과 겹치지 않게 무대에서만 쓴다
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const onStage = e.target === stageRef.current;
    if (freeView && onStage && e.key.startsWith("Arrow")) return; // 자유 시점에서는 무대가 화살표로 회전한다
    if (e.key === "ArrowLeft") dispatch({ type: "prev" });
    else if (e.key === "ArrowRight") dispatch({ type: "next" });
    else if (e.key === " " && onStage) dispatch({ type: "toggle" });
    else return;
    e.preventDefault();
  };

  const stageHelp = `애니메이션 무대. 스페이스: 재생·일시정지, 좌우 화살표: 단계 이동${freeView ? ", 자유 시점: 화살표로 회전" : ""}`;

  return (
    <section aria-label="애니메이션 플레이어" className={`glass card player ${TONE_CLASS[view.tone]}`} onKeyDown={onKeyDown}>
      <div className="player-head">
        <div className="mode-tabs" role="group" aria-label="재생 모드">
          <button type="button" className="mode-tab mode-tab-attack" aria-pressed={state.defense === null} onClick={() => setDefense(null)}>
            공격 흐름
          </button>
          {defenses.length > 0 && (
            <button
              type="button"
              className="mode-tab mode-tab-defense"
              aria-pressed={state.defense !== null}
              onClick={() => state.defense === null && setDefense(defenses[0]!)}
            >
              <ShieldIcon />
              방어 모드{defenses.length === 1 && ` · ${term.defenses[defenses[0]!]!.name}`}
            </button>
          )}
        </div>
        <div className="player-meta">
          <span className="step-pos">
            {state.step + 1} / {last + 1} 단계
          </span>
          {onFreeViewChange && (
            <button type="button" className="btn" aria-pressed={freeView} onClick={() => onFreeViewChange(!freeView)}>
              <OrbitIcon />
              자유 시점
            </button>
          )}
        </div>
      </div>

      {state.defense !== null && defenses.length > 1 && (
        <div className="chips defense-chips" role="group" aria-label="방어 기법">
          <span className="muted">방어 기법</span>
          {defenses.map((i) => (
            <button key={i} type="button" className="chip" aria-pressed={state.defense === i} onClick={() => setDefense(i)}>
              {term.defenses[i]!.name}
            </button>
          ))}
        </div>
      )}

      <div ref={stageRef} className={`stage-slot ${stageClassName ?? ""}`} tabIndex={0} aria-label={stageHelp}>
        {children}
      </div>

      <div className="caption" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${state.defense}-${state.step}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className={`caption-title tone-${view.tone}`}>
              {state.step + 1}. {view.title}
            </div>
            <p className="caption-text">{view.caption}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="controls">
        <button type="button" className="icon-btn icon-btn-lg" aria-label="이전 단계" onClick={() => dispatch({ type: "prev" })}>
          <PrevIcon />
        </button>
        <button type="button" className="play-btn" aria-label={state.playing ? "일시정지" : "재생"} onClick={() => dispatch({ type: "toggle" })}>
          {state.playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" className="icon-btn icon-btn-lg" aria-label="다음 단계" onClick={() => dispatch({ type: "next" })}>
          <NextIcon />
        </button>
        <div className="step-bar">
          {Array.from({ length: last + 1 }, (_, k) => (
            <button
              key={k}
              type="button"
              className="step-seg-btn"
              aria-label={`${k + 1}단계로 이동`}
              aria-current={k === state.step ? "step" : undefined}
              onClick={() => dispatch({ type: "goTo", step: k })}
            >
              <span className={`step-seg${k < state.step ? " is-done" : k === state.step ? " is-current" : ""}`} />
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => dispatch({ type: "replay" })}>
          다시 보기
        </button>
      </div>
    </section>
  );
}
