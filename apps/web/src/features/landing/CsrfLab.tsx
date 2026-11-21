// C-2 "직접 해 보기": CSRF 체험. 화면 안에서만 도는 가짜 장면이고 실제 요청·입력은 없다.
// 유리 브라우저 안 함정 탭을 끌어 돌리면(화살표 키·[뒤집기]도 같음) 뒷면의 숨은 송금 폼이 드러나고, 쿠키 보관함의 쿠키가 봉투에 붙는다.
// 끝까지 돌리면 방어가 꺼져 있으면 송금 완료, 켜져 있으면 토큰 칸이 비어 403 도장. 3D는 WebGL일 때만(CsrfFlipCanvas),
// 동작 줄이기·WebGL 없음이면 앞뒤 면 교차 전환 카드. 단계 제목·라벨·차단 문구는 용어 JSON(stepView)에서
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Link } from "react-router";
import { AnimatePresence, LazyMotion, MotionConfig } from "motion/react";
import * as m from "motion/react-m";
import type { Term } from "@app/content-schema";
import { stepView } from "@app/content-schema/scene";
import DefenseSwitch from "./DefenseSwitch.tsx";
import type { Face } from "./CsrfFlipCanvas.tsx";

const CsrfFlipCanvas = lazy(() => import("./CsrfFlipCanvas.tsx"));
// 첫 화면 묶음에는 가벼운 m만, 움직임 기능은 따로 받는다(ClickjackTrick과 같은 방식)
const loadFeatures = () => import("./motionFeatures.ts").then((r) => r.default);
const EASE_OUT = [0.16, 1, 0.3, 1] as const; // --ease-out
/** 장면 옆 작은 캡션(한두 줄): 첫 문장. 첫 문장이 짧아 이유가 빠지면(30자 미만) 둘째 문장까지 */
const firstSentence = (s: string) => {
  const parts = s.match(/[^.!?]*[.!?](?=\s|$)/g) ?? [s];
  return (
    parts[0]!.trim().length < 30 && parts[1] ? parts[0]! + parts[1] : parts[0]!
  ).trim();
};
const clamp = (v: number) => Math.min(180, Math.max(0, v));

