// 히어로 C-1 "직접 해 보기": 클릭재킹 체험. 화면 안에서만 도는 가짜 장면이고 실제 요청·입력은 없다.
// "경품 당첨" 팝업 위에 가짜 은행(bank.example) 송금 화면이 투명하게 겹쳐 있다. [경품 받기]를 누르면 층이 3D로 벌어져
// 누른 자리가 실제로는 은행의 [송금]이었다는 걸 보여 준다. [방어 켜기](frame-ancestors / X-Frame-Options)면 은행 층이 빈 칸.
// 단계 제목·차단 문구는 용어 JSON(stepView)에서. 동작 줄이기면 3D 대신 층 교차 전환(MotionConfig reducedMotion="user" + 투명도)
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { LazyMotion, MotionConfig, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import type { Term } from "@app/content-schema";
import { stepView } from "@app/content-schema/scene";
import DefenseSwitch from "./DefenseSwitch.tsx";

const loadFeatures = () => import("./motionFeatures.ts").then((r) => r.default);
const EASE_OUT = [0.16, 1, 0.3, 1] as const; // --ease-out
/** 장면 옆 작은 캡션(한두 줄): 첫 문장. 첫 문장이 짧아 이유가 빠지면(30자 미만) 둘째 문장까지 */
const firstSentence = (s: string) => {
  const parts = s.match(/[^.!?]*[.!?](?=\s|$)/g) ?? [s];
  return (parts[0]!.trim().length < 30 && parts[1] ? parts[0]! + parts[1] : parts[0]!).trim();
};

type Result = "idle" | "sent" | "blocked";

export default function ClickjackTrick({ term }: { term: Term }) {
  const reduced = useReducedMotion() ?? false;
  const [defense, setDefense] = useState(false);
  const [result, setResult] = useState<Result>("idle");
  const defenseIndex = term.defenses.findIndex((d) => d.blockedAtStep !== undefined);
  const steps = term.scenario.steps;
  // 은행 주소·결과 캡션은 콘텐츠에서: iframe 요청 단계의 주소, 클릭 단계, 차단 단계
  const clickStep = stepView(term, null, Math.max(0, steps.length - 2));
  const blockedStep = defenseIndex >= 0 ? stepView(term, defenseIndex, term.defenses[defenseIndex]!.blockedAtStep! - 1) : null;
  const bankPath = steps.map((s) => s.label ?? "").find((l) => l.includes("/transfer"))?.replace(/^GET\s+/, "").split("?")[0] ?? "/transfer";
  const open = result !== "idle";
  // 포커스 관리: 벌어지면 [다시 해 보기]로, 접히면 [경품 받기]로(눌린 버튼이 비활성화돼 포커스가 사라지지 않게)
  const prizeBtn = useRef<HTMLButtonElement>(null);
  const resetBtn = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    (open ? resetBtn : prizeBtn).current?.focus();
  }, [open]);

  const press = () => {
    moved.current = true;
    setResult(defense && blockedStep ? "blocked" : "sent");
  };
  const reset = () => setResult("idle");
  const tilt = open && !reduced;
  const enter = { duration: 0.6, ease: EASE_OUT };
  const leave = { duration: 0.32, ease: EASE_OUT };

  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">
        <div className="trick" data-result={result}>
          <p className="name-tag trick-tag">직접 해 보기</p>
          {/* 처음에는 은행 층이 완전히 투명하다(실제 공격처럼). 클릭은 미끼 버튼이 받는다 */}
          <m.div className="trick-stack" animate={{ rotateY: tilt ? -30 : 0, rotateX: tilt ? 10 : 0 }} transition={open ? enter : leave}>
            {/* 아래층: 경품 팝업(사용자가 보는 화면) */}
            <m.div
              className="trick-layer trick-popup liquid"
              animate={{ z: tilt ? -170 : 0, x: tilt ? -210 : 0, y: tilt ? 24 : 0, opacity: open && reduced ? 0 : 1 }}
              transition={open ? enter : leave}
            >
              <div className="trick-bar" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <p className="trick-title chrome-text">축하합니다!</p>
              <p className="trick-sub">경품에 당첨되었습니다</p>
              <button ref={prizeBtn} type="button" className="btn-chrome btn-chrome-lg trick-button" onClick={press} disabled={open}>
                경품 받기
              </button>
            </m.div>

            {/* 위층: 투명하게 겹친 가짜 은행 송금 화면(방어면 빈 칸). 처음에는 거의 보이지 않는다 */}
            <m.div
              className={`trick-layer trick-bank${result === "blocked" ? " is-empty" : ""}`}
              aria-hidden={!open}
              initial={false}
              animate={{ z: tilt ? 150 : 0, x: tilt ? 95 : 0, opacity: open ? 1 : 0 }}
              transition={open ? enter : leave}
            >
              {result === "blocked" ? (
                <div className="trick-refused">
                  <p className="trick-refused-label">{blockedStep?.blockedLabel}</p>
                  <p>bank.example 화면이 표시되지 않음</p>
                </div>
              ) : (
                <>
                  <p className="trick-url num">bank.example{bankPath}</p>
                  <dl className="trick-form">
                    <dt>받는 사람</dt>
                    <dd>공격자 계좌</dd>
                    <dt>금액</dt>
                    <dd className="num">1,000,000원</dd>
                  </dl>
                  <span className="trick-send">송금</span>
                  {result === "sent" && <m.span className="trick-hit" aria-hidden="true" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.32, delay: reduced ? 0 : 0.4 }} />}
                </>
              )}
            </m.div>
          </m.div>

          <div className="trick-side">
            <DefenseSwitch
              on={defense}
              onChange={(on) => {
                setDefense(on);
                reset();
              }}
              disabled={!blockedStep}
              hint={term.defenses[defenseIndex]?.name}
            />
            <p className="trick-caption" role="status">
              {result === "sent" && (
                <>
                  <strong className="trick-outcome is-attack">{clickStep.title}</strong>
                  {firstSentence(clickStep.caption)}
                </>
              )}
              {result === "blocked" && blockedStep && (
                <>
                  <strong className="trick-outcome is-defense">{blockedStep.title}</strong>
                  {firstSentence(blockedStep.caption)}
                </>
              )}
              {result === "idle" && <>체험용 가짜 화면이에요. 실제로는 아무것도 보내지 않아요. 팝업의 버튼을 눌러 보세요.</>}
            </p>
            {open && (
              <button ref={resetBtn} type="button" className="btn-chrome trick-reset" onClick={reset}>
                다시 해 보기
              </button>
            )}
            <Link to={`/terms/${term.id}`} className="trick-more">
              {term.name} 자세히 보기
            </Link>
          </div>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
