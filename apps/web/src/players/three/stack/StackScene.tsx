// 스택형 3D 무대(콜 스택). 상세 페이지에서만 동적 import된다(Player.tsx). 왼쪽 코드 판, 오른쪽 유리 기둥에 프레임이 쌓인다 (docs/06 "스택형")
// 프레임 앞면 = 호출식과 지역 변수, 옆 꼬리표 = 반환 주소(코드 판의 그 줄까지 실), pop하면 반환값 구슬이 아래 프레임 칸으로 날아간다
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  PlaneGeometry,
  QuadraticBezierCurve3,
  SphereGeometry,
  Vector3,
  type Material,
  type PerspectiveCamera,
} from "three";
import { outlineAll, paintOutlines, toon } from "../toon.ts";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Term } from "@app/content-schema";
import { holdMs, type StageProps } from "../../stage.ts";
import { CameraRig } from "../camera.ts";
import { useFreeView } from "../freeView.ts";
import { LabelLayer } from "../labels.ts";
import { SceneCanvas, SceneLights, type SceneFrame } from "../SceneCanvas.tsx";
import { billboardRect } from "../billboard.ts";
import { canvasPainter, paintCode, paintFrame, paintSign, paintStamp, screenPainter, signPainter, type Painter } from "../textures.ts";
import { Timeline, easeOut } from "../timeline.ts";
import { exposeProbe, traceSpeed, tracerFor } from "../trace.ts";
import { usePalette, type Palette } from "../tokens.ts";
import { stackStateAt, type StackState } from "./stackState.ts";

const FRAME = { w: 3.6, h: 1.15, d: 1.6, gap: 0.2 };
const STACK_X = 2.7;
const BOARD = { x: -3.7, w: 5.4, lineH: 0.52, pad: 0.95 };
/** 거의 정면(약 20° 위)에서 본다: 세로로 쌓이는 높이가 곧 호출 깊이라 위에서 내려다보면 겹친다 */
const VIEW = new Vector3(0, 0.36, 1);

type FrameNode = { group: Group; body: Mesh; plate: Painter; tag: Painter; string: Line; bodyMat: MeshToonMaterial };

class StackModel {
  readonly root = new Group();
  readonly board: Mesh;
  readonly ball: Mesh;
  readonly boardHeight: number;
  readonly stamp: Mesh;
  /** 스택 한도선(scenario.stackLimit이 있을 때). 넘으면 공격색으로 깜빡인다 */
  readonly limitLine?: Mesh;
  private limitMat?: MeshToonMaterial;
  private overMat: MeshToonMaterial;
  private stampPaint = screenPainter();
  private boardPaint: Painter;
  private frames = new Map<number, FrameNode>();
  private mats: { mat: MeshToonMaterial | LineBasicMaterial; key: keyof Palette; emissive?: number }[] = [];
  private term: Term;
  private palette: Palette;
  private state: StackState = { frames: [], overflowed: false };

  constructor(term: Term, palette: Palette) {
    this.term = term;
    this.palette = palette;
    // 해결 방법이 코드 판을 바꾸면(고친 코드) 가장 긴 코드에 판 높이를 맞춘다
    const longest = Math.max(term.scenario.code?.lines.length ?? 0, ...term.defenses.map((d) => d.code?.lines.length ?? 0));
    this.boardHeight = BOARD.pad + longest * BOARD.lineH + 0.4;
    this.boardPaint = canvasPainter(1024, Math.round((1024 * this.boardHeight) / BOARD.w));
    this.board = new Mesh(new PlaneGeometry(BOARD.w, this.boardHeight), new MeshBasicMaterial({ map: this.boardPaint.texture, transparent: true, toneMapped: false }));
    this.board.position.set(BOARD.x, 0.2 + this.boardHeight / 2, 0);
    this.root.add(this.board);
    // 받침과 유리 기둥(스택). 실제 메모리에서는 낮은 주소 쪽으로 자라지만 여기서는 위로 쌓는다(용어 설명)
    const base = new Mesh(new BoxGeometry(FRAME.w + 0.6, 0.16, FRAME.d + 0.6), this.std("objectDim"));
    base.position.set(STACK_X, 0.08, 0);
    this.root.add(base);
    // 기둥 높이 = 스택 메모리. 한도가 있으면 그 높이에 한도선을 긋고, 넘는 프레임은 기둥 밖으로 솟는다
    const limit = term.scenario.stackLimit;
    const glassH = limit ? this.limitY(limit) - 0.16 : 7.2;
    const glass = new Mesh(new BoxGeometry(FRAME.w + 0.3, glassH, FRAME.d + 0.3), this.std("paper", 0, 0.08));
    glass.position.set(STACK_X, 0.16 + glassH / 2, 0);
    this.root.add(glass);
    if (limit) {
      this.limitMat = this.std("attack", 0.5);
      this.limitLine = new Mesh(new BoxGeometry(FRAME.w + 0.9, 0.08, FRAME.d + 0.9), this.limitMat);
      this.limitLine.position.set(STACK_X, this.limitY(limit), 0);
      this.root.add(this.limitLine);
    }
    this.overMat = this.std("attack", 0.35);
    this.stamp = new Mesh(new PlaneGeometry(3.6, 1.65), new MeshBasicMaterial({ map: this.stampPaint.texture, transparent: true, depthTest: false, toneMapped: false }));
    this.stamp.renderOrder = 10;
    this.stamp.visible = false;
    this.root.add(this.stamp);
    this.ball = new Mesh(new SphereGeometry(0.24, 24, 16), this.std("gold", 0.6));
    this.ball.visible = false;
    this.root.add(this.ball);
  }

