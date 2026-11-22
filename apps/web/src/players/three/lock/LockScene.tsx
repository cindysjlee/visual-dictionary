// 점유형 3D 무대(데드락). 상세 페이지에서만 동적 import된다(Player.tsx). 앞줄에 스레드, 뒷줄 받침대에 자원 (docs/06 "점유형")
// 쥐면 자원이 받침대에서 스레드 손으로 오고 받침대 자물쇠가 잠긴다(상호 배제). 기다리면 점선과 모래시계(점유 대기),
// 대기가 고리를 이루면 바닥 고리와 위에서 보는 샷(순환 대기), 빼앗으려다 튕겨 나온다(비선점). 왼쪽 위 "교착 조건" 패널이 한 칸씩 켜진다
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Line,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
  type Object3D,
  type PerspectiveCamera,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Term } from "@app/content-schema";
import { kindOf } from "@app/content-schema/scene";
import { holdMs, type StageProps } from "../../stage.ts";
import { billboardRect, faceCamera } from "../billboard.ts";
import { CameraRig } from "../camera.ts";
import { useFreeView } from "../freeView.ts";
import { LabelLayer, type CheckRow } from "../labels.ts";
import { SceneCanvas, SceneLights, type SceneFrame } from "../SceneCanvas.tsx";
import { paintStamp, screenPainter } from "../textures.ts";
import { Timeline, easeOut } from "../timeline.ts";
import { exposeProbe, traceSpeed, tracerFor, type Tracer } from "../trace.ts";
import { usePalette, type Palette } from "../tokens.ts";
import { CONDITION_NAMES, lockStateAt, type Condition, type LockState } from "./lockState.ts";

const TOP_VIEW = new Vector3(0, 2.4, 1); // 순환 대기: 위에서 내려다보면 고리 모양이 한눈에 보인다
const spread = (n: number, w: number) => Array.from({ length: n }, (_, i) => (n === 1 ? 0 : -w / 2 + (w * i) / (n - 1)));

type Node = { id: string; group: Group; label: Vector3 };

class LockModel {
  readonly root = new Group();
  readonly threads = new Map<string, Node & { hourglass: Group; home: Vector3 }>();
  readonly resources = new Map<string, Node & { pedestal: Vector3; shackle: Mesh }>();
  readonly ring: Mesh;
  readonly stamp: Mesh;
  /** 공유 값을 읽고 쓸 때 자원과 스레드 사이를 날아가는 메모 카드 */
  readonly chit: Mesh;
  readonly billboards: Object3D[] = [];
  private waitLines = new Map<string, Line>();
  private stampPaint = screenPainter();
  private mats: { mat: MeshStandardMaterial | LineDashedMaterial; key: keyof Palette; emissive: number }[] = [];
  private palette: Palette;

