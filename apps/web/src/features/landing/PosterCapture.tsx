// 개발 서버 전용(/?poster&hero=a|b&theme=light|dark): 랜딩 3D 장면을 진행도 0·시간 정지로 그려 WebP로 꺼낸다.
// scripts/render-landing-posters.ts가 window.__landingPoster를 읽어 features/landing/posters/hero-<a|b>-<light|dark>.webp로 저장한다(첫 화면 LCP용 정지 이미지)
import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import LandingScene, { type Hero } from "./LandingScene.tsx";

const FRAMES_BEFORE_CAPTURE = 40; // 환경맵·유리 버퍼가 채워질 때까지
const still = { get: () => 0 };

export default function PosterCapture({ hero }: { hero: Hero }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // 테마별로 찍는다(유리의 굴절 바탕이 페이지 바탕색). 장면이 토큰을 읽기 전에 정한다
  useState(() => {
    document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";
  });
  useEffect(() => {
    let frames = 0;
    let id = 0;
    const tick = () => {
      if (++frames < FRAMES_BEFORE_CAPTURE) id = requestAnimationFrame(tick);
      else Object.assign(window, { __landingPoster: canvas.current?.toDataURL("image/webp", 0.8) });
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="poster-capture">
      <Canvas ref={canvas} dpr={1} camera={{ fov: 35, position: [0, 0, 9], near: 0.1, far: 60 }} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}>
        <LandingScene hero={hero} progress={still} defense quality="high" still />
      </Canvas>
    </div>
  );
}
