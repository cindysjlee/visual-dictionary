// 랜딩 3D 장면(R3F): Y2K 크롬 물체(봉투·자물쇠·쿠키·방패)와 리퀴드 글래스 브라우저, 검문소.
// 스크롤 진행도(0~1)와 [방어 켜기] 스위치가 봉투의 길을 정한다: 브라우저를 지나 검문소에서 막히거나(방어) 그대로 통과(공격).
// 반사 환경맵은 three의 RoomEnvironment(외부 HDR을 받지 않아 CSP와 무관). 색은 tokens.css에서 읽는다
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MeshTransmissionMaterial, RoundedBox } from "@react-three/drei";
import { BoxGeometry, CanvasTexture, Color, ExtrudeGeometry, MathUtils, Mesh, MeshBasicMaterial, PMREMGenerator, SRGBColorSpace, Shape, type Group, type Texture } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type Hero = "a" | "b";
export type Quality = "high" | "low";
export type SceneProps = {
  hero: Hero;
  /** 0~1. 고정 구간 스크롤 진행도(motion useScroll 값). 정지 이미지 모드에서는 늘 0 */
  progress: { get(): number };
  defense: boolean;
  quality: Quality;
  /** 정지 이미지(포스터)를 찍는 모드: 시간·마우스를 멈춘다 */
  still?: boolean;
  onFirstFrame?: () => void;
};

type Pose = [number, number, number];
const GATE_X = 4.2;
const smooth = (a: number, b: number, v: number) => MathUtils.smoothstep(v, a, b);
const mix = (from: Pose, to: Pose, a: number): Pose => [MathUtils.lerp(from[0], to[0], a), MathUtils.lerp(from[1], to[1], a), MathUtils.lerp(from[2], to[2], a)];
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const token = (name: string, fallback: string) => {
  const v = css(name);
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
};

/** 장면 바탕: 페이지 배경 빛(--bg, --blob-1~4)과 같은 그라데이션. 유리가 이 색을 굴절해 보인다(캔버스가 투명이면 유리가 검게 보인다) */
function backdropTexture(): Texture {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 400;
  const g = c.getContext("2d")!;
  g.fillStyle = css("--bg") || "#e8ebf4";
  g.fillRect(0, 0, c.width, c.height);
  const blobs: [string, number, number, number][] = [
    ["--blob-1", 0.12, 0.1, 0.42],
    ["--blob-2", 0.88, 0.35, 0.46],
    ["--blob-3", 0.5, 0.95, 0.4],
    ["--blob-4", 0.05, 0.95, 0.34],
  ];
  for (const [name, x, y, r] of blobs) {
    const grad = g.createRadialGradient(x * c.width, y * c.height, 0, x * c.width, y * c.height, r * c.width);
    grad.addColorStop(0, css(name) || "transparent");
    grad.addColorStop(1, "transparent");
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** 히어로 구성: A는 크롬 물체 중심, B는 큰 유리 브라우저 중심(물체가 그 뒤에서 굴절돼 보임) */
const HERO: Record<Hero, { envelope: Pose; browser: Pose; browserScale: number; lock: Pose; cookie: Pose; shield: Pose }> = {
  a: { envelope: [1.7, 0.2, 1.3], browser: [3.3, -0.5, -2.4], browserScale: 0.72, lock: [0.3, 1.35, 0.2], cookie: [2.9, -1.35, 0.7], shield: [3.4, 1.35, -0.6] },
  b: { envelope: [-0.6, 0.45, -1.1], browser: [0, 0.6, 0.9], browserScale: 1.2, lock: [1.2, 1.25, -1.8], cookie: [-1.4, -0.05, -1.5], shield: [0.8, -0.15, -1.4] },
};

/** 반사 환경: three의 RoomEnvironment에 홀로그램 색 발광판(분홍·하늘·주황)을 더해 크롬에 Y2K 색이 비치게 한다 */
function ChromeEnvironment({ panels }: { panels: string[] }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const spots: [number, number, number][] = [
      [-8, 4, 2],
      [8, 2, -3],
      [0, -6, 6],
    ];
    panels.forEach((c, i) => {
      const panel = new Mesh(new BoxGeometry(7, 7, 0.2), new MeshBasicMaterial({ color: new Color(c).multiplyScalar(6) }));
      panel.position.set(...spots[i % spots.length]!);
      panel.lookAt(0, 0, 0);
      room.add(panel);
    });
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, panels]);
  return null;
}