  private std(key: keyof Palette, emissive = 0, opacity?: number) {
    const mat = toon();
    if (opacity !== undefined) Object.assign(mat, { transparent: true, opacity, depthWrite: false });
    this.mats.push({ mat, key, emissive });
    this.paint(mat, key, emissive);
    return mat;
  }
  private paint(mat: MeshToonMaterial | LineBasicMaterial, key: keyof Palette, emissive = 0) {
    mat.color.set(this.palette[key]);
    if (mat instanceof MeshToonMaterial) mat.emissive = new Color(this.palette[key]).multiplyScalar(emissive);
  }

  frameY = (depth: number) => 0.16 + FRAME.h / 2 + depth * (FRAME.h + FRAME.gap);
  /** 한도선 높이: limit칸이 쌓인 바로 위 */
  limitY = (limit: number) => 0.16 + limit * (FRAME.h + FRAME.gap) - FRAME.gap / 2;
  /** 한도선 라벨 자리(기둥 오른쪽) */
  limitLabelPoint = () => new Vector3(STACK_X + FRAME.w / 2 + 1.3, this.limitY(this.term.scenario.stackLimit ?? 0), FRAME.d / 2);
  /** 한도선 깜빡임: on이면 밝게 */
  flashLimit(on: boolean) {
    if (this.limitMat) this.limitMat.emissive = new Color(this.palette.attack).multiplyScalar(on ? 1.4 : 0.5);
  }
  showStamp(label: string, tone: "attack" | "defense") {
    paintStamp(this.stampPaint, label, this.palette, tone);
    const top = Math.max(0, this.state.frames.length - 1);
    // 맨 위 프레임 바로 위(프레임 앞에 두면 한도를 넘은 프레임을 가린다)
    this.stamp.position.set(STACK_X, this.frameY(top) + FRAME.h / 2 + 1.0, FRAME.d / 2 + 0.6);
    this.stamp.visible = true;
  }
  /** 코드 판에서 그 줄의 높이(월드 y) */
  lineY = (line: number) => this.board.position.y + this.boardHeight / 2 - BOARD.pad - (line - 0.5) * BOARD.lineH;
  /** 프레임 앞면 판의 가운데(반환값 구슬이 닿는 곳) */
  platePoint = (depth: number) => new Vector3(STACK_X + 0.6, this.frameY(depth), FRAME.d / 2 + 0.3);
  frameGroup = (depth: number) => this.frames.get(depth)?.group;
  get depth() {
    return this.state.frames.length;
  }

  private fnName = (fn: string) => this.term.scenario.actors.find((a) => a.id === fn)?.name ?? fn;