function FaceCard({ face, tone }: { face: Face; tone: "attack" | "defense" }) {
  return (
    <div className={`lab-face tone-${tone}`}>
      <p className="lab-face-title">{face.title}</p>
      <dl>
        {face.lines.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {face.button && <span className="lab-face-button">{face.button}</span>}
    </div>
  );
}

export default function CsrfLab({
  term,
  enhanced,
}: {
  term: Term;
  enhanced: boolean;
}) {
  const section = useRef<HTMLElement>(null);
  const [angle, setAngle] = useState(0);
  const [defense, setDefense] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; a: number } | null>(null);
  // 3D는 이 구간이 화면 근처(300px)에 올 때 만든다(무거운 초기화를 첫 화면에서 미룬다)
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = section.current;
    if (!enhanced || !el) return;
    const io = new IntersectionObserver(
      ([e]) => e?.isIntersecting && setNear(true),
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enhanced]);

  const defenseIndex = term.defenses.findIndex(
    (d) => d.blockedAtStep !== undefined,
  );
  const defenseName = term.defenses[defenseIndex]?.name;
  const steps = term.scenario.steps;
  const trap = stepView(
    term,
    null,
    Math.max(
      0,
      steps.findIndex((s) => s.label?.startsWith("GET")),
    ),
  );
  const forged = stepView(
    term,
    null,
    Math.max(
      0,
      steps.findIndex((s) => s.label?.startsWith("POST /transfer")),
    ),
  );
  const done = stepView(term, null, steps.length - 1);
  const blocked =
    defenseIndex >= 0
      ? stepView(
          term,
          defenseIndex,
          term.defenses[defenseIndex]!.blockedAtStep! - 1,
        )
      : null;

  // 탭 두 면(3D 텍스처와 대체 카드가 같은 내용). 방어가 켜지면 뒷면에 빈 토큰 칸이 생긴다
  const front = useMemo<Face>(
    () => ({
      title: "이벤트 당첨!",
      lines: [
        ["보낸 곳", "함정 사이트"],
        ["주소", trap.label ?? ""],
      ],
      button: "이벤트 참여",
    }),
    [trap.label],
  );
  const back = useMemo<Face>(
    () => ({
      title: "숨은 송금 폼",
      lines: [
        ["요청", `${forged.label ?? "POST /transfer"} → bank.example`],
        ["받는 사람", "공격자 계좌"],
        ["금액", "1,000,000원"],
        ...(defense
          ? ([["csrf_token", "(비어 있음)"]] as [string, string][])
          : []),
      ],
    }),
    [forged.label, defense],
  );

  const flipped = angle >= 180 && !dragging;
  const result: "none" | "sent" | "blocked" = flipped
    ? defense && blocked
      ? "blocked"
      : "sent"
    : "none";
  const side = angle > 90 ? "back" : "front";

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, a: angle };
    setDragging(true);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current)
      setAngle(clamp(drag.current.a + (e.clientX - drag.current.x) * 0.6));
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    setAngle((a) => (a > 90 ? 180 : 0)); // 놓으면 가까운 면으로 안착
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // 이전 각도를 기준으로(빠르게 연달아 눌러도 누른 만큼 돈다)
    const step: ((a: number) => number) | null =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? (a) => a + 30
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? (a) => a - 30
          : e.key === "Home"
            ? () => 0
            : e.key === "End"
              ? () => 180
              : null;
    if (!step) return;
    e.preventDefault();
    setAngle((a) => clamp(step(a)));
  };

  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">
        <section ref={section} className="lab" aria-labelledby="lab-title">
          <div className="lab-head">
            <p className="name-tag">직접 해 보기</p>
            <h2 id="lab-title" className="lab-title">
              {term.name}
            </h2>
          </div>

          <div className="lab-stage">
            {enhanced ? (
              near && (
                <Suspense fallback={null}>
                  <CsrfFlipCanvas
                    section={section}
                    angle={angle}
                    defense={defense}
                    result={result}
                    front={front}
                    back={back}
                  />
                </Suspense>
              )
            ) : (
              <div className="lab-fallback">
                {/* 동작 줄이기·WebGL 없음: 앞뒤 면을 교차 전환 */}
                <AnimatePresence mode="wait" initial={false}>
                  <m.div
                    key={side}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {side === "front" ? (
                      <FaceCard face={front} tone="attack" />
                    ) : (
                      <FaceCard
                        face={back}
                        tone={defense ? "defense" : "attack"}
                      />
                    )}
                  </m.div>
                </AnimatePresence>
                {side === "back" && (
                  <p className="lab-cookie">
                    쿠키 보관함의 bank.example 쿠키가 요청에 붙었어요
                  </p>
                )}
              </div>
            )}
            {/* 끌어 돌리기(포인터) + 화살표 키. 화면 읽기 프로그램에는 지금 보이는 면을 알린다 */}
            <div
              className="lab-drag"
              role="slider"
              tabIndex={0}
              aria-label="함정 탭 돌리기"
              aria-valuemin={0}
              aria-valuemax={180}
              aria-valuenow={Math.round(angle)}
              aria-valuetext={
                side === "front"
                  ? `앞면: ${front.title}`
                  : `뒷면: ${back.title}`
              }
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onKeyDown={onKey}
            />
            <AnimatePresence>
              {result === "blocked" && (
                <m.p
                  key="stamp"
                  className="story-stamp lab-stamp"
                  initial={{ opacity: 0, scale: 1.6, rotate: -14 }}
                  animate={{ opacity: 1, scale: 1, rotate: -6 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.32, ease: EASE_OUT }}
                >
                  {blocked?.blockedLabel}
                </m.p>
              )}
              {result === "sent" && (
                <m.p
                  key="sent"
                  className="story-pass lab-stamp"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                >
                  {done.label}
                </m.p>
              )}
            </AnimatePresence>
          </div>

          <div className="lab-side">
            <div className="lab-controls">
              <button
                type="button"
                className="btn-chrome"
                onClick={() => setAngle((a) => (a > 90 ? 0 : 180))}
              >
                {side === "front" ? "뒤집기" : "앞면으로"}
              </button>
              <DefenseSwitch
                on={defense}
                onChange={setDefense}
                disabled={!blocked}
                hint={defenseName}
              />
            </div>
            <p className="lab-caption" role="status">
              {result === "blocked" && blocked ? (
                <>
                  <strong className="trick-outcome is-defense">
                    {blocked.title}
                  </strong>
                  {firstSentence(blocked.caption)}
                </>
              ) : result === "sent" ? (
                <>
                  <strong className="trick-outcome is-attack">
                    {done.title}
                  </strong>
                  {firstSentence(done.caption)}
                </>
              ) : side === "back" ? (
                <>
                  <strong className="trick-outcome is-attack">
                    {forged.title}
                  </strong>
                  {firstSentence(forged.caption)}
                </>
              ) : (
                <>
                  탭을 끌어 돌리거나 [뒤집기]를 눌러 보세요. 체험용 가짜
                  화면이에요.
                </>
              )}
            </p>
            <Link to={`/terms/${term.id}`} className="trick-more">
              {term.name} 자세히 보기
            </Link>
          </div>
        </section>
      </MotionConfig>
    </LazyMotion>
  );
}