/** 크롬: 거울 금속 + 무지개빛 간섭막(Y2K 홀로그램 크롬) */
function Chrome({ color }: { color: string }) {
  return (
    <meshPhysicalMaterial
      color={color}
      metalness={1}
      roughness={0.07}
      clearcoat={1}
      clearcoatRoughness={0.04}
      iridescence={0.75}
      iridescenceIOR={1.4}
      iridescenceThicknessRange={[140, 560]}
      envMapIntensity={1.9}
    />
  );
}

/** 리퀴드 글래스: 저사양·휴대폰(low)은 샘플 수와 버퍼 해상도를 낮춘다. 굴절 버퍼 바탕은 장면 바탕 그라데이션 */
function Glass({ quality, thick, backdrop }: { quality: Quality; thick: number; backdrop: Texture }) {
  const high = quality === "high";
  return (
    <MeshTransmissionMaterial
      background={backdrop}
      samples={high ? 4 : 2}
      resolution={high ? 384 : 160}
      thickness={thick}
      roughness={0.04}
      ior={1.35}
      chromaticAberration={high ? 0.35 : 0.18}
      anisotropicBlur={0.25}
      distortion={high ? 0.3 : 0}
      distortionScale={0.4}
      temporalDistortion={high ? 0.05 : 0}
      clearcoat={1}
      transmission={1}
    />
  );
}

function useShapes() {
  return useMemo(() => {
    const flap = new Shape();
    flap.moveTo(-0.78, 0.5);
    flap.lineTo(0.78, 0.5);
    flap.lineTo(0, -0.1);
    flap.closePath();
    const shield = new Shape();
    shield.moveTo(0, 0.82);
    shield.quadraticCurveTo(0.42, 0.62, 0.72, 0.66);
    shield.quadraticCurveTo(0.74, -0.2, 0, -0.86);
    shield.quadraticCurveTo(-0.74, -0.2, -0.72, 0.66);
    shield.quadraticCurveTo(-0.42, 0.62, 0, 0.82);
    return {
      flap: new ExtrudeGeometry(flap, { depth: 0.02, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 3 }),
      shield: new ExtrudeGeometry(shield, { depth: 0.14, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 4 }),
    };
  }, []);
}