  private makeFrame(depth: number): FrameNode {
    const group = new Group();
    const fnIndex = this.term.scenario.actors.findIndex((a) => a.id === this.state.frames[depth]?.fn);
    const bodyMat = this.std(fnIndex % 2 ? "object" : "objectDim");
    const body = new Mesh(new BoxGeometry(FRAME.w, FRAME.h, FRAME.d), bodyMat);
    body.castShadow = true;
    group.add(body);
    const plate = canvasPainter(1024, 300);
    const plateMesh = new Mesh(new PlaneGeometry(FRAME.w - 0.16, FRAME.h - 0.14), new MeshBasicMaterial({ map: plate.texture, transparent: true, toneMapped: false }));
    plateMesh.position.z = FRAME.d / 2 + 0.01;
    group.add(plateMesh);
    // 반환 주소 꼬리표: 프레임 왼쪽(코드 판 쪽)에 매달고 코드 판의 그 줄까지 실을 잇는다
    const tag = signPainter();
    const tagMesh = new Mesh(new PlaneGeometry(1.5, 0.38), new MeshBasicMaterial({ map: tag.texture, transparent: true, toneMapped: false }));
    tagMesh.position.set(-FRAME.w / 2 - 0.85, 0.18, FRAME.d / 2);
    group.add(tagMesh);
    const lineMat = new LineBasicMaterial({ transparent: true, opacity: 0.8 });
    this.mats.push({ mat: lineMat, key: "gold" });
    this.paint(lineMat, "gold");
    const string = new Line(new BufferGeometry(), lineMat);
    this.root.add(string);
    this.root.add(group);
    return { group, body, plate, tag, string, bodyMat };
  }

  /** 결과 상태를 그대로 반영한다(프레임 만들기·지우기, 판·꼬리표·실·코드 판 다시 그리기) */
  apply(state: StackState) {
    this.state = state;
    for (const [depth, node] of this.frames) {
      if (depth < state.frames.length) continue;
      this.root.remove(node.group, node.string);
      this.frames.delete(depth);
    }
    state.frames.forEach((f, depth) => {
      const node = this.frames.get(depth) ?? this.makeFrame(depth);
      this.frames.set(depth, node);
      outlineAll(node.group, this.palette.outline); // 나중에 쌓이는 프레임에도 외곽선
      node.group.position.set(STACK_X, this.frameY(depth), 0);
      node.group.scale.setScalar(1);
      node.group.visible = true;
      const running = depth === state.frames.length - 1;
      // 한도를 넘은 맨 위 프레임은 공격색
      node.body.material = state.overflowed && running ? this.overMat : node.bodyMat;
      paintFrame(node.plate, f.call, f.locals, running, this.palette);
      const back = f.returnTo ? `↩ ${this.fnName(f.returnTo.fn)} ${f.returnTo.line ?? "?"}행` : "↩ 프로그램 끝";
      paintSign(node.tag, back, "neutral", this.palette);
      const from = new Vector3(STACK_X - FRAME.w / 2 - 1.6, this.frameY(depth) + 0.18, FRAME.d / 2);
      const to = f.returnTo?.line ? new Vector3(BOARD.x + BOARD.w / 2, this.lineY(f.returnTo.line), 0.02) : from;
      node.string.geometry.setFromPoints([from, to]);
      node.string.visible = Boolean(f.returnTo?.line);
    });
    const returnLines = new Set(state.frames.flatMap((f) => (f.returnTo?.line ? [f.returnTo.line] : [])));
    paintCode(this.boardPaint, state.code?.title, state.code?.lines ?? [], state.line, returnLines, this.palette);
    this.ball.visible = false;
    this.flashLimit(state.overflowed);
    if (state.stamp) this.showStamp(state.stamp.label, state.stamp.tone);
    else this.stamp.visible = false;
    this.stamp.scale.set(1, 1, 1);
  }

  setPalette(palette: Palette) {
    this.palette = palette;
    for (const m of this.mats) this.paint(m.mat, m.key, m.emissive);
    outlineAll(this.root, palette.outline);
    paintOutlines(this.root, palette.outline);
    this.apply(this.state);
  }

  /** 카메라가 담을 점: 코드 판 전체 + 쌓인 프레임 + 다음에 쌓일 자리 */
  shotPoints(extraDepth = 0) {
    const h = this.boardHeight;
    const pts = [
      new Vector3(BOARD.x - BOARD.w / 2, 0.2, 0),
      new Vector3(BOARD.x - BOARD.w / 2, 0.2 + h, 0),
      new Vector3(STACK_X + FRAME.w / 2, 0.2, FRAME.d / 2),
    ];
    const top = Math.max(this.depth, 1) + extraDepth;
    pts.push(new Vector3(STACK_X + FRAME.w / 2, this.frameY(top - 1) + FRAME.h / 2 + 0.3, FRAME.d / 2));
    // 한도선과 그 라벨, 도장도 화면에 담는다
    if (this.limitLine) pts.push(this.limitLabelPoint().add(new Vector3(1.2, 0.4, 0)));
    if (this.stamp.visible) pts.push(this.stamp.position.clone().add(new Vector3(-1.9, 0.9, 0)), this.stamp.position.clone().add(new Vector3(1.9, -0.9, 0)));
    return pts;
  }

