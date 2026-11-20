// 흐름형 3D 무대. 상세 페이지에서만 동적 import된다(Player.tsx). 장면은 JSON을 읽어 만들고, 엔진 상태(step·defense)를 그리기만 한다
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Vector3, type PerspectiveCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { blockTarget } from "@app/content-schema/scene";
import { holdMs, type StageProps } from "../stage.ts";
import { billboardRect, faceCamera } from "./billboard.ts";
import { CameraRig } from "./camera.ts";
import { buildStep, involvedActors, sideStamp } from "./director.ts";
import { useFreeView } from "./freeView.ts";
import { LabelLayer, screenLabel } from "./labels.ts";
import { layoutScene } from "./layout.ts";
import { SceneModel } from "./model.ts";
import { Occlusion } from "./occlusion.ts";
import { SceneCanvas, SceneLights, type SceneFrame } from "./SceneCanvas.tsx";
import { sceneStateAt, type SceneState } from "./sceneState.ts";
import { Timeline } from "./timeline.ts";
import { exposeProbe, traceSpeed, tracerFor, type Tracer } from "./trace.ts";
import { usePalette } from "./tokens.ts";

type RootProps = StageProps & SceneFrame;

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
  const speed = useRef(state.speed);
  const traceRef = useRef<Tracer>(() => {});
  const ringsOn = useRef(new Set<string>());
  /** 이 단계 봉투의 경로(출발·경유·목적지). 전파 고리는 경로에 있는 길목만 퍼진다 */
  const route = useRef<(string | undefined)[]>([]);
  speed.current = state.speed; // 재생 속도: 타임라인(연출 + 대기)을 같은 배수로 돌린다. 동작 줄이기는 타임라인이 대기뿐이라 대기에만 걸린다
  const jump = useRef(true);
  const idle = useRef(0);
  const controls = useRef<OrbitControlsImpl>(null);
  const occlusion = useMemo(() => new Occlusion(), []);
  const involved = useRef<string[]>([]);
  /** 가림 검사 시선의 목표: 등장 행위자마다 보이는 상자의 가운데와 윗면 가운데(앵커만 보면 높은 카메라에서 윗부분 가림을 놓친다) */
  const sightPoints = useRef<Vector3[]>([]);
  const aimAt = (ids: string[]) => {
    sightPoints.current = ids.flatMap((id) => {
      const box = model.visibleBox(id);
      if (box.isEmpty()) return [];
      const c = box.getCenter(new Vector3());
      return [c, c.clone().setY(box.max.y - 0.1)];
    });
  };
  const framePoints = (ids: string[]) => ids.flatMap((id) => model.framePoints(id));

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
  /** rewritten: 이 단계에서 바뀐 화면판(동작 줄이기에서 결과를 바로 보일 때). mirrorScreen이 아니면 그 판 라벨만 이 단계 동안 보인다. null이면 화면 라벨을 그대로 둔다(단계 중간 잔액 갱신) */
  const refreshLabels = (s: SceneState, overview = false, rewritten: string[] | null = []) => {
    const l = labels.current!;
    for (const [id, node] of model.nodes) {
      const a = node.actor;
      if (node.panel && rewritten) {
        const screens = s.screens.get(id);
        const screen = s.flipped.has(id) ? screens?.back : screens?.front;
        const on = (a.mirrorScreen || rewritten.includes(id)) && !s.hidden.has(id);
        l.set(`screen-${id}`, model.screenLabelPoint(id), screenLabel(screen, a.tone === "attack"), on);
      }
      l.set(`actor-${id}`, node.labelPoint, { title: a.name, sub: a.site, tone: a.tone === "attack" ? "attack" : "plain" }, !s.hidden.has(id) && !(overview && node.placed.parent));
      const balance = s.balances.get(id);
      if (balance !== undefined && overview) l.show(`bal-${id}`, false);
      else if (balance !== undefined) {
        const changed = balance !== a.balance;
        l.set(`bal-${id}`, node.labelPoint.clone().add(new Vector3(-2.4, -1.2, 0)), {
          title: `잔액 ${balance.toLocaleString("ko-KR")}원`,
          tone: changed ? "attack" : "plain",
        });
      }
      // 칸 선반 라벨: "SYN-RECEIVED 대기열 6/6". 가득 차면 공격색
      if (a.slots) {
        const n = s.occupied.get(id) ?? 0;
        l.set(`slots-${id}`, model.shelfLabelPoint(id), { title: `${a.slots.label} ${n}/${a.slots.size}`, tone: n >= a.slots.size ? "attack" : "plain" }, !overview && !s.hidden.has(id));
      }
      const gained = s.gained.get(id);
      l.set(`gain-${id}`, node.labelPoint.clone().add(new Vector3(0, 0.6, 0)), { title: `+${(gained ?? 0).toLocaleString("ko-KR")}원`, tone: "attack" }, gained !== undefined);
    }
    for (const id of ["packet", "note", "checks"]) l.show(id, false);
  };

  // 단계·모드가 바뀌면: 진행 중인 연출을 버리고 직전 단계까지의 결과를 바로 적용한 뒤 이 단계만 재생한다 (docs/06 4절)
  useEffect(() => {
    // 퍼지던 고리는 이전 단계 기록으로 닫는다(다음 단계 기록에 섞이지 않게)
    for (const id of ringsOn.current) traceRef.current("ringsEnd", { actor: id });
    ringsOn.current.clear();
    const trace = tracerFor(state.step, state.defense);
    traceRef.current = trace;
    route.current = view.from === view.to ? [] : [view.from, view.via, view.to];
    const done = () => {
      timelineDone.current = true;
      if (playing.current) onStepDone();
    };
    timelineDone.current = false;
    involved.current = involvedActors(view);
    const before = sceneStateAt(term, state.defense, state.step);
    model.applyState(before);
    aimAt(involved.current);
    refreshLabels(before);
    labels.current!.declutter = false;

    if (!state.started) {
      // 상세 진입 직후: 1단계 장면 전체를 보여 주고 멈춘다. 재생을 누르면 이 effect가 다시 돌아 1단계부터 연출한다
      refreshLabels(before, true);
      labels.current!.declutter = true;
      timeline.current = null;
      rig.setAspect(size.width / Math.max(1, size.height)); // useFrame보다 먼저 돌므로 화면 비율을 여기서 넣는다(휴대폰에서 잘리지 않게)
      model.applyState(before); // 상자 계산 전에 숨은 행위자를 반영
      involved.current = [];
      aimAt([]);
      rig.frame(framePoints([...layout.values()].filter((p) => !p.parent).map((p) => p.id)));
      jump.current = true;
      wake();
      return;
    }

    if (reducedMotion) {
      // 동작 줄이기: 날아가기·카메라 이동 없이 이 단계의 결과 상태로 바로
      const after = sceneStateAt(term, state.defense, state.step + 1);
      model.applyState(after);
      aimAt(involved.current);
      refreshLabels(after, false, view.effects.flatMap((e) => (e.type === "rewrite" ? [e.target] : [])));
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
      const stampPts = model.stamp.visible ? [model.stamp.position.clone().addScalar(1.9), model.stamp.position.clone().subScalar(1.9)] : [];
      rig.frame([...framePoints(involved.current), ...stampPts]);
      jump.current = true;
      trace("stepStart");
      if (view.blocked) trace("blocked", { actor: focusId });
      timeline.current = new Timeline()
        .wait(holdMs(view, false))
        .call(() => trace("stepEnd"))
        .call(done);
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
        onBalance: () => refreshLabels(sceneStateAt(term, state.defense, state.step + 1), false, null),
        onSlots: () => refreshLabels(sceneStateAt(term, state.defense, state.step + 1), false, null),
        screens: before.screens,
        trace,
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
  useFreeView({
    freeView,
    stageRef,
    controls,
    camera,
    target: rig.target,
    invalidate,
    onToggle: (on) => {
      wake();
      if (!on) jump.current = false;
    },
  });

  // 테스트 빌드 전용: 등장 행위자들이 화면에서 차지하는 사각형(겹침 검사, tests/e2e). 배포 빌드에서는 빠진다
  useEffect(
    () =>
      exposeProbe(() => ({
        settled: rig.settled(camera as PerspectiveCamera),
        width: size.width,
        height: size.height,
        rects: Object.fromEntries([...model.nodes.keys()].map((id) => [id, model.screenRect(id, camera, size.width, size.height)])),
        stamp: model.stamp.visible ? billboardRect(model.stamp, camera, size.width, size.height) : undefined,
        parents: Object.fromEntries(term.scenario.actors.map((a) => [a.id, a.parent])),
      })),
    [model, rig, camera, size, term],
  );

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1);
    const tl = timeline.current;
    const running = Boolean(tl && !tl.finished);
    tl?.advance(dt * 1000 * speed.current * traceSpeed());

    rig.setAspect(size.width / Math.max(1, size.height));
    let settled = true;
    if (!freeView) settled = rig.apply(camera as PerspectiveCamera, dt * traceSpeed(), jump.current); // 테스트 배속은 카메라에도(배포 빌드는 1)
    jump.current = false;

    // wifi 전파 고리: 봉투가 가까이 지날 때만 퍼진다. 동작 줄이기면 멈춰 있다
    for (const [id, node] of model.nodes) {
      if (!node.rings) continue;
      const near = route.current.includes(id) && model.envelope.visible && model.envelope.position.distanceTo(new Vector3(...layout.get(id)!.anchor)) < 3.2;
      const active = near && !reducedMotion;
      model.pulseRings(id, clock.elapsedTime, active);
      if (active !== ringsOn.current.has(id)) {
        if (active) ringsOn.current.add(id);
        else ringsOn.current.delete(id);
        traceRef.current(active ? "ringsStart" : "ringsEnd", { actor: id });
      }
    }

    faceCamera(model.billboards, camera);

    // 가림 자동 투명: 카메라 → (초점, 봉투, 이 단계의 등장 행위자)를 막는 물체만 흐리게. 등장 행위자 자신은 흐리지 않는다
    const goals = [rig.target, ...(model.envelope.visible ? [model.envelope.position] : []), ...sightPoints.current];
    const fading = occlusion.update(camera, model.occluders, goals, new Set(involved.current), dt);

    // 차단 도장·내용 카드는 늘 맨 위에 보여야 하므로 라벨이 그 자리를 피한다
    labels.current?.update(camera, size.width, size.height, [model.stamp, model.card].flatMap((m) => (m.visible ? [billboardRect(m, camera, size.width, size.height)] : [])));

    // 움직임이 없으면 필요할 때만 그린다
    if (!running && settled && !freeView && !fading) {
      idle.current += dt;
      if (idle.current > 0.8 && visible) setFrameloop("demand");
    } else idle.current = 0;
  });

  return (
    <>
      <SceneLights shadowSize={shadowSize} />
      {freeView && <OrbitControls ref={controls} makeDefault enableDamping maxPolarAngle={1.35} minDistance={4} maxDistance={30} />}
    </>
  );
}

export default function FlowScene(props: StageProps) {
  return <SceneCanvas stageRef={props.stageRef} freeView={props.freeView}>{(frame) => <SceneRoot {...props} {...frame} />}</SceneCanvas>;
}
