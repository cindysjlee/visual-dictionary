// 랜딩의 유일한 체험 "직접 해 보기": 클릭재킹. 화면 안에서만 도는 가짜 장면이고 실제 요청·입력은 없다.
// 단계: 등장(Y2K 창이 점에서 열림, 크롬 테두리 빛, 마우스 기울기) → 누름(파문 + 한 박자) → 드러남(층이 3D로 벌어지고
// 투명도 0이던 가짜 은행 송금 층이 서서히 보임, 글리치 1회, 층 이름표) → 결과(은행 층이 다 보인 뒤: 송금 버튼이 빛나고 잔액이 줄며 동전이 빠져나감)
// 또는 방어(빈 칸 + 방패, 진짜 경품 축하) → 다시 해 보기. 단계 제목·주소·금액·차단 문구는 용어 JSON(stepView)에서.
// 동작 줄이기면 파문·한 박자·글리치·3D 없이 경품 층이 흐려지고 → 은행 층이 나타나는 순서의 교차 전환(이동·회전 목표 0, 투명도만)
// 3D 주의: preserve-3d 무대(.trick-stage)에는 filter를 걸지 않는다(평면화되고 유리의 배경 흐림도 막힌다, motion reviewer 지적)
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { Link } from "react-router";
import { LazyMotion, MotionConfig, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import type { Term } from "@app/content-schema";
import { stepView } from "@app/content-schema/scene";
import { balanceAt } from "./countdown.ts";
import DefenseSwitch from "./DefenseSwitch.tsx";

const loadFeatures = () => import("./motionFeatures.ts").then((r) => r.default);
const EASE_OUT = [0.16, 1, 0.3, 1] as const; // --ease-out
const HUSH = [0.05, 0.7, 0.1, 1] as const; // 한 박자: 확 퍼진 뒤 거의 멈춘 듯 끝난다
const BEAT_MS = 620;
const REVEAL_S = 0.9;
const RESULT_MS = 900; // 결과(빛남·잔액·동전)는 은행 층이 거의 다 보인 뒤
const GLITCH_AT_MS = 180; // 은행 층이 보이기 시작할 때 두 층이 함께 깨진다
const GLITCH_MS = 300;

export type Win = "chrome" | "holo" | "aqua";
type Phase = "idle" | "beat" | "reveal";
type Outcome = "sent" | "blocked";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 잔액이 줄어드는 숫자(결과 때만, 동작 줄이기면 바로 최종값) */
function useCountdown(from: number, to: number, run: boolean, instant: boolean) {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (!run) return setValue(from);
    if (instant) return setValue(to);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setValue(balanceAt(from, to, now - start, 900));
      if (now - start < 900) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, run, instant]);
  return value;
}