  /** 화면 사각형(겹침 검사용): 코드 판과 프레임 */
  screenRects(camera: PerspectiveCamera, width: number, height: number) {
    const rect = (center: Vector3, w: number, h: number) => {
      const pts = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => center.clone().add(new Vector3((sx * w) / 2, (sy * h) / 2, 0)).project(camera)));
      const xs = pts.map((p) => ((p.x + 1) / 2) * width);
      const ys = pts.map((p) => ((1 - p.y) / 2) * height);
      return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
    };
    const rects: Record<string, ReturnType<typeof rect>> = { code: rect(this.board.position, BOARD.w, this.boardHeight) };
    for (const [depth, node] of this.frames) {
      if (node.group.visible) rects[`frame-${depth}`] = rect(node.group.position.clone().setZ(FRAME.d / 2), FRAME.w, FRAME.h);
    }
    return rects;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof Mesh || o instanceof Line) {
        o.geometry.dispose();
        const m = o.material as Material & { map?: { dispose(): void } };
        m.map?.dispose();
        m.dispose();
      }
    });
  }
}

type RootProps = StageProps & SceneFrame;

function StackRoot({ term, state, view, reducedMotion, freeView, onStepDone, stageRef, labelRoot, shadowSize, visible }: RootProps) {
  const { scene, camera, size, setFrameloop, invalidate } = useThree();
  const palette = usePalette();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 색은 아래 effect에서 바꾼다
  const model = useMemo(() => new StackModel(term, palette), [term]);
  const rig = useMemo(() => new CameraRig(VIEW), []);
  const labels = useRef<LabelLayer | null>(null);
  const timeline = useRef<Timeline | null>(null);
  const timelineDone = useRef(false);
  const playing = useRef(state.playing);
  const speed = useRef(state.speed);
  speed.current = state.speed;
  const jump = useRef(true);
  const idle = useRef(0);
  const controls = useRef<OrbitControlsImpl>(null);

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

  // 단계·모드가 바뀌면: 직전 단계까지의 결과를 바로 적용한 뒤 이 단계만 연출한다 (docs/06 4절)
  useEffect(() => {
    const trace = tracerFor(state.step, state.defense);
    const done = () => {
      timelineDone.current = true;
      if (playing.current) onStepDone();
    };
    timelineDone.current = false;
    const before = stackStateAt(term, state.defense, state.step);
    const after = stackStateAt(term, state.defense, state.step + 1);
    labels.current!.show("ret", false);
    if (term.scenario.stackLimit) labels.current!.set("limit", model.limitLabelPoint(), { title: `스택 한도 · ${term.scenario.stackLimit}칸`, tone: "attack" });
    rig.setAspect(size.width / Math.max(1, size.height));

    if (!state.started) {
      // 시작 전: 빈 스택과 코드 판 전체
      model.apply(before);
      timeline.current = null;
      rig.frame(model.shotPoints(1));
      jump.current = true;
      wake();
      return;
    }

    const actor = view.action === "push" ? view.to : view.from;
    const returns = view.effects.filter((e) => e.type === "returnValue");
    const others = view.effects.filter((e) => e.type !== "returnValue");
    const traceOthers = () => others.forEach((e) => trace("effect", { effect: e.type, actor: (e.type === "locals" && e.target) || view.to }));
    const tl = new Timeline();

    if (reducedMotion) {
      // 동작 줄이기: 결과 상태로 바로
      model.apply(after);
      rig.frame(model.shotPoints());
      jump.current = true;
      tl.call(() => {
        trace("stepStart");
        trace(view.action as "push" | "pop" | "run", { actor });
        returns.forEach(() => trace("effect", { effect: "returnValue", actor: view.to }));
        traceOthers();
      });
      tl.wait(holdMs(view, false));
    } else if (view.action === "push") {
      model.apply(after);
      const depth = after.frames.length - 1;
      const g = model.frameGroup(depth)!;
      const y = g.position.y;
      tl.call(() => {
        trace("stepStart");
        rig.frame(model.shotPoints());
        g.position.y = y + 2.6;
      });
      tl.tween(700, (t) => (g.position.y = y + 2.6 * (1 - t)), easeOut);
      tl.call(() => trace("push", { actor }));
      // 한도를 넘음: 한도선이 세 번 깜빡이고 도장(있으면)이 찍힌다
      if (after.overflowed) {
        for (let k = 0; k < 3; k++) tl.call(() => model.flashLimit(true)).wait(180).call(() => model.flashLimit(false)).wait(140);
      }
      tl.call(() => {
        model.flashLimit(after.overflowed);
        traceOthers();
        if (after.stamp) {
          model.showStamp(after.stamp.label, after.stamp.tone);
          rig.frame(model.shotPoints());
        }
      });
      if (after.stamp) tl.tween(320, (t) => model.stamp.scale.set(2.4 - 1.4 * t, 2.4 - 1.4 * t, 1), easeOut);
      tl.wait(holdMs(view, true));
    } else if (view.action === "pop") {
      model.apply(before);
      const top = before.frames.length - 1;
      const g = model.frameGroup(top)!;
      const from = model.platePoint(top);
      const to = model.platePoint(top - 1);
      const mid = from.clone().add(to).multiplyScalar(0.5).add(new Vector3(1.6, 0.4, 0.4));
      const curve = new QuadraticBezierCurve3(from, mid, to);
      const value = returns[0]?.type === "returnValue" ? returns[0].value : undefined;
      tl.call(() => {
        trace("stepStart");
        rig.frame(model.shotPoints());
        trace("pop", { actor });
      });
      if (value !== undefined) {
        tl.call(() => {
          model.stamp.visible = false;
          model.ball.visible = true;
          labels.current!.set("ret", model.ball.position, { title: `return ${value}`, tone: "neutral" });
        });
        tl.tween(1000, (t) => model.ball.position.copy(curve.getPoint(t)));
        tl.call(() => returns.forEach(() => trace("effect", { effect: "returnValue", actor: view.to })));
        tl.wait(300);
      }
      tl.tween(500, (t) => {
        g.position.y = model.frameY(top) + 2.6 * t;
        g.scale.setScalar(1 - 0.4 * t);
      });
      tl.call(() => {
        labels.current!.show("ret", false);
        model.apply(after);
        rig.frame(model.shotPoints());
        traceOthers();
      });
      tl.wait(holdMs(view, true));
    } else {
      model.apply(after);
      const g = model.frameGroup(after.frames.length - 1);
      tl.call(() => {
        trace("stepStart");
        rig.frame(model.shotPoints());
      });
      tl.tween(600, (t) => g?.scale.setScalar(1 + 0.05 * Math.sin(t * Math.PI)));
      tl.call(() => {
        trace("run", { actor });
        traceOthers();
      });
      tl.wait(holdMs(view, true));
    }
    tl.call(() => trace("stepEnd"));
    tl.call(done);
    timeline.current = tl;
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- view는 term·defense·step에서 나온다
  }, [model, term, state.defense, state.step, state.started, reducedMotion]);

  useEffect(() => {
    playing.current = state.playing;
    if (state.playing && timelineDone.current) onStepDone();
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.playing]);

  useEffect(() => {
    model.setPalette(palette);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette]);

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

  useEffect(
    () =>
      exposeProbe(() => ({
        settled: rig.settled(camera as PerspectiveCamera),
        width: size.width,
        height: size.height,
        rects: model.screenRects(camera as PerspectiveCamera, size.width, size.height),
        stamp: model.stamp.visible ? billboardRect(model.stamp, camera, size.width, size.height) : undefined,
        parents: {},
      })),
    [model, rig, camera, size],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const tl = timeline.current;
    const running = Boolean(tl && !tl.finished);
    tl?.advance(dt * 1000 * speed.current * traceSpeed());
    rig.setAspect(size.width / Math.max(1, size.height));
    let settled = true;
    if (!freeView) settled = rig.apply(camera as PerspectiveCamera, dt * traceSpeed(), jump.current); // 테스트 배속은 카메라에도(배포 빌드는 1)
    jump.current = false;
    labels.current?.update(camera, size.width, size.height, model.stamp.visible ? [billboardRect(model.stamp, camera, size.width, size.height)] : []);
    if (!running && settled && !freeView) {
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

export default function StackScene(props: StageProps) {
  return <SceneCanvas stageRef={props.stageRef} freeView={props.freeView}>{(frame) => <StackRoot {...props} {...frame} />}</SceneCanvas>;
}
