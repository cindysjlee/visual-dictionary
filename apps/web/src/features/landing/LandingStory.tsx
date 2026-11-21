// 랜딩의 고정(sticky) 스크롤 구간: 3D 장면 + 단계 캡션 + [방어 켜기] + 403 도장. three.js·motion을 쓰므로 첫 화면 뒤에 따로 받는다.
// 스크롤은 motion useScroll(문서 스크롤 그대로): 키보드·화면 읽기 프로그램·아래 DOM 내용과 한 흐름이고, 장면을 끄면 그대로 일반 페이지가 된다
import { useEffect, useRef, useState, type RefObject } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { AnimatePresence, MotionConfig, motion, useMotionValueEvent, useScroll } from "motion/react";
import type { Term } from "@app/content-schema";
import { stepView } from "@app/content-schema/scene";
import DefenseSwitch from "./DefenseSwitch.tsx";
import LandingScene, { type Hero, type Quality } from "./LandingScene.tsx";

const EASE_OUT = [0.16, 1, 0.3, 1] as const; // --ease-out
/** 휴대폰·저사양: 유리 품질(샘플·해상도)과 픽셀 비율을 낮춘다 */
const quality = (): Quality => {
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  return matchMedia("(pointer: coarse)").matches || innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4 || memory <= 4 ? "low" : "high";
};
/** 자막의 첫 문장만(장면 옆 작은 캡션) */
const firstSentence = (s: string) => s.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? s;

type Props = { section: RefObject<HTMLElement | null>; hero: Hero; term: Term; onReady: () => void };

export default function LandingStory({ section, hero, term, onReady }: Props) {
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  const [stage, setStage] = useState(0);
  const [defense, setDefense] = useState(true);
  const [visible, setVisible] = useState(true);
  const [q, setQ] = useState(quality);
  const defenseIndex = term.defenses.findIndex((d) => d.blockedAtStep !== undefined);
  const blockedAt = defenseIndex >= 0 ? term.defenses[defenseIndex]!.blockedAtStep! : term.scenario.steps.length;

  // 진행도: 머리 글(HUD)이 CSS 변수로 사라지고, 구간마다 캡션이 바뀐다
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const next = v < 0.14 ? 0 : v < 0.5 ? 1 : v < 0.82 ? 2 : 3;
    section.current?.style.setProperty("--p", v.toFixed(3));
    if (section.current) section.current.dataset.stage = String(next); // 머리 글을 숨기는 기준(landing.css)
    setStage(next);
  });

  // 화면 밖이면 렌더를 멈춘다
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)));
    io.observe(el);
    return () => io.disconnect();
  }, [section]);

  // 구간 → 실제 용어 단계(플레이어와 같은 stepView): 함정 사이트 → 위조 요청 → 검문소(방어면 차단, 아니면 마지막 단계)
  const mode = defense && defenseIndex >= 0 ? defenseIndex : null;
  const at = stage === 1 ? blockedAt - 2 : stage === 2 ? blockedAt - 1 : defense ? blockedAt - 1 : term.scenario.steps.length - 1;
  const view = stage === 0 ? null : stepView(term, stage === 3 ? mode : null, Math.max(0, at));
  const blocked = stage === 3 && defense && view?.blocked;

  return (
    <MotionConfig reducedMotion="user">
      <div className="story-canvas" aria-hidden="true">
        <Canvas
          dpr={q === "high" ? [1, 1.25] : 1}
          frameloop={visible ? "always" : "never"}
          camera={{ fov: 35, position: [0, 0, 9], near: 0.1, far: 60 }}
          gl={{ antialias: q === "high", alpha: true, powerPreference: "high-performance" }}
        >
          {/* 실제 프레임률이 떨어지면 낮은 품질로(한 번 내리면 다시 올리지 않는다) */}
          <PerformanceMonitor bounds={() => [45, 60]} flipflops={1} onDecline={() => setQ("low")} onFallback={() => setQ("low")} />
          <LandingScene hero={hero} progress={scrollYProgress} defense={defense} quality={q} onFirstFrame={onReady} />
        </Canvas>
      </div>

      <div className="story-controls">
        <AnimatePresence mode="wait" initial={false}>
          {view && (
            <motion.p
              key={`${stage}-${defense}`}
              className="story-caption liquid"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: EASE_OUT }}
            >
              <span className="story-step num">{view.index + 1}</span>
              <span className="story-title">{view.title}</span>
              <span className="story-line">{firstSentence(view.caption)}</span>
            </motion.p>
          )}
        </AnimatePresence>
        <DefenseSwitch on={defense} onChange={setDefense} disabled={defenseIndex < 0} />
      </div>

      <AnimatePresence>
        {stage === 3 &&
          (blocked ? (
            <motion.p
              key="stamp"
              className="story-stamp"
              role="status"
              initial={{ opacity: 0, scale: 1.6, rotate: -14 }}
              animate={{ opacity: 1, scale: 1, rotate: -6 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.36, ease: EASE_OUT }}
            >
              {view?.blockedLabel}
            </motion.p>
          ) : (
            <motion.p
              key="pass"
              className="story-pass"
              role="status"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
            >
              {view?.label}
            </motion.p>
          ))}
      </AnimatePresence>
    </MotionConfig>
  );
}
