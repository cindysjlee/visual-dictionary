import type { CSSProperties } from "react";
import type { Term } from "@app/content-schema";
import { ActorIcon, NextIcon, PlayIcon, PrevIcon, ShieldIcon } from "../../icons.tsx";

// shortcut: 1단계 정지 화면. 시안 배치만 보여 주고 재생하지 않는다. 2단계에서 PlaybackEngine + FlowPlayer로 바꾼다
export default function PlayerPlaceholder({ term }: { term: Term }) {
  const { actors, steps } = term.scenario;
  const step = steps[0]!; // 스키마가 steps를 1개 이상으로 보장
  const defense = term.defenses.find((d) => d.blockedAtStep);
  const center = (actorId: string) => ((actors.findIndex((a) => a.id === actorId) + 0.5) / actors.length) * 100;
  const stageVars = { "--actor-count": actors.length, "--track-inset": `${50 / actors.length}%` } as CSSProperties;

  return (
    <section aria-label="애니메이션 플레이어" className={`glass card player ${step.danger ? "step-danger" : "step-neutral"}`}>
      <div className="player-head">
        <div className="mode-tabs" role="group" aria-label="재생 모드">
          <button type="button" className="mode-tab mode-tab-attack" aria-pressed="true" disabled>
            공격 흐름
          </button>
          {defense && (
            <button type="button" className="mode-tab mode-tab-defense" aria-pressed="false" disabled>
              <ShieldIcon />
              방어 모드 · {defense.name}
            </button>
          )}
        </div>
        <span className="step-pos">1 / {steps.length} 단계</span>
      </div>

      <div className="stage" style={stageVars}>
        <div className="actors">
          {actors.map((a) => (
            <div key={a.id} className={`actor${a.id === step.from || a.id === step.to ? " is-active" : ""}`}>
              <div className="actor-icon">
                <ActorIcon role={a.role} />
              </div>
              <div className="actor-name">{a.name}</div>
              <div className="actor-role">{a.role}</div>
            </div>
          ))}
        </div>
        <div className="stage-track">
          <div className="packet" style={{ left: `${center(step.from)}%` }}>
            {step.label}
          </div>
        </div>
      </div>

      <div className="caption" aria-live="polite">
        <div className={`caption-title${step.danger ? " is-danger" : ""}`}>1. {step.title}</div>
        <p className="caption-text">{step.caption}</p>
      </div>

      <div className="controls">
        <button type="button" className="icon-btn icon-btn-lg" aria-label="이전 단계" disabled>
          <PrevIcon />
        </button>
        <button type="button" className="play-btn" aria-label="재생" disabled>
          <PlayIcon />
        </button>
        <button type="button" className="icon-btn icon-btn-lg" aria-label="다음 단계" disabled>
          <NextIcon />
        </button>
        <div className="step-bar" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={`step-seg${i === 0 ? " is-current" : ""}`} />
          ))}
        </div>
        <button type="button" className="btn" disabled>
          다시 보기
        </button>
      </div>
      <p className="muted">재생 기능은 준비 중이에요.</p>
    </section>
  );
}
