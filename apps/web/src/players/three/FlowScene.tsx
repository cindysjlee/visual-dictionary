// 흐름형 3D 무대. 상세 페이지에서만 동적 import된다(Player.tsx). 장면은 JSON을 읽어 만들고, 엔진 상태(step·defense)를 그리기만 한다
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Raycaster, Spherical, Vector3, type Material, type Mesh, type PerspectiveCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { blockTarget } from "@app/content-schema/scene";
import { holdMs, type StageProps } from "../stage.ts";
import { CameraRig, buildStep, sideStamp } from "./director.ts";
import { LabelLayer } from "./labels.ts";
import { layoutScene } from "./layout.ts";
import { SceneModel } from "./model.ts";
import { sceneStateAt, type SceneState } from "./sceneState.ts";
import { Timeline } from "./timeline.ts";
import { usePalette } from "./tokens.ts";

type RootProps = StageProps & { labelRoot: RefObject<HTMLDivElement | null>; shadowSize: number; visible: boolean };

function SceneRoot({ term, state, view, reducedMotion, freeView, onStepDone, stageRef, labelRoot, shadowSize, visible }: RootProps) {
  const { scene, camera, size, setFrameloop, invalidate } = useThree();
  const palette = usePalette();
  const layout = useMemo(() => layoutScene(term.scenario.actors), [term]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 색은 아래 effect에서 바꾼다(모델을 다시 만들지 않음)
  const model = useMemo(() => new SceneModel(term, layout, palette), [term, layout]);
  const rig = useMemo(() => new CameraRig(), []);
  const labels = useRef<LabelLayer | null>(null);
  const timeline = useRef<Timeline | null>(null);
  const timelineDone = useRef(false);
  const playing = useRef(state.playing);
  const jump = useRef(true);
  const idle = useRef(0);
  const controls = useRef<OrbitControlsImpl>(null);
  const ray = useMemo(() => new Raycaster(), []);

  const wake = () => {
    idle.current = 0;
    if (visible) setFrameloop("always");
  };

  useEffect(() => {
    scene.add(model.root);
    labels.current = new LabelLayer(labelRoot.current!);
    return () => {
      scene.remove(model.root);
      model.dispose();
      labels.current?.dispose();
    };
  }, [model, scene, labelRoot]);

  /** 이름·잔액 라벨. 숨은 행위자의 라벨은 감춘다 */
  /** overview: 시작 전 전체 샷. 맨 위 행위자 이름만 보이고, 안에 든 것(탭·보관함)과 잔액은 재생하면 나타난다(라벨 겹침 방지) */
  const refreshLabels = (s: SceneState, overview = false) => {
    const l = labels.current!;
    for (const [id, node] of model.nodes) {
      const a = node.actor;
      l.set(`actor-${id}`, node.labelPoint, { title: a.name, sub: a.site, tone: a.tone === "attack" ? "attack" : "plain" }, !s.hidden.has(id) && !(overview && node.placed.parent));
      const balance = s.balances.get(id);
      if (balance !== undefined && overview) l.show(`bal-${id}`, false);
      else if (balance !== undefined) {
        const changed = balance !== a.balance;
        l.set(`bal-${id}`, node.labelPoint.clone().add(new Vector3(-1.6, -0.5, 0)), {
          title: `잔액 ${balance.toLocaleString("ko-KR")}원`,
          tone: changed ? "attack" : "plain",
        });
      }
      const gained = s.gained.get(id);
      l.set(`gain-${id}`, node.labelPoint.clone().add(new Vector3(0, 0.6, 0)), { title: `+${(gained ?? 0).toLocaleString("ko-KR")}원`, tone: "attack" }, gained !== undefined);
    }
    for (const id of ["packet", "note", "checks"]) l.show(id, false);
  };

  // 단계·모드가 바뀌면: 진행 중인 연출을 버리고 직전 단계까지의 결과를 바로 적용한 뒤 이 단계만 재생한다 (docs/06 4절)
  useEffect(() => {
    const done = () => {
      timelineDone.current = true;
      if (playing.current) onStepDone();
    };
    timelineDone.current = false;
    const before = sceneStateAt(term, state.defense, state.step);
    model.applyState(before);
    refreshLabels(before);
    labels.current!.declutter = false;

    if (!state.started) {
      // 상세 진입 직후: 1단계 장면 전체를 보여 주고 멈춘다. 재생을 누르면 이 effect가 다시 돌아 1단계부터 연출한다
      refreshLabels(before, true);
      labels.current!.declutter = true;
      timeline.current = null;
      rig.setAspect(size.width / Math.max(1, size.height)); // useFrame보다 먼저 돌므로 화면 비율을 여기서 넣는다(휴대폰에서 잘리지 않게)
      rig.frame([...layout.values()].filter((p) => !p.parent).map((p) => new Vector3(...p.anchor)));
      jump.current = true;
      wake();
      return;
    }

    if (reducedMotion) {
      // 동작 줄이기: 날아가기·카메라 이동 없이 이 단계의 결과 상태로 바로
      const after = sceneStateAt(term, state.defense, state.step + 1);
      model.applyState(after);
      refreshLabels(after);
      const inspect = view.effects.find((e) => e.type === "inspect");
      // 카메라는 결과가 보이는 곳: 검사한 곳 → 마지막 효과의 대상 → 목적지
      const lastTarget = [...view.effects].reverse().map((e) => ("target" in e ? e.target : "into" in e ? e.into : undefined)).find(Boolean);
      const focusId = view.blocked ? blockTarget(view) : inspect && inspect.type === "inspect" ? inspect.at : (lastTarget ?? view.to);
      const placed = layout.get(focusId)!;
      if (view.blocked) {
        // 검문소면 그 앞, 아니면 대상 옆 (director와 같은 위치)
        const at = placed.gate && inspect ? new Vector3(...placed.gate.mid).add(new Vector3(0, 1.4, 0.4)) : sideStamp(new Vector3(...placed.anchor)).at;
        model.setGateTone(focusId, "defense");
        model.showStamp(view.blockedLabel ?? "차단", at);
        model.stamp.scale.set(1, 1, 1);
        if (inspect?.type === "inspect") {
          labels.current!.set("checks", new Vector3(...(placed.gate?.position ?? placed.anchor)).add(new Vector3(-2.2, 2.6, 0)), {
            title: "검문소 검사",
            rows: inspect.checks,
          });
        }
      }
      rig.shot(view.blocked && !(placed.gate && inspect) ? sideStamp(new Vector3(...placed.anchor)).focus : new Vector3(...(placed.gate?.mid ?? placed.anchor)), "mid");
      jump.current = true;
      timeline.current = new Timeline().wait(holdMs(view, false)).call(done);
    } else {
      timeline.current = buildStep({
        term,
        view,
        layout,
        model,
        labels: labels.current!,
        rig,
        hold: holdMs(view, true),
        onDone: done,
        onBalance: () => refreshLabels(sceneStateAt(term, state.defense, state.step + 1)),
      });
    }
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- view는 term·defense·step에서 나온다
  }, [model, term, state.defense, state.step, state.started, reducedMotion]);

  // 연출이 끝난 뒤 재생을 누르면 바로 다음 단계로
  useEffect(() => {
    playing.current = state.playing;
    if (state.playing && timelineDone.current) onStepDone();
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.playing]);

  // 테마가 바뀌면 재질 색과 화면 글자를 다시 칠한다
  useEffect(() => {
    model.setPalette(palette, sceneStateAt(term, state.defense, state.step + (timelineDone.current ? 1 : 0)));
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette]);

  // 자유 시점: 지금 보던 곳을 중심으로 돌린다. 무대에 포커스가 있으면 화살표로도 돌릴 수 있다
  useEffect(() => {
    wake();
    if (!freeView) {
      jump.current = false;
      return;
    }
    const c = controls.current;
    if (c) {
      c.target.copy(rig.target);
      c.update();
    }
    const el = stageRef.current;
    const onKey = (e: KeyboardEvent) => {
      const ctl = controls.current;
      if (!ctl || e.target !== el || !e.key.startsWith("Arrow")) return;
      const offset = camera.position.clone().sub(ctl.target);
      const s = new Spherical().setFromVector3(offset);
      if (e.key === "ArrowLeft") s.theta -= 0.2;
      if (e.key === "ArrowRight") s.theta += 0.2;
      if (e.key === "ArrowUp") s.phi = Math.max(0.25, s.phi - 0.12);
      if (e.key === "ArrowDown") s.phi = Math.min(1.35, s.phi + 0.12);
      camera.position.copy(ctl.target).add(new Vector3().setFromSpherical(s));
      ctl.update();
      invalidate();
      e.preventDefault();
    };
    el?.addEventListener("keydown", onKey);
    return () => el?.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freeView]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const tl = timeline.current;
    const running = Boolean(tl && !tl.finished);
    tl?.advance(dt * 1000);

    rig.setAspect(size.width / Math.max(1, size.height));
    let settled = true;
    if (!freeView) settled = rig.apply(camera as PerspectiveCamera, dt, jump.current);
    jump.current = false;

    for (const b of model.billboards) {
      if (!b.visible) continue;
      b.quaternion.copy(camera.quaternion);
      if (b.userData.roll) b.rotateZ(b.userData.roll as number);
    }

    // 가림 자동 투명: 카메라 → (초점, 봉투)를 막는 물체만 서서히 흐리게, 안 막으면 원래대로
    const hit = new Set<object>();
    const goals = [rig.target, ...(model.envelope.visible ? [model.envelope.position] : [])];
    for (const goal of goals) {
      const dir = goal.clone().sub(camera.position);
      ray.set(camera.position, dir.clone().normalize());
      ray.far = dir.length() - 0.3;
      for (const h of ray.intersectObjects(model.occluders, false)) hit.add(h.object);
    }
    const k = 1 - Math.exp(-dt * 6);
    for (const m of model.occluders as Mesh[]) {
      const mat = m.material as Material & { opacity: number };
      const base = (m.userData.baseOpacity ??= mat.opacity) as number;
      mat.opacity += ((hit.has(m) ? 0.1 : base) - mat.opacity) * k;
      mat.transparent = true;
      mat.depthWrite = mat.opacity > 0.9;
    }

    labels.current?.update(camera, size.width, size.height);

    // 움직임이 없으면 필요할 때만 그린다
    if (!running && settled && !freeView && hit.size === 0) {
      idle.current += dt;
      if (idle.current > 0.8 && visible) setFrameloop("demand");
    } else idle.current = 0;
  });

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
      {freeView && <OrbitControls ref={controls} makeDefault enableDamping maxPolarAngle={1.35} minDistance={4} maxDistance={30} />}
    </>
  );
}