  constructor(term: Term, palette: Palette) {
    this.palette = palette;
    const threads = term.scenario.actors.filter((a) => kindOf(a) === "thread");
    const resources = term.scenario.actors.filter((a) => kindOf(a) !== "thread");
    spread(threads.length, 7).forEach((x, i) => {
      const a = threads[i]!;
      const g = new Group();
      g.position.set(x, 0, 2.4);
      this.mesh(new CylinderGeometry(1.3, 1.4, 0.3, 40), "island", [0, 0.15, 0], g);
      this.mesh(new ConeGeometry(0.55, 1.4, 32), i % 2 ? "objectDim" : "object", [0, 1.0, 0], g);
      this.mesh(new SphereGeometry(0.36, 32, 16), i % 2 ? "objectDim" : "object", [0, 1.85, 0], g);
      const hourglass = new Group();
      hourglass.position.set(0, 2.75, 0);
      this.mesh(new ConeGeometry(0.22, 0.32, 16), "gold", [0, 0.16, 0], hourglass, 0.4).rotation.x = Math.PI;
      this.mesh(new ConeGeometry(0.22, 0.32, 16), "gold", [0, -0.16, 0], hourglass, 0.4);
      hourglass.visible = false;
      g.add(hourglass);
      this.root.add(g);
      this.threads.set(a.id, { id: a.id, group: g, label: new Vector3(x, 3.3, 2.4), hourglass, home: g.position.clone() });
    });
    spread(resources.length, 7).forEach((x, i) => {
      const a = resources[i]!;
      // 받침대와 자물쇠(잡히면 고리가 내려가 잠긴다). 자원 본체는 따로 움직인다
      const ped = new Group();
      ped.position.set(x, 0, -2.4);
      this.mesh(new BoxGeometry(2.0, 0.6, 1.4), "objectDim", [0, 0.3, 0], ped);
      this.mesh(new BoxGeometry(0.36, 0.3, 0.12), "gold", [0, 0.45, 0.72], ped, 0.2);
      const shackle = this.mesh(new TorusGeometry(0.12, 0.035, 8, 16, Math.PI), "gold", [0, 0.66, 0.72], ped, 0.2);
      this.root.add(ped);
      const g = new Group();
      if (a.look === "memory") {
        // 공유 메모리 칸: 칩(납작 상자 + 양옆 핀) 위에 값판. 값은 HTML 라벨로 크게 보인다
        this.mesh(new BoxGeometry(1.4, 0.3, 1.0), "object", [0, 0.15, 0], g);
        for (let k = 0; k < 4; k++) for (const side of [-1, 1]) this.mesh(new BoxGeometry(0.16, 0.05, 0.08), "gold", [side * 0.78, 0.15, -0.36 + k * 0.24], g, 0.2);
        this.mesh(new BoxGeometry(1.1, 0.5, 0.06), "paper", [0, 0.6, 0.2], g, 0.1);
      } else if (a.look === "scanner") {
        this.mesh(new BoxGeometry(1.5, 0.28, 1.0), "object", [0, 0.14, 0], g);
        this.mesh(new BoxGeometry(1.2, 0.03, 0.7), "neutral", [0, 0.29, 0], g, 0.6);
        const lid = this.mesh(new BoxGeometry(1.5, 0.08, 1.0), "objectDim", [0, 0.55, -0.4], g);
        lid.rotation.x = -0.6;
      } else {
        this.mesh(new BoxGeometry(1.3, 0.6, 0.9), "object", [0, 0.3, 0], g);
        this.mesh(new BoxGeometry(0.9, 0.04, 0.5), "paper", [0, 0.64, -0.1], g);
        this.mesh(new BoxGeometry(0.9, 0.06, 0.35), "objectDim", [0, 0.25, 0.6], g);
      }
      const pedestal = new Vector3(x, 0.6, -2.4);
      g.position.copy(pedestal);
      this.root.add(g);
      this.resources.set(a.id, { id: a.id, group: g, label: new Vector3(x, 1.9, -2.4), pedestal, shackle });
    });
    this.ring = this.mesh(new TorusGeometry(4.6, 0.09, 12, 96), "attack", [0, 0.06, 0.2], this.root, 0.7);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;
    this.stamp = new Mesh(new PlaneGeometry(3.6, 1.65), new MeshBasicMaterial({ map: this.stampPaint.texture, transparent: true, depthTest: false, toneMapped: false }));
    this.stamp.renderOrder = 10;
    this.stamp.visible = false;
    // 가운데 자원이 있으면(자원이 하나) 도장이 그 자원을 가리지 않게 더 높이 둔다
    const centered = [...this.resources.values()].some((r) => Math.abs(r.pedestal.x) < 1.5);
    this.stamp.position.set(0, centered ? 5.4 : 3.6, centered ? -1.2 : 0.4);
    this.root.add(this.stamp);
    this.billboards.push(this.stamp);
    this.chit = this.mesh(new BoxGeometry(0.5, 0.34, 0.04), "gold", [0, 0, 0], this.root, 0.5);
    this.chit.visible = false;
    this.billboards.push(this.chit);
  }

