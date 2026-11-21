// 히어로 C의 배경 3D: 가운데 체험 팝업을 둘러싼 크롬 물체와 유리 브라우저(장식). A와 같은 장면·재질·성능 조절, 스크롤 이야기는 없다
import { useEffect, useState, type RefObject } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import LandingScene, { type Quality } from "./LandingScene.tsx";

const still = { get: () => 0 };
const quality = (): Quality => {
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  return matchMedia("(pointer: coarse)").matches || innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4 || memory <= 4 ? "low" : "high";
};

export default function HeroBackdrop({ section, onReady }: { section: RefObject<HTMLElement | null>; onReady: () => void }) {
  const [q, setQ] = useState(quality);
  const [visible, setVisible] = useState(true);
  // 화면 밖이면 렌더를 멈춘다
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    // 장면이 25% 넘게 보일 때만 그린다(아래 CSRF 체험의 3D와 동시에 돌지 않게)
    const io = new IntersectionObserver(([e]) => setVisible((e?.intersectionRatio ?? 0) > 0.25), { threshold: [0, 0.25, 0.5] });
    io.observe(el);
    return () => io.disconnect();
  }, [section]);
  return (
    <div className="story-canvas" aria-hidden="true">
      <Canvas
        dpr={q === "high" ? [1, 1.25] : 1}
        frameloop={visible ? "always" : "never"}
        camera={{ fov: 35, position: [0, 0, 9], near: 0.1, far: 60 }}
        gl={{ antialias: q === "high", alpha: true, powerPreference: "high-performance" }}
      >
        <PerformanceMonitor bounds={() => [45, 60]} flipflops={1} onDecline={() => setQ("low")} onFallback={() => setQ("low")} />
        <LandingScene hero="c" progress={still} defense={false} quality={q} onFirstFrame={onReady} />
      </Canvas>
    </div>
  );
}