export default function FlowScene(props: StageProps) {
  const labelRoot = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [mobile] = useState(() => matchMedia("(max-width: 639px)").matches);

  // 화면 밖이거나 탭이 숨겨지면 그리기를 멈춘다
  useEffect(() => {
    const el = props.stageRef.current;
    const io = el ? new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting))) : undefined;
    if (el) io?.observe(el);
    const onVis = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [props.stageRef]);
  const visible = onScreen && pageVisible;

  return (
    <div className="scene3d">
      <div className="scene-canvas" aria-hidden="true">
        <Canvas
          dpr={[1, 2]}
          shadows="percentage"
          frameloop={visible ? "always" : "never"}
          camera={{ fov: 40, position: [0, 9.5, 15.5], near: 0.1, far: 120 }}
          gl={{ antialias: true, alpha: true }}
        >
          <SceneRoot {...props} labelRoot={labelRoot} shadowSize={mobile ? 1024 : 1536} visible={visible} />
        </Canvas>
      </div>
      <div ref={labelRoot} className="scene-labels" aria-hidden="true" />
      {props.freeView && <p className="scene-hint">드래그해서 돌리고, 휠로 확대해 보세요. 무대에 포커스가 있으면 화살표로도 돌릴 수 있어요.</p>}
    </div>
  );
}
