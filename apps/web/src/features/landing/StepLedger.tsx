// 랜딩 첫 화면의 단계 장부: 실제 용어 JSON의 단계를 위에서 아래로 적고, 요청 점이 레일을 따라 내려간다.
// 공격 흐름은 마지막 단계까지, 방어 모드는 차단 단계에서 도장과 함께 멈춘다. Motion을 쓰므로 따로 받는다(첫 화면 묶음 밖)
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from "motion/react";
import type { Term } from "@app/content-schema";
import { stepView } from "@app/content-schema/scene";
import DefenseSwitch from "./DefenseSwitch.tsx";

type Mode = "attack" | "defense";

/** tokens.css의 시간 토큰(예: "900ms")을 ms 숫자로 읽는다. 동작 값은 토큰 파일 한 곳에만 둔다 */
function tokenMs(name: string, fallback: number) {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}
const EASE_OUT = [0.16, 1, 0.3, 1] as const; // --ease-out과 같은 곡선

export default function StepLedger({ term }: { term: Term }) {
  // 제목·자막·위험·차단은 플레이어와 같은 규칙(stepView)으로 정한다: 방어 모드는 바뀐 단계 제목·차단 자막을 쓴다
  const defenseIndex = term.defenses.findIndex((d) => d.blockedAtStep !== undefined);
  const defense = defenseIndex >= 0 ? term.defenses[defenseIndex] : undefined;
  const reduced = useReducedMotion() ?? false;
  const [mode, setMode] = useState<Mode>("attack");
  const [run, setRun] = useState(0);
  const views = term.scenario.steps.map((_, i) => stepView(term, mode === "defense" && defense ? defenseIndex : null, i));
  const last = mode === "defense" && defense?.blockedAtStep ? defense.blockedAtStep - 1 : views.length - 1;
  const [current, setCurrent] = useState(reduced ? last : 0);
  const story = tokenMs("--dur-story", 900);

  // 모드를 바꾸거나 다시 재생하면 1단계부터 한 단계씩. 동작 줄이기면 결과 상태를 바로 보인다
  useEffect(() => {
    if (reduced) {
      setCurrent(last);
      return;
    }
    setCurrent(0);
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      if (i > last) clearInterval(timer);
      else setCurrent(i);
    }, story);
    return () => clearInterval(timer);
  }, [mode, run, last, reduced, story]);

  const done = current === last;
  const blockedHere = (i: number) => views[i]!.blocked && i === current && done;

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id="landing-ledger">
        <section className="ledger" aria-labelledby="ledger-title">
          <header className="ledger-head">
            <div className="ledger-term">
              <h2 id="ledger-title">{term.name}</h2>
              {term.englishName && <span className="ledger-en">{term.englishName}</span>}
            </div>
            <DefenseSwitch on={mode === "defense"} onChange={(on) => setMode(on ? "defense" : "attack")} disabled={!defense} />
            <button type="button" className="btn-chrome" onClick={() => setRun((r) => r + 1)}>
              다시 재생
            </button>
          </header>

          <ol className={`ledger-steps mode-${mode}`}>
            {views.map((step, i) => {
              const danger = step.tone === "attack";
              const skipped = mode === "defense" && i > last;
              const state = skipped ? "skipped" : i < current ? "passed" : i === current ? "current" : "pending";
              return (
                <li key={i} className={`ledger-row is-${state}${danger ? " is-danger" : ""}`} aria-current={i === current ? "step" : undefined}>
                  <span className="ledger-rail" aria-hidden="true">
                    <span className="ledger-node" />
                    {i === current && (
                      <motion.span
                        layoutId="packet"
                        className={`packet tone-${blockedHere(i) ? "defense" : danger ? "attack" : "neutral"}`}
                        transition={{ duration: (story / 1000) * 0.7, ease: EASE_OUT }}
                      />
                    )}
                  </span>
                  <span className="ledger-no num">{i + 1}</span>
                  <span className="ledger-title">{step.title}</span>
                  {step.label && <span className="ledger-label num">{step.label}</span>}
                  <span className="ledger-tag">
                    <AnimatePresence initial={false}>
                      {blockedHere(i) ? (
                        <motion.span
                          key="stamp"
                          className="stamp"
                          initial={{ opacity: 0, scale: 1.25 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.32, ease: EASE_OUT }}
                        >
                          {step.blockedLabel ?? "차단"}
                        </motion.span>
                      ) : skipped ? (
                        <span key="skip" className="tag-skip">
                          실행되지 않음
                        </span>
                      ) : danger && i <= current ? (
                        <span key="danger" className="tag-danger">
                          위험
                        </span>
                      ) : null}
                    </AnimatePresence>
                  </span>
                </li>
              );
            })}
          </ol>

          <footer className="ledger-foot">
            <p className="ledger-caption" aria-live="polite">
              <span className="num ledger-caption-no">{current + 1}</span>
              {views[current]?.caption}
            </p>
            <p className="ledger-note">
              {mode === "defense" && defense ? `방어: ${defense.name}` : "방어 꺼짐"}
              <Link to={`/terms/${term.id}`}>{term.name} 상세 페이지</Link>
            </p>
          </footer>
        </section>
      </LayoutGroup>
    </MotionConfig>
  );
}
