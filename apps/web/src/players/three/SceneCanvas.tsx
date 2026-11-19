// 3D 무대 틀(모든 장면 공통): 캔버스·조명·HTML 라벨 층·자유 시점 안내. 화면 밖이거나 탭이 숨겨지면 그리기를 멈춘다 (docs/06 5절)
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Canvas } from "@react-three/fiber";
import type { StageProps } from "../stage.ts";
import { FOV } from "./camera.ts";

/** 장면 루트가 받는 것: 라벨을 붙일 HTML 층, 그림자 해상도, 지금 그려도 되는지 */
export type SceneFrame = { labelRoot: RefObject<HTMLDivElement | null>; shadowSize: number; visible: boolean };

type Props = Pick<StageProps, "stageRef" | "freeView"> & { children: (frame: SceneFrame) => ReactNode };

export function SceneCanvas({ stageRef, freeView, children }: Props) {
  const labelRoot = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [mobile] = useState(() => matchMedia("(max-width: 639px)").matches);

  useEffect(() => {
    const el = stageRef.current;
    const io = el ? new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting))) : undefined;
    if (el) io?.observe(el);
    const onVis = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [stageRef]);
  const visible = onScreen && pageVisible;

  return (
    <div className="scene3d">
      <div className="scene-canvas" aria-hidden="true">
        <Canvas
          dpr={[1, 2]}
          shadows="percentage"
          frameloop={visible ? "always" : "never"}
          camera={{ fov: FOV, position: [0, 12.5, 14], near: 0.1, far: 160 }}
          gl={{ antialias: true, alpha: true }}
        >
          {children({ labelRoot, shadowSize: mobile ? 1024 : 1536, visible })}
        </Canvas>
      </div>
      <div ref={labelRoot} className="scene-labels" aria-hidden="true" />
      {freeView && <p className="scene-hint">드래그해서 돌리고, 휠로 확대해 보세요. 무대에 포커스가 있으면 화살표로도 돌릴 수 있어요.</p>}
    </div>
  );
}

/** 장면 공통 조명(그림자 범위는 무대 크기 기준) */
export function SceneLights({ shadowSize }: { shadowSize: number }) {
  return (
    <>
      <hemisphereLight intensity={1.1} />
      <ambientLight intensity={0.35} />
      <directionalLight
        castShadow
        position={[6, 12, 8]}
        intensity={1.8}
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-far={40}
      />
    </>
  );
}