export default function ClickjackTrick({ term, win }: { term: Term; win: Win }) {
  const reduced = useReducedMotion() ?? false;
  const [defense, setDefense] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [outcome, setOutcome] = useState<Outcome>("sent");
  const [landed, setLanded] = useState(false); // 결과 효과를 보여도 되는 때(은행 층이 다 보인 뒤)
  const [glitch, setGlitch] = useState(false);
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const prizeBtn = useRef<HTMLButtonElement>(null);
  const resetBtn = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);

  // 콘텐츠: 은행 주소·금액(iframe 요청 단계의 주소), 클릭 단계 제목, 차단 단계(방어)
  const steps = term.scenario.steps;
  const frameLabel = steps.map((s) => s.label ?? "").find((l) => l.includes("/transfer")) ?? "/transfer";
  const bankPath = frameLabel.replace(/^GET\s+/, "").split("?")[0];
  const amount = Number(frameLabel.match(/amount=(\d+)/)?.[1] ?? 1000000);
  const balanceBefore = amount * 3; // 장면용 가짜 잔액
  const clickStep = stepView(term, null, Math.max(0, steps.length - 2));
  const defenseIndex = term.defenses.findIndex((d) => d.blockedAtStep !== undefined);
  const blockedStep = defenseIndex >= 0 ? stepView(term, defenseIndex, term.defenses[defenseIndex]!.blockedAtStep! - 1) : null;

  const open = phase !== "idle";
  const revealed = phase === "reveal";
  const sent = revealed && outcome === "sent";
  const blocked = revealed && outcome === "blocked";
  const balance = useCountdown(balanceBefore, balanceBefore - amount, sent && landed, reduced);
  const motionOn = !reduced; // 동작 줄이기면 이동·회전 목표를 모두 0으로(투명도만)

  // 마우스를 따라 창이 살짝 기울고 크롬에 비친 빛이 움직인다(CSS 변수 + transition, 장식). 벌어진 뒤에는 멈춘다.
  // Motion 스프링을 쓰면 애니메이션 엔진이 첫 화면 묶음에 들어가 120KB를 넘는다
  const tilt = (e: PointerEvent<HTMLDivElement>) => {
    const el = windowRef.current;
    if (!el || open || reduced) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ry", `${((px - 0.5) * 12).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${((0.5 - py) * 10).toFixed(2)}deg`);
    el.style.setProperty("--lx", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--ly", `${(py * 100).toFixed(1)}%`);
  };
  const untilt = () => {
    windowRef.current?.style.setProperty("--rx", "0deg");
    windowRef.current?.style.setProperty("--ry", "0deg");
  };

  // 포커스: 벌어지면 [다시 해 보기], 접히면 [경품 받기](눌린 버튼이 잠겨 포커스가 사라지지 않게)
  useEffect(() => {
    if (!moved.current) return;
    (open ? resetBtn : prizeBtn).current?.focus();
  }, [open]);

  const press = (e: MouseEvent<HTMLButtonElement>) => {
    moved.current = true;
    untilt();
    setOutcome(defense && blockedStep ? "blocked" : "sent");
    // 파문: 클릭 지점(키보드면 버튼 가운데)에서
    const box = windowRef.current?.getBoundingClientRect();
    const btn = e.currentTarget.getBoundingClientRect();
    const x = e.clientX || btn.left + btn.width / 2;
    const y = e.clientY || btn.top + btn.height / 2;
    if (box) setRipple({ x: x - box.left, y: y - box.top, key: Date.now() });
    setPhase(reduced ? "reveal" : "beat");
  };

  // 단계 시간표: 한 박자 → 드러남, 드러남 180ms 뒤 글리치 300ms, 드러남 900ms 뒤 결과
  useEffect(() => {
    if (phase === "beat") {
      const t = setTimeout(() => setPhase("reveal"), BEAT_MS);
      return () => clearTimeout(t);
    }
    if (phase !== "reveal") return;
    if (reduced) {
      setLanded(true);
      return;
    }
    const timers = [
      setTimeout(() => setGlitch(true), GLITCH_AT_MS),
      setTimeout(() => setGlitch(false), GLITCH_AT_MS + GLITCH_MS),
      setTimeout(() => setLanded(true), RESULT_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase, reduced]);

  const reset = () => {
    setPhase("idle");
    setLanded(false);
    setGlitch(false);
    setRipple(null);
  };

  const fold = { duration: 0.32, ease: EASE_OUT };
  const spread = { duration: REVEAL_S, ease: EASE_OUT };
  // 동작 줄이기: 경품 층이 먼저 흐려지고(0.2s) → 은행 층(0.2s 뒤) → 이름표(0.4s 뒤)
  const prizeT = revealed ? (reduced ? { duration: 0.2 } : spread) : fold;
  const bankT = revealed ? (reduced ? { duration: 0.2, delay: 0.2 } : { ...spread, opacity: { duration: REVEAL_S, delay: 0.15 } }) : fold;
  const tagDelay = reduced ? 0.4 : 0.5;

  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">
        <div className={`trick win-${win}`} data-phase={phase} data-outcome={outcome}>
          <p className="name-tag trick-tag">직접 해 보기</p>

          <div className="trick-scene" onPointerMove={tilt} onPointerLeave={untilt}>
            {/* 바깥: 마우스 기울기(CSS). 안쪽: 등장·한 박자·드러남(서로 다른 층이라 회전 값이 겹치지 않는다) */}
            <div ref={windowRef} className="trick-tilt">
              {/* 창 등장: 작은 점에서 튀어나와 커진다(살짝 넘친 뒤 안착). filter 없이 크기·투명도만 */}
              <m.div
                className={`trick-stage${glitch ? " is-glitching" : ""}`}
                initial={{ scale: 0.04, opacity: 0 }}
                animate={
                  phase === "beat"
                    ? { scale: 0.985, opacity: 1, transition: { duration: BEAT_MS / 1000, ease: HUSH } }
                    : revealed
                      ? { scale: 1, opacity: 1, rotateX: motionOn ? 12 : 0, rotateY: motionOn ? -16 : 0, transition: spread }
                      : { scale: 1, opacity: 1, rotateX: 0, rotateY: 0, transition: { type: "spring", stiffness: 240, damping: 19, mass: 0.9 } }
                }
              >
                {/* 아래층: 보이던 경품 페이지(Y2K 운영체제 창) */}
                <m.div
                  className="trick-layer trick-popup"
                  animate={
                    revealed
                      ? { y: motionOn ? 64 : 0, z: motionOn ? -160 : 0, rotateX: motionOn ? 16 : 0, opacity: reduced ? 0.35 : 1 }
                      : { y: 0, z: 0, rotateX: 0, opacity: 1 }
                  }
                  transition={prizeT}
                >
                  <div className="trick-titlebar">
                    <span className="trick-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                    <span className="trick-wintitle">prize.exe</span>
                  </div>
                  <div className="trick-body">
                    <p className="trick-title chrome-text">축하합니다!</p>
                    <p className="trick-sub">경품에 당첨되었습니다</p>
                  </div>
                  {/* 미끼 버튼: 은행 층의 [송금]과 같은 자리(층의 아래 가운데) */}
                  <button ref={prizeBtn} type="button" className="btn-chrome btn-chrome-lg trick-button" onClick={press} disabled={open}>
                    경품 받기
                  </button>
                  {revealed && motionOn && (
                    <m.span className="layer-tag" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: tagDelay, duration: 0.2 }}>
                      보이던 층: 경품 페이지
                    </m.span>
                  )}
                  {/* 방어: 진짜 경품 창만 남았다(작은 축하 조각) */}
                  {blocked && landed && motionOn && (
                    <span className="confetti" aria-hidden="true">
                      {Array.from({ length: 12 }, (_, i) => (
                        <m.i
                          key={i}
                          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                          animate={{ x: Math.cos((i / 12) * Math.PI * 2) * 110, y: Math.sin((i / 12) * Math.PI * 2) * 80 - 30, opacity: 0, rotate: 240 }}
                          transition={{ duration: 0.8, ease: EASE_OUT }}
                        />
                      ))}
                    </span>
                  )}
                </m.div>

                {/* 위층: 숨어 있던 가짜 은행 송금 화면(투명도 0으로 겹침). 방어면 표시 거부된 빈 칸 */}
                <m.div
                  className={`trick-layer trick-bank${outcome === "blocked" && open ? " is-empty" : ""}`}
                  aria-hidden={!revealed}
                  initial={false}
                  animate={revealed ? { opacity: 1, z: motionOn ? 70 : 0, y: motionOn ? -12 : 0 } : { opacity: 0, z: 0, y: 0 }}
                  transition={bankT}
                >
                  {outcome === "blocked" && open ? (
                    <div className="trick-refused">
                      <svg className="trick-shield" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5l-8-3Z" />
                      </svg>
                      <p className="trick-refused-title">다른 사이트 안에 표시할 수 없음</p>
                      <p className="trick-refused-label">{blockedStep?.blockedLabel}</p>
                    </div>
                  ) : (
                    <>
                      <p className="trick-url num">bank.example{bankPath}</p>
                      <dl className="trick-form">
                        <dt>받는 사람</dt>
                        <dd>공격자 계좌</dd>
                        <dt>금액</dt>
                        <dd className="num">{won(amount)}</dd>
                        <dt>잔액</dt>
                        <dd className={`num trick-balance${sent && landed ? " is-falling" : ""}`}>{won(balance)}</dd>
                      </dl>
                      <span className={`trick-send${sent && landed ? " is-hit" : ""}`}>송금</span>
                      {sent && landed && motionOn && (
                        <span className="coins" aria-hidden="true">
                          {Array.from({ length: 5 }, (_, i) => (
                            <m.i
                              key={i}
                              initial={{ y: 0, opacity: 0 }}
                              animate={{ y: [0, 20, 150], x: (i - 2) * 22, opacity: [0, 1, 0], rotate: 180 }}
                              transition={{ duration: 0.9, delay: 0.1 + i * 0.08, ease: "easeIn" }}
                            />
                          ))}
                        </span>
                      )}
                    </>
                  )}
                  {revealed && motionOn && (
                    <m.span className="layer-tag is-hidden-layer" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: tagDelay, duration: 0.2 }}>
                      숨어 있던 층: bank.example (투명도 0)
                    </m.span>
                  )}
                </m.div>

                {/* 한 박자: 창이 잠깐 가라앉는다(무대에 filter 대신 덮개 층의 투명도) */}
                <m.span className="trick-dim" aria-hidden="true" initial={false} animate={{ opacity: phase === "beat" ? 0.32 : 0 }} transition={{ duration: phase === "beat" ? BEAT_MS / 1000 : 0.2, ease: HUSH }} />

                {/* 파문: 누른 자리에서 천천히 퍼진다(정답은 아직 알려 주지 않는다) */}
                {ripple && motionOn && (
                  <m.span
                    key={ripple.key}
                    className="trick-ripple"
                    aria-hidden="true"
                    style={{ left: ripple.x, top: ripple.y }}
                    initial={{ scale: 0, opacity: 0.6 }}
                    animate={{ scale: 9, opacity: 0 }}
                    transition={{ duration: BEAT_MS / 1000, ease: HUSH }}
                  />
                )}
              </m.div>
            </div>
            {/* 동작 줄이기: 층이 움직이지 않으므로 두 층이 같은 자리에 겹쳐 있었다는 사실을 글로 */}
            {revealed && reduced && (
              <m.p className="layer-order" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: tagDelay, duration: 0.2 }}>
                보이던 층: 경품 페이지 → 같은 자리 위에 숨어 있던 층: bank.example (투명도 0)
              </m.p>
            )}
          </div>

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
              {sent && landed ? (
                <strong className="trick-outcome is-attack">{clickStep.title}</strong>
              ) : blocked && landed ? (
                <strong className="trick-outcome is-defense">{blockedStep?.title}: 경품 창만 남았어요</strong>
              ) : (
                <>체험용 가짜 화면이에요. 실제로는 아무것도 보내지 않아요.</>
              )}
            </p>
            {/* 자리를 늘 잡아 둔다(나타날 때 옆 패널이 튀지 않게). 처음엔 숨김·포커스 불가 */}
            <button ref={resetBtn} type="button" className="btn-chrome trick-reset" onClick={reset} style={{ visibility: open ? "visible" : "hidden" }}>
              다시 해 보기
            </button>
            <Link to={`/terms/${term.id}`} className="trick-more">
              {term.name} 자세히 보기
            </Link>
          </div>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