  private mesh(geo: BufferGeometry, key: keyof Palette, at: [number, number, number], parent: Object3D, emissive = 0) {
    const mat = new MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
    this.mats.push({ mat, key, emissive });
    mat.color.set(this.palette[key]);
    mat.emissive = new Color(this.palette[key]).multiplyScalar(emissive);
    const m = new Mesh(geo, mat);
    m.position.set(...at);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /** 자원이 있어야 할 자리: 쥔 스레드의 손(가운데 쪽 앞) 또는 받침대 */
  resourcePos(state: LockState, id: string) {
    const holder = state.owner.get(id);
    const t = holder ? this.threads.get(holder) : undefined;
    if (!t) return this.resources.get(id)!.pedestal.clone();
    const toward = t.home.x > 0 ? -1 : 1;
    return t.home.clone().add(new Vector3(toward * 1.6, 0.9, 0.7)); // 몸 옆에 든다(몸과 겹치지 않게)
  }

  apply(state: LockState, withStamp = true) {
    for (const [id, r] of this.resources) {
      r.group.position.copy(this.resourcePos(state, id));
      r.group.scale.setScalar(state.owner.has(id) ? 0.75 : 1);
      r.label.copy(r.group.position).add(new Vector3(0, 1.2, 0));
      r.shackle.position.y = state.owner.has(id) ? 0.58 : 0.7; // 내려가면 잠김
    }
    for (const [id, t] of this.threads) {
      t.group.position.copy(t.home);
      t.hourglass.visible = state.waiting.has(id);
    }
    // 기다림: 스레드에서 기다리는 자원까지 점선
    for (const line of this.waitLines.values()) line.visible = false;
    for (const [tid, rid] of state.waiting) {
      let line = this.waitLines.get(tid);
      if (!line) {
        const mat = new LineDashedMaterial({ dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.9 });
        this.mats.push({ mat, key: "attack", emissive: 0 });
        mat.color.set(this.palette.attack);
        line = new Line(new BufferGeometry(), mat);
        this.root.add(line);
        this.waitLines.set(tid, line);
      }
      const from = this.threads.get(tid)!.home.clone().add(new Vector3(0, 1.6, 0));
      line.geometry.setFromPoints([from, this.resourcePos(state, rid).add(new Vector3(0, 0.4, 0))]);
      line.computeLineDistances();
      line.visible = true;
    }
    this.chit.visible = false;
    this.ring.visible = state.cycle;
    this.ring.scale.setScalar(1);
    this.stamp.visible = withStamp && Boolean(state.stamp);
    if (state.stamp) paintStamp(this.stampPaint, state.stamp.label, this.palette, state.stamp.tone);
    this.stamp.scale.set(1, 1, 1);
  }

  setPalette(palette: Palette, state: LockState) {
    this.palette = palette;
    for (const m of this.mats) {
      m.mat.color.set(palette[m.key]);
      if (m.mat instanceof MeshStandardMaterial) m.mat.emissive = new Color(palette[m.key]).multiplyScalar(m.emissive);
    }
    this.apply(state, this.stamp.visible);
  }

  showStamp(label: string, tone: "attack" | "defense") {
    paintStamp(this.stampPaint, label, this.palette, tone);
    this.stamp.visible = true;
  }

  boxOf(id: string) {
    const n = this.threads.get(id) ?? this.resources.get(id);
    return n?.group;
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

const conditionRows = (s: LockState): CheckRow[] =>
  (Object.keys(CONDITION_NAMES) as Condition[]).map((c) => {
    const st = s.conditions.get(c);
    return { name: CONDITION_NAMES[c], result: st === "met" ? "성립" : st === "broken" ? "깨짐" : "아직", status: st === "met" ? "skip" : st === "broken" ? "fail" : "ok" };
  });

type RootProps = StageProps & SceneFrame;

function LockRoot({ term, state, view, reducedMotion, freeView, onStepDone, stageRef, labelRoot, shadowSize, visible }: RootProps) {
  const { scene, camera, size, setFrameloop, invalidate } = useThree();
  const palette = usePalette();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 색은 아래 effect에서 바꾼다
  const model = useMemo(() => new LockModel(term, palette), [term]);
  const rig = useMemo(() => new CameraRig(), []);
  const labels = useRef<LabelLayer | null>(null);
  const timeline = useRef<Timeline | null>(null);
  const timelineDone = useRef(false);
  const playing = useRef(state.playing);
  const speed = useRef(state.speed);
  speed.current = state.speed;
  const jump = useRef(true);
  const idle = useRef(0);
  const controls = useRef<OrbitControlsImpl>(null);
  const shown = useRef<LockState>(lockStateAt(term, null, 0));

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

  /** "교착 조건" 패널은 조건 효과를 쓰는 용어(데드락)에만 */
  const usesConditions = useMemo(
    () => [...term.scenario.steps, ...term.defenses.flatMap((d) => [...(d.steps ?? []), ...d.overrides])].some((s) => s.effects?.some((e) => e.type === "condition")),
    [term],
  );
  /** 이름표, 공유 값판, 스레드 손의 메모 카드, "교착 조건" 패널 */
  const refreshLabels = (s: LockState, overview = false) => {
    const l = labels.current!;
    for (const a of term.scenario.actors) {
      const n = model.threads.get(a.id) ?? model.resources.get(a.id);
      if (n) l.set(`actor-${a.id}`, n.label, { title: a.name, tone: "plain" });
      const value = s.values.get(a.id);
      const r = model.resources.get(a.id);
      if (value !== undefined && r) l.set(`value-${a.id}`, r.group.position.clone().add(new Vector3(0, 0.15, 1.0)), { title: value, tone: "neutral" }, !overview);
      const t = model.threads.get(a.id);
      const memo = s.memos.get(a.id);
      if (t) {
        const toward = t.home.x > 0 ? -1 : 1;
        l.set(`memo-${a.id}`, t.home.clone().add(new Vector3(toward * 1.7, 2.3, 0.7)), {
          title: memo ? `${memo.kind === "read" ? "읽은 값" : "쓴 값"} ${memo.value}` : "",
          sub: memo?.note,
          tone: "plain",
        }, Boolean(memo) && !overview);
      }
    }
    if (usesConditions) l.pin("checks", { title: "교착 조건", rows: conditionRows(s) }, !overview);
  };

  const framePoints = (ids: string[]) =>
    ids.flatMap((id) => {
      const g = model.boxOf(id);
      if (!g) return [];
      const p = g.position;
      // 자원은 손에 있어도 받침대 자리까지 담는다(잠긴 자물쇠가 보이게)
      const ped = model.resources.get(id)?.pedestal;
      const box = (c: Vector3, lo: Vector3, hi: Vector3) => [lo.x, hi.x].flatMap((x) => [lo.y, hi.y].flatMap((y) => [lo.z, hi.z].map((z) => c.clone().add(new Vector3(x, y, z)))));
      return [...box(p, new Vector3(-1.4, 0, -0.8), new Vector3(1.4, 2.6, 0.8)), ...(ped ? box(ped, new Vector3(-1.1, -0.6, -0.8), new Vector3(1.1, 0.4, 0.8)) : [])];
    });
  /** 모두 + 바닥 고리(보일 때)까지 */
  const everyonePoints = () => {
    const pts = framePoints(term.scenario.actors.map((a) => a.id));
    if (model.ring.visible) pts.push(new Vector3(-4.8, 0, 0.2), new Vector3(4.8, 0, 0.2), new Vector3(0, 0, 4.9), new Vector3(0, 0, -4.5));
    if (model.stamp.visible) pts.push(model.stamp.position.clone().add(new Vector3(-1.9, 0.9, 0)), model.stamp.position.clone().add(new Vector3(1.9, -0.9, 0)));
    return pts;
  };

  useEffect(() => {
    const trace: Tracer = tracerFor(state.step, state.defense);
    const done = () => {
      timelineDone.current = true;
      if (playing.current) onStepDone();
    };
    timelineDone.current = false;
    const before = lockStateAt(term, state.defense, state.step);
    const after = lockStateAt(term, state.defense, state.step + 1);
    rig.setAspect(size.width / Math.max(1, size.height));
    model.apply(before, false);
    shown.current = before;
    refreshLabels(before, !state.started);
    labels.current!.show("note", false);
    labels.current!.declutter = !state.started;

    if (!state.started) {
      timeline.current = null;
      rig.frame(everyonePoints());
      jump.current = true;
      wake();
      return;
    }

    const involved = [view.from, view.to, ...view.effects.flatMap((e) => (e.type === "take" ? [e.from] : []))];
    const cycle = view.effects.some((e) => e.type === "cycle");
    const effectActor = (e: (typeof view.effects)[number]) => (e.type === "condition" ? e.name : e.type === "take" ? e.from : view.from);
    const tl = new Timeline();
    tl.call(() => {
      trace("stepStart");
      rig.frame(cycle ? everyonePoints() : framePoints(involved));
    });

    if (reducedMotion) {
      tl.call(() => {
        model.apply(after);
        shown.current = after;
        refreshLabels(after);
        trace(view.action as "acquire" | "wait" | "release" | "access", { actor: view.from });
        for (const e of view.effects) trace("effect", { effect: e.type, actor: effectActor(e), refused: "refused" in e ? e.refused : false });
        // 연출 끝 샷과 같게: 고리는 위에서, 도장이 있으면 모두가 들어오는 샷(도장이 위 조건 패널까지 올라가지 않게)
        if (cycle) rig.frame(everyonePoints(), TOP_VIEW);
        else if (after.stamp) rig.frame(everyonePoints());
      });
      tl.wait(holdMs(view, false));
    } else {
      // 자원이 받침대 ↔ 손으로 움직인다(쥐기·내려놓기)
      const moves = [...model.resources.keys()].map((id) => ({ id, a: model.resourcePos(before, id), b: model.resourcePos(after, id) })).filter((m) => m.a.distanceTo(m.b) > 0.01);
      if (moves.length) {
        tl.tween(800, (t) => {
          for (const m of moves) {
            const p = m.a.clone().lerp(m.b, t);
            p.y += Math.sin(t * Math.PI) * 1.2;
            model.resources.get(m.id)!.group.position.copy(p);
          }
        });
      } else tl.wait(500);
      tl.call(() => {
        model.apply(after, false);
        shown.current = after;
        refreshLabels(before); // 조건 칸은 효과 순서대로 켠다
        trace(view.action as "acquire" | "wait" | "release" | "access", { actor: view.from });
      });
      const t0 = model.threads.get(view.from)?.home;
      for (const e of view.effects) {
        if (e.type === "condition") {
          tl.call(() => refreshLabels(after));
          tl.wait(500);
        } else if (e.type === "cycle") {
          tl.call(() => rig.frame(everyonePoints(), TOP_VIEW));
          tl.tween(900, (t) => model.ring.scale.setScalar(Math.max(0.01, t)), easeOut);
        } else if (e.type === "take" && t0) {
          // 빼앗으려 손을 뻗었다가 튕겨 나온다(비선점)
          const g = model.threads.get(view.from)!.group;
          const target = model.resourcePos(after, view.to);
          tl.tween(700, (t) => g.position.copy(t0).lerp(target.clone().setY(0), 0.35 * Math.sin(t * Math.PI)));
          tl.call(() => labels.current!.set("note", target.clone().add(new Vector3(0, 1.4, 0)), { title: e.reason ?? "빼앗을 수 없음", tone: "defense" }));
          tl.wait(500);
        } else if (e.type === "timeout") {
          const hg = model.threads.get(view.from)?.hourglass;
          tl.call(() => {
            if (hg) hg.visible = true;
            labels.current!.set("note", (t0 ?? new Vector3()).clone().add(new Vector3(0, 3.6, 0)), { title: "기다리다 포기", tone: "defense" });
          });
          tl.tween(700, (t) => hg?.rotation.set(0, 0, t * Math.PI));
          tl.call(() => hg && (hg.visible = false));
        } else if ((e.type === "read" || e.type === "write") && t0) {
          // 메모 카드가 자원 → 손(읽기) 또는 손 → 자원(쓰기)으로 날아간 뒤 값판·메모가 바뀐다
          const toward = t0.x > 0 ? -1 : 1;
          const hand = t0.clone().add(new Vector3(toward * 1.7, 2.0, 0.7));
          const res = model.resources.get(view.to)!.group.position.clone().add(new Vector3(0, 0.7, 0.4));
          const [a, b] = e.type === "read" ? [res, hand] : [hand, res];
          tl.call(() => {
            model.chit.visible = true;
            rig.frame(framePoints(involved));
          });
          tl.tween(700, (t) => model.chit.position.copy(a).lerp(b, t).setY(a.y + (b.y - a.y) * t + Math.sin(t * Math.PI) * 0.9));
          tl.call(() => {
            model.chit.visible = false;
            refreshLabels(lockStateAt(term, state.defense, state.step + 1));
          });
          tl.wait(400);
        } else if (e.type === "stamp") {
          tl.call(() => model.showStamp(e.label, e.tone));
          tl.tween(320, (t) => model.stamp.scale.set(2.4 - 1.4 * t, 2.4 - 1.4 * t, 1), easeOut);
        }
        tl.call(() => trace("effect", { effect: e.type, actor: effectActor(e), refused: "refused" in e ? e.refused : false }));
      }
      tl.call(() => {
        model.apply(after);
        refreshLabels(after);
        if (!cycle) rig.frame(after.stamp ? everyonePoints() : framePoints(involved));
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
    model.setPalette(palette, shown.current);
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
      exposeProbe(() => {
        const rects: Record<string, { l: number; t: number; r: number; b: number } | undefined> = {};
        for (const a of term.scenario.actors) {
          const g = model.boxOf(a.id);
          if (!g) continue;
          // 스레드는 인형(폭 1.2, 높이 2.2), 자원은 본체(폭 1.5, 높이 0.9) 크기. 받침대·섬은 넣지 않는다
          const thread = model.threads.has(a.id);
          const hw = (thread ? 0.6 : 0.75) * g.scale.x;
          const h = (thread ? 2.2 : 0.9) * g.scale.y;
          const pts = [new Vector3(-hw, 0, -0.5), new Vector3(hw, h, 0.5)].flatMap((d) => [d, new Vector3(-d.x, d.y, -d.z), new Vector3(d.x, 0, d.z), new Vector3(-d.x, h, d.z)]).map((d) => g.position.clone().add(d).project(camera));
          const xs = pts.map((p) => ((p.x + 1) / 2) * size.width);
          const ys = pts.map((p) => ((1 - p.y) / 2) * size.height);
          rects[a.id] = { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
        }
        return {
          settled: rig.settled(camera as PerspectiveCamera),
          width: size.width,
          height: size.height,
          rects,
          stamp: model.stamp.visible ? billboardRect(model.stamp, camera, size.width, size.height) : undefined,
          parents: {},
        };
      }),
    [model, rig, camera, size, term],
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
    faceCamera(model.billboards, camera);
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

export default function LockScene(props: StageProps) {
  return <SceneCanvas stageRef={props.stageRef} freeView={props.freeView}>{(frame) => <LockRoot {...props} {...frame} />}</SceneCanvas>;
}
