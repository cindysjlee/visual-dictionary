// C-2 CSRF 체험의 3D(WebGL일 때만): 유리 브라우저 안의 함정 탭이 각도(0~180°)만큼 돈다. 앞면은 이벤트 페이지, 뒷면은 숨은 송금 폼.
// 돌수록 쿠키 보관함의 크롬 쿠키가 봉투로 날아가 붙는다. 각도·방어·결과는 CsrfLab(DOM)이 정하고 여기서는 그리기만 한다
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { PerformanceMonitor, RoundedBox } from "@react-three/drei";
import { CanvasTexture, DoubleSide, MathUtils, SRGBColorSpace, type Group, type Texture } from "three";
import { Chrome, ChromeEnvironment, Glass, backdropTexture, token, type Quality } from "./LandingScene.tsx";

export type Face = { title: string; lines: [string, string][]; button?: string; warn?: string };
type Props = { section: RefObject<HTMLElement | null>; angle: number; defense: boolean; result: "none" | "sent" | "blocked"; front: Face; back: Face };

const quality = (): Quality => {
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  return matchMedia("(pointer: coarse)").matches || innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4 || memory <= 4 ? "low" : "high";
};

/** 탭 한 면을 캔버스로 그린다(장면 글자 토큰: 판 바탕 위 4.5:1, DF-48) */
function faceTexture(face: Face, tone: "attack" | "defense"): Texture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 680;
  const g = c.getContext("2d")!;
  const ink = token("--scene-ink", "#1f2433");
  const muted = token("--scene-ink-muted", "#4f5770");
  const accent = token(tone === "attack" ? "--scene-ink-attack" : "--scene-ink-defense", "#a63a0a");
  g.fillStyle = token("--scene-paper", "#ffffff");
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = token("--scene-paper-dim", "#eef1f7");
  g.fillRect(0, 0, c.width, 86);
  const font = (w: number, px: number) => `${w} ${px}px "Noto Sans KR", system-ui, sans-serif`;
  g.fillStyle = accent;
  g.font = font(800, 64);
  g.fillText(face.title, 64, 190);
  face.lines.forEach(([k, v], i) => {
    const y = 290 + i * 78;
    g.fillStyle = muted;
    g.font = font(500, 36);
    g.fillText(k, 64, y);
    g.fillStyle = ink;
    g.font = font(700, 40);
    g.fillText(v, 330, y);
  });
  if (face.warn) {
    g.fillStyle = accent;
    g.font = font(700, 34);
    g.fillText(face.warn, 64, 290 + face.lines.length * 78 + 10);
  }
  if (face.button) {
    g.fillStyle = accent;
    g.beginPath();
    g.roundRect(64, 520, 420, 100, 50);
    g.fill();
    g.fillStyle = token("--scene-paper", "#ffffff");
    g.font = font(800, 44);
    g.fillText(face.button, 110, 585);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function Scene({ angle, defense, result, front, back, quality: q }: Omit<Props, "section"> & { quality: Quality }) {
  const backdrop = useMemo(backdropTexture, []);
  const colors = useMemo(() => ({ chrome: token("--landing-chrome", "#dfe5f2"), gold: token("--scene-gold", "#d99a1e"), pink: token("--landing-holo-pink", "#ff8fcf"), sky: token("--landing-holo-sky", "#8fd0ff"), attack: token("--attack", "#d9480f") }), []);
  const panels = useMemo(() => [colors.pink, colors.sky, colors.attack], [colors]);
  // 글꼴이 준비된 뒤 면을 그린다(캔버스 글자는 페이지 글꼴을 쓴다)
  const [faces, setFaces] = useState<[Texture, Texture] | null>(null);
  useEffect(() => {
    let alive = true;
    void document.fonts.ready.then(() => alive && setFaces([faceTexture(front, "attack"), faceTexture(back, defense ? "defense" : "attack")]));
    return () => {
      alive = false;
    };
  }, [front, back, defense]);

  const tab = useRef<Group>(null);
  const cookie = useRef<Group>(null);
  const envelope = useRef<Group>(null);
  const rot = useRef(0);
  useFrame((state, delta) => {
    rot.current = MathUtils.damp(rot.current, MathUtils.degToRad(angle), 9, delta); // 끄는 동안은 바로 따라오고, 놓으면 감쇠로 안착
    if (tab.current) tab.current.rotation.y = rot.current;
    const turn = rot.current / Math.PI; // 0~1
    // 쿠키: 보관함(왼쪽) → 봉투(오른쪽 아래). 돌리는 동안 날아가 붙는다
    const fly = MathUtils.smoothstep(turn, 0.35, 0.85);
    cookie.current?.position.set(MathUtils.lerp(-2.05, 1.35, fly), MathUtils.lerp(-0.55, -0.95, fly) + Math.sin(fly * Math.PI) * 0.9, MathUtils.lerp(0.2, 0.75, fly));
    cookie.current?.rotation.set(Math.PI / 2, state.clock.elapsedTime * 0.8, 0);
    // 봉투: 뒷면이 드러나면 나타나고, 결과에 따라 튕기거나(차단) 오른쪽으로 날아간다(송금)
    const show = MathUtils.smoothstep(turn, 0.5, 0.8);
    const away = result === "sent" ? 1 : 0;
    if (envelope.current) {
      envelope.current.scale.setScalar(Math.max(0.001, show) * 0.62);
      envelope.current.position.x = MathUtils.damp(envelope.current.position.x, 1.2 + away * 3.2, 4, delta);
      envelope.current.position.y = -0.9 + (result === "blocked" ? Math.sin(state.clock.elapsedTime * 10) * 0.02 : 0);
    }
  });

  return (
    <>
      <primitive attach="background" object={backdrop} />
      <ChromeEnvironment panels={panels} />
      <ambientLight intensity={0.5} />
      {/* 유리 브라우저 창 */}
      <group position={[0.25, 0.25, -0.35]}>
        <RoundedBox args={[3.9, 2.85, 0.18]} radius={0.14} smoothness={6}>
          <Glass quality={q} thick={0.4} backdrop={backdrop} />
        </RoundedBox>
        <RoundedBox args={[3.78, 0.22, 0.06]} radius={0.05} position={[0, 1.24, 0.12]}>
          <Chrome color={colors.chrome} />
        </RoundedBox>
      </group>
      {/* 함정 탭: 앞면 이벤트 페이지, 뒷면 숨은 송금 폼 */}
      <group ref={tab} position={[0.25, 0.1, 0]}>
        <mesh>
          <planeGeometry args={[3.3, 2.2]} />
          <meshBasicMaterial map={faces?.[0] ?? null} side={DoubleSide} toneMapped={false} />
        </mesh>
        <mesh rotation={[0, Math.PI, 0]} position={[0, 0, -0.01]}>
          <planeGeometry args={[3.3, 2.2]} />
          <meshBasicMaterial map={faces?.[1] ?? null} toneMapped={false} />
        </mesh>
      </group>
      {/* 쿠키 보관함(반투명 유리 병 + 크롬 뚜껑) */}
      <group position={[-2.05, -0.55, 0.2]}>
        <mesh>
          <cylinderGeometry args={[0.45, 0.45, 0.9, 40, 1, true]} />
          <meshPhysicalMaterial color="#ffffff" transparent opacity={0.18} roughness={0.02} clearcoat={1} iridescence={1} side={DoubleSide} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 0.12, 40]} />
          <Chrome color={colors.chrome} />
        </mesh>
      </group>
      <group ref={cookie} scale={0.42}>
        <mesh>
          <cylinderGeometry args={[0.6, 0.6, 0.16, 40]} />
          <Chrome color={colors.chrome} />
        </mesh>
        {[[0.2, 0.25], [-0.25, 0.1], [0.05, -0.3]].map(([x, z], i) => (
          <mesh key={i} position={[x!, 0.1, z!]}>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshPhysicalMaterial color={colors.gold} metalness={1} roughness={0.2} />
          </mesh>
        ))}
      </group>
      {/* 크롬 봉투 */}
      <group ref={envelope} position={[1.2, -0.9, 0.7]}>
        <RoundedBox args={[1.6, 1.04, 0.14]} radius={0.06} smoothness={5}>
          <Chrome color={colors.chrome} />
        </RoundedBox>
      </group>
    </>
  );
}

export default function CsrfFlipCanvas({ section, ...props }: Props) {
  const [q, setQ] = useState(quality);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)));
    io.observe(el);
    return () => io.disconnect();
  }, [section]);
  return (
    <Canvas
      dpr={q === "high" ? [1, 1.25] : 1}
      frameloop={visible ? "always" : "never"}
      camera={{ fov: 35, position: [0, 0, 6.4], near: 0.1, far: 60 }}
      gl={{ antialias: q === "high", alpha: false, powerPreference: "high-performance" }}
    >
      <PerformanceMonitor bounds={() => [45, 60]} flipflops={1} onDecline={() => setQ("low")} onFallback={() => setQ("low")} />
      <Scene {...props} quality={q} />
    </Canvas>
  );
}