export default function LandingScene({ hero, progress, defense, quality, still, onFirstFrame }: SceneProps) {
  const { flap, shield } = useShapes();
  const colors = useMemo(
    () => ({
      chrome: token("--landing-chrome", "#dfe5f2"),
      gold: token("--scene-gold", "#d99a1e"),
      attack: token("--attack", "#d9480f"),
      defense: token("--defense", "#1864ab"),
      pink: token("--landing-holo-pink", "#ff8fcf"),
      sky: token("--landing-holo-sky", "#8fd0ff"),
    }),
    [],
  );
  const backdrop = useMemo(backdropTexture, []);
  const panels = useMemo(() => [colors.pink, colors.sky, colors.attack], [colors]);
  const gate = useRef<Group>(null);
  const root = useRef<Group>(null);
  const envelope = useRef<Group>(null);
  const browser = useRef<Group>(null);
  const lock = useRef<Group>(null);
  const cookie = useRef<Group>(null);
  const shieldRef = useRef<Group>(null);
  const first = useRef(false);

  useFrame((state, delta) => {
    const p = still ? 0 : progress.get();
    const t = still ? 0 : state.clock.elapsedTime;
    const h = HERO[hero];
    const k = smooth(0.04, 0.22, p); // 히어로 구성 → 이야기

    // 봉투: 왼쪽에서 출발 → 브라우저 통과 → 검문소. 방어면 검문소 앞에서 튕기며 멈추고, 아니면 지나간다
    const stop = GATE_X - 0.95;
    const travel =
      p < 0.5
        ? MathUtils.lerp(-4.4, 0, smooth(0.18, 0.5, p))
        : p < 0.82
          ? MathUtils.lerp(0, stop, smooth(0.5, 0.82, p))
          : defense
            ? stop - Math.sin(smooth(0.82, 0.9, p) * Math.PI) * 0.25
            : MathUtils.lerp(stop, GATE_X + 4, smooth(0.84, 1, p));
    const env = mix(h.envelope, [travel, 0, 0], k);
    envelope.current?.position.set(env[0], env[1] + Math.sin(t * 1.3) * 0.06 * (1 - k * 0.6), env[2]);
    envelope.current?.rotation.set(Math.sin(t * 0.7) * 0.12 * (1 - k), (1 - k) * (0.5 + Math.sin(t * 0.5) * 0.2), (1 - k) * -0.18);

    // 유리 브라우저: 이야기에서는 가운데(봉투가 그 안을 지나간다)
    const b = mix(h.browser, [0, 0, 0], k);
    browser.current?.position.set(b[0], b[1], b[2]);
    browser.current?.scale.setScalar(MathUtils.lerp(h.browserScale, 1, k));
    browser.current?.rotation.set(0, (1 - k) * (hero === "a" ? -0.45 : 0.08) + Math.sin(t * 0.4) * 0.03, 0);

    // 쿠키: 이야기에서는 봉투에 붙어 함께 간다(CSRF: 브라우저가 쿠키를 자동으로 붙인다)
    const c = mix(h.cookie, [env[0] + 0.75, env[1] + 0.55, env[2] + 0.12], smooth(0.12, 0.3, p));
    cookie.current?.position.set(c[0], c[1] + Math.sin(t * 1.7 + 1) * 0.05, c[2]);
    cookie.current?.rotation.set(Math.PI / 2 + Math.sin(t) * 0.2, t * 0.6, 0);

    // 자물쇠: 검문소 위 막대로
    const lockIn = smooth(0.3, 0.6, p);
    const l = mix(h.lock, [GATE_X, 1.65, -0.1], lockIn);
    lock.current?.position.set(l[0], l[1] + Math.sin(t * 1.1 + 2) * 0.05, l[2]);
    lock.current?.rotation.set(0, (1 - lockIn) * t * 0.5, 0);

    // 유리 방패: 방어가 켜져 있으면 검문소 가운데로 솟아오른다
    const up = defense ? smooth(0.62, 0.8, p) : 0;
    const sh = mix(mix(h.shield, [GATE_X, -2.8, 0.2], smooth(0.2, 0.4, p)), [GATE_X, 0, 0.25], up);
    shieldRef.current?.position.set(sh[0], sh[1] + Math.sin(t * 1.2 + 3) * 0.04, sh[2]);
    shieldRef.current?.rotation.set(0, (1 - k) * Math.sin(t * 0.6) * 0.5, 0);

    // 검문소: 히어로에서는 숨어 있다가 이야기에 들어서면 솟아오른다
    const rise = smooth(0.22, 0.45, p);
    gate.current?.position.set(GATE_X, MathUtils.lerp(-4.5, 0, rise), 0);
    gate.current?.scale.setScalar(Math.max(0.001, rise));

    // 카메라: 이야기에서는 앞으로 들어가며 봉투를 따라간다 + 마우스에 살짝
    const cam = state.camera;
    const follow = MathUtils.clamp(travel, -2.5, GATE_X - 0.6);
    const px = still ? 0 : state.pointer.x;
    const py = still ? 0 : state.pointer.y;
    const damp = (from: number, to: number) => (still ? to : MathUtils.damp(from, to, 4, delta));
    cam.position.x = damp(cam.position.x, MathUtils.lerp(0, follow * 0.6, k) + px * 0.35);
    cam.position.y = damp(cam.position.y, MathUtils.lerp(0, 0.4, k) + py * 0.25);
    cam.position.z = damp(cam.position.z, MathUtils.lerp(9, 7.8, k));
    cam.lookAt(MathUtils.lerp(0, follow * 0.65, k), 0, 0);
    if (root.current) root.current.rotation.y = damp(root.current.rotation.y, px * 0.08);

    if (!first.current) {
      first.current = true;
      onFirstFrame?.();
    }
  });

  return (
    <>
      <primitive attach="background" object={backdrop} />
      <ChromeEnvironment panels={panels} />
      <ambientLight intensity={0.35} />
      <pointLight position={[-6, 3, 5]} intensity={60} color={colors.attack} />
      <pointLight position={[6, -2, 5]} intensity={60} color={colors.defense} />
      <pointLight position={[0, 5, 3]} intensity={40} color={colors.pink} />

      <group ref={root}>
        {/* 유리가 굴절해 보일 색 방울(홀로그램 분홍·하늘·공격 주황) */}
        {(
          [
            [[1.0, 0.9, -3.6], 1.1, colors.pink],
            [[3.2, -0.9, -3.4], 0.9, colors.sky],
            [[GATE_X + 0.6, 1.9, -4.6], 0.6, colors.attack],
          ] as const
        ).map(([pos, r, c], i) => (
          <mesh key={i} position={pos}>
            <sphereGeometry args={[r, 48, 48]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.35} roughness={0.25} />
          </mesh>
        ))}

        {/* 유리 브라우저 창: 크롬 탭 막대와 점 세 개 */}
        <group ref={browser}>
          <RoundedBox args={[3.4, 2.3, 0.26]} radius={0.14} smoothness={6}>
            <Glass quality={quality} thick={0.6} backdrop={backdrop} />
          </RoundedBox>
          <RoundedBox args={[3.28, 0.22, 0.06]} radius={0.05} position={[0, 0.98, 0.16]}>
            <Chrome color={colors.chrome} />
          </RoundedBox>
          {[colors.attack, colors.chrome, colors.defense].map((c, i) => (
            <mesh key={i} position={[-1.45 + i * 0.2, 0.98, 0.21]}>
              <sphereGeometry args={[0.055, 20, 20]} />
              <meshPhysicalMaterial color={c} roughness={0.15} clearcoat={1} />
            </mesh>
          ))}
        </group>

        {/* 크롬 봉투 */}
        <group ref={envelope}>
          <RoundedBox args={[1.6, 1.04, 0.14]} radius={0.06} smoothness={5}>
            <Chrome color={colors.chrome} />
          </RoundedBox>
          <mesh geometry={flap} position={[0, 0, 0.07]}>
            <Chrome color={colors.chrome} />
          </mesh>
        </group>

        {/* 크롬 쿠키(금빛 칩) */}
        <group ref={cookie} scale={0.62}>
          <mesh>
            <cylinderGeometry args={[0.6, 0.6, 0.16, 48]} />
            <Chrome color={colors.chrome} />
          </mesh>
          {(
            [
              [0.2, 0.25],
              [-0.25, 0.1],
              [0.05, -0.3],
              [-0.15, -0.18],
              [0.32, -0.08],
            ] as const
          ).map(([x, z], i) => (
            <mesh key={i} position={[x, 0.1, z]}>
              <sphereGeometry args={[0.07, 16, 16]} />
              <meshPhysicalMaterial color={colors.gold} metalness={1} roughness={0.2} />
            </mesh>
          ))}
        </group>

        {/* 크롬 자물쇠 */}
        <group ref={lock} scale={0.7}>
          <RoundedBox args={[1, 0.8, 0.42]} radius={0.12} smoothness={5}>
            <Chrome color={colors.chrome} />
          </RoundedBox>
          <mesh position={[0, 0.4, 0]}>
            <torusGeometry args={[0.32, 0.08, 20, 40, Math.PI]} />
            <Chrome color={colors.chrome} />
          </mesh>
        </group>

        {/* 검문소: 크롬 기둥 둘과 위 막대 */}
        <group ref={gate} position={[GATE_X, -4, 0]}>
          {[-0.95, 0.95].map((x) => (
            <mesh key={x} position={[x, 0, -0.1]}>
              <cylinderGeometry args={[0.12, 0.12, 2.6, 32]} />
              <Chrome color={colors.chrome} />
            </mesh>
          ))}
          <RoundedBox args={[2.2, 0.18, 0.3]} radius={0.06} position={[0, 1.3, -0.1]}>
            <Chrome color={colors.chrome} />
          </RoundedBox>
        </group>

        {/* 유리 방패 */}
        <group ref={shieldRef}>
          <mesh geometry={shield} position={[0, 0, -0.07]}>
            {/* 방패는 굴절 패스 없이 반투명 무지개빛 유리(굴절 유리는 큰 브라우저 하나만: 노트북 60fps 목표) */}
            <meshPhysicalMaterial color={colors.chrome} transparent opacity={0.42} roughness={0.05} metalness={0.2} clearcoat={1} iridescence={1} iridescenceIOR={1.5} envMapIntensity={2} />
          </mesh>
        </group>
      </group>
    </>
  );
}
