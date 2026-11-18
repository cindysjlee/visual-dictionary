// 한 단계의 연출을 타임라인으로 만든다. 효과 어휘(docs/04)만 보고 순서를 정하므로 용어별 코드가 없다 (docs/06 2·3절)
import { QuadraticBezierCurve3, Vector3, type Object3D, type PerspectiveCamera } from "three";
import type { Effect, Term } from "@app/content-schema";
import type { StepView } from "@app/content-schema/scene";
import type { LabelLayer, LabelTone } from "./labels.ts";
import type { Placed } from "./layout.ts";
import type { SceneModel, Tone } from "./model.ts";
import { Timeline, easeOut, linear } from "./timeline.ts";

const vec = (p: readonly [number, number, number]) => new Vector3(...p);

/* ---------- 카메라: 목표(위치·초점)를 정하면 매 프레임 부드럽게 따라간다 ---------- */
export type Distance = "near" | "mid" | "far";
const OFFSET: Record<Distance, Vector3> = { near: new Vector3(-0.6, 2.8, 5.0), mid: new Vector3(0.4, 4.6, 8.6), far: new Vector3(0, 9.5, 15.5) };

export class CameraRig {
  readonly target = new Vector3(0, 0.8, -1.2);
  readonly position = new Vector3(0, 9.5, 15.5);
  private follow: Object3D | null = null;
  private followDistance: Distance = "mid";
  private aspect = 1.8;

  setAspect(aspect: number) {
    this.aspect = aspect;
  }
  /** 화면이 좁으면(휴대폰) 멀리서 찍어 장면이 잘리지 않게 */
  private scale() {
    return Math.max(1, 1.7 / this.aspect);
  }
  shot(focus: Vector3, distance: Distance = "mid") {
    this.follow = null;
    this.target.copy(focus);
    this.position.copy(focus).add(OFFSET[distance].clone().multiplyScalar(this.scale()));
  }
  /** 여러 점이 함께 보이게 (전체·송금 같은 넓은 샷) */
  frame(points: Vector3[]) {
    const center = points.reduce((a, p) => a.add(p), new Vector3()).divideScalar(points.length);
    const spread = Math.max(...points.map((p) => p.distanceTo(center)));
    this.follow = null;
    this.target.copy(center).setY(Math.max(0.8, center.y * 0.6));
    this.position.copy(this.target).add(new Vector3(0, 0.55, 1).normalize().multiplyScalar((6 + spread * 1.6) * this.scale()));
  }
  followObject(obj: Object3D, distance: Distance = "mid") {
    this.follow = obj;
    this.followDistance = distance;
  }
  /** dt초만큼 실제 카메라를 목표 쪽으로. 즉시(jump)면 바로 옮긴다 */
  apply(camera: PerspectiveCamera, dt: number, jump = false) {
    if (this.follow) {
      this.target.lerp(this.follow.getWorldPosition(new Vector3()), jump ? 1 : 1 - Math.exp(-dt * 4));
      this.position.copy(this.target).add(OFFSET[this.followDistance].clone().multiplyScalar(this.scale()));
    }
    const k = jump ? 1 : 1 - Math.exp(-dt * 2.6);
    camera.position.lerp(this.position, k);
    const look = (camera.userData.look as Vector3 | undefined) ?? this.target.clone();
    look.lerp(this.target, k);
    camera.userData.look = look;
    camera.lookAt(look);
    return camera.position.distanceTo(this.position) < 0.02;
  }
}

/* ---------- 단계 연출 ---------- */
export type DirectorContext = {
  term: Term;
  view: StepView;
  layout: Map<string, Placed>;
  model: SceneModel;
  labels: LabelLayer;
  rig: CameraRig;
  hold: number;
  onDone: () => void;
  /** 돈이 넘어간 뒤 잔액 라벨을 다시 그린다 */
  onBalance?: () => void;
};

const TONE_LABEL: Record<Tone, LabelTone> = { neutral: "neutral", attack: "attack", defense: "defense" };
const PACKET = "packet";
const NOTE = "note";
const CHECKS = "checks";

function arc(a: Vector3, b: Vector3, height: number) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y = Math.max(a.y, b.y) + height;
  return new QuadraticBezierCurve3(a.clone(), mid, b.clone());
}
const flightMs = (a: Vector3, b: Vector3) => Math.min(2000, Math.max(900, a.distanceTo(b) * 160));

export function buildStep(ctx: DirectorContext): Timeline {
  const { view, layout, model, labels, rig } = ctx;
  const tl = new Timeline();
  const env = model.envelope;
  const node = (id: string) => model.nodes.get(id);
  const anchor = (id: string) => vec(layout.get(id)!.anchor);
  const tone: Tone = view.tone === "defense" ? "attack" : view.tone; // 차단은 검사 결과가 나온 뒤에 방어색으로
  const effects = view.effects;
  const inspect = effects.find((e): e is Extract<Effect, { type: "inspect" }> => e.type === "inspect");
  let label = view.label;
  const cur = anchor(view.from);

  const packetLabel = (text: string, t: Tone = tone, visible = true) =>
    labels.set(PACKET, env.position, { title: text, tone: TONE_LABEL[t] }, visible);
  const fly = (to: Vector3, height = 1.6, ms?: number, stop = 1) => {
    const curve = arc(cur, to, height);
    const dur = ms ?? flightMs(cur, to);
    tl.tween(dur, (t) => env.position.copy(curve.getPoint(t * stop)));
    cur.copy(curve.getPoint(stop));
  };
  const flyItem = (obj: Object3D, from: Vector3, to: Vector3, ms: number, height = 0.9, parallel = false) => {
    const curve = arc(from, to, height);
    const update = (t: number) => {
      obj.visible = t < 1;
      obj.position.copy(curve.getPoint(t));
    };
    if (parallel) tl.with(ms, update);
    else tl.tween(ms, update);
  };

  // 출발
  tl.call(() => {
    env.position.copy(cur);
    env.visible = true;
    model.setEnvelopeTone(tone);
    packetLabel(label);
    if (view.camera) {
      if (view.camera.focus === "all") rig.frame([...layout.values()].filter((p) => !p.parent).map((p) => vec(p.anchor)));
      else rig.shot(anchor(view.camera.focus), view.camera.distance);
    } else rig.followObject(env, "mid");
  });

  // 봉투와 따로 날아가는 물건(토큰 발급·가로채기)은 첫 비행과 동시에
  const gives = effects.filter((e): e is Extract<Effect, { type: "give" }> => e.type === "give");

  // 1) attach: 꺼낼 곳 앞에 들렀다가 물건을 붙인다. 거부되면 라벨이 바뀌지 않는다
  for (const e of effects) {
    if (e.type !== "attach") continue;
    const from = anchor(e.from);
    const stop = from.clone().add(new Vector3(0.9, 0.6, 0.3));
    fly(stop, 0.6, 1000);
    tl.call(() => {
      rig.shot(from, "near");
      const site = layout.get(view.to) && ctx.term.scenario.actors.find((a) => a.id === view.to)?.site;
      labels.set(
        NOTE,
        from.clone().add(new Vector3(0, 1.2, 0)),
        e.refused
          ? { title: `${e.reason ?? "거부"} → ${e.label ?? "물건"} 안 붙임`, tone: "defense" }
          : { title: `목적지 ${site ?? view.to} → ${e.label ?? e.item} 자동 첨부`, tone: "plain" },
      );
    });
    tl.wait(800);
    if (!e.refused) {
      const flyer = model.flyers.get(e.item)!;
      flyItem(flyer, from, stop, 650, 0.5);
      tl.call(() => {
        model.carry.get(e.item)!.visible = true;
        label = `${label} + ${e.label ?? e.item}`;
        packetLabel(label);
      });
    }
    tl.wait(300);
    tl.call(() => {
      labels.show(NOTE, false);
      rig.followObject(env, "mid");
    });
  }

  // 2) 본 비행: 검문소가 있으면 검문소에 먼저 들른다
  const target = layout.get(view.to)!;
  const gate = target.gate && view.from !== view.to ? target.gate : undefined;
  const blockedWithoutInspect = view.blocked && !inspect;
  let ended = false;

  const firstLeg = gate ? vec(gate.entry) : anchor(view.to);
  const legStart = tl.duration;
  fly(firstLeg, 1.6, undefined, blockedWithoutInspect && !gate ? 0.78 : 1);
  for (const g of gives) {
    const obj = model.flyers.get(g.item)!;
    const from = g.from === "packet" ? env.position.clone() : anchor(g.from);
    if (g.refused) continue;
    const curve = arc(from, anchor(g.to), 2.2);
    tl.with(Math.max(1200, tl.duration - legStart), (t) => {
      obj.visible = t < 1;
      obj.position.copy(curve.getPoint(t));
    });
  }
  tl.call(() => {
    for (const g of gives) if (!g.refused) model.setHolding(g.to, g.item, true);
  });

  if (gate) {
    const armOpen = () => tl.tween(500, (t) => (node(view.to)!.gate!.arm.rotation.z = t * 1.35));
    if (inspect) {
      // 검문: 봉투를 열고 내용 카드를 꺼내 하나씩 검사한다
      tl.call(() => {
        labels.show(PACKET, false);
        rig.shot(vec(gate.mid), "near");
      });
      tl.tween(450, (t) => (model.flap.rotation.x = -2.6 * t));
      tl.call(() => {
        model.showCard(inspect.contents);
        model.card.visible = true;
      });
      tl.tween(600, (t) => {
        model.card.position.copy(env.position).add(new Vector3(0, 0.9 * t, 0.05));
        model.card.scale.setScalar(0.3 + 0.7 * t);
      });
      inspect.checks.forEach((_, i) => {
        tl.call(() =>
          labels.set(CHECKS, vec(gate.position).add(new Vector3(-2.2, 2.6, 0)), { title: "검문소 검사", rows: inspect.checks.slice(0, i + 1) }),
        );
        tl.wait(650);
      });
      const failed = inspect.checks.some((c) => c.status === "fail");
      if (failed && view.blocked) {
        tl.call(() => {
          model.setGateTone(view.to, "defense");
          model.setEnvelopeTone("defense");
          model.showStamp(view.blockedLabel ?? "차단", env.position.clone().add(new Vector3(0, 1.4, 0.4)));
        });
        tl.tween(320, (t) => model.stamp.scale.set(2.4 - 1.4 * t, 2.4 - 1.4 * t, 1), easeOut);
        tl.wait(600);
        tl.call(() => (model.card.visible = false));
        const p0 = cur.clone();
        const back = vec(gate.entry).sub(vec(gate.mid)).normalize();
        tl.tween(
          1000,
          (t) => {
            env.position.set(p0.x + back.x * 1.4 * t, Math.max(0.4, p0.y + 0.6 * t - 2.2 * t * t), p0.z + back.z * 1.4 * t);
            env.userData.roll = 1.1 * t; // 빌보드 회전 위에 덧붙이는 기울기
          },
          linear,
        );
        ended = true;
      } else {
        tl.wait(300);
        tl.call(() => {
          model.card.visible = false;
          model.flap.rotation.x = 0;
          model.setGateTone(view.to, inspect.checks.some((c) => c.status === "skip") ? "attack" : "neutral");
        });
        armOpen();
        tl.call(() => {
          labels.show(CHECKS, false);
          packetLabel(label);
          rig.followObject(env, "mid");
        });
        fly(anchor(view.to), 0.7, 1000);
      }
    } else {
      armOpen();
      fly(anchor(view.to), 0.6, 900);
    }
  } else if (blockedWithoutInspect) {
    tl.call(() => {
      model.setEnvelopeTone("defense");
      model.showStamp(view.blockedLabel ?? "차단", anchor(view.to).add(new Vector3(0, 1.2, 0.4)));
      rig.shot(anchor(view.to), "near");
    });
    tl.tween(320, (t) => model.stamp.scale.set(2.4 - 1.4 * t, 2.4 - 1.4 * t, 1), easeOut);
    ended = true;
  }

  // 3) 왕복
  if (!ended && view.roundTrip) {
    tl.call(() => {
      label = view.returnLabel ?? label;
      packetLabel(label);
    });
    fly(anchor(view.from));
  }

  // 4) 도착한 뒤의 효과 (적힌 순서대로)
  if (!ended) {
    tl.call(() => {
      if (!effects.some((e) => e.type === "store")) env.visible = false;
      labels.show(PACKET, false);
    });
    for (const e of effects) {
      switch (e.type) {
        case "store": {
          const into = anchor(e.into);
          tl.call(() => {
            rig.shot(into, "near");
            for (const m of model.carry.values()) m.visible = false;
          });
          flyItem(model.flyers.get(e.item)!, env.position.clone(), into, 900);
          tl.call(() => {
            env.visible = false;
            model.setHolding(e.into, e.item, true);
            if (e.label) labels.set(NOTE, into.clone().add(new Vector3(0, 1.1, 0)), { title: e.label, tone: "defense" });
          });
          break;
        }
        case "appear": {
          const g = node(e.target)!.group;
          tl.call(() => {
            g.visible = true;
            rig.shot(anchor(e.target), "mid");
          });
          tl.tween(700, (t) => g.scale.setScalar(Math.max(0.001, t)), easeOut);
          break;
        }
        case "rewrite":
          tl.call(() => model.repaintScreen(e.target, e.side, e.screen));
          tl.wait(500);
          break;
        case "flip": {
          const pivot = node(e.target)!.panel!.pivot;
          tl.call(() => rig.shot(anchor(e.target), "near"));
          tl.wait(900);
          tl.tween(1400, (t) => (pivot.rotation.y = t * Math.PI));
          break;
        }
        case "run": {
          const g = node(e.target)!.group;
          tl.call(() => rig.shot(anchor(e.target), "near"));
          if (!e.refused) tl.tween(600, (t) => g.scale.setScalar(1 + 0.08 * Math.sin(t * Math.PI * 3)));
          else tl.call(() => labels.set(NOTE, anchor(e.target).add(new Vector3(0, 1.2, 0)), { title: e.reason ?? "실행 안 됨", tone: "defense" }));
          tl.wait(600);
          break;
        }
        case "transfer": {
          const from = anchor(e.from);
          const to = anchor(e.to);
          tl.call(() => rig.frame([from, to]));
          tl.wait(700);
          const objs = e.item === "coin" ? model.coins : [model.flyers.get("data")!];
          const FLIGHT = 1500;
          const total = FLIGHT + (objs.length - 1) * 200; // 마지막 물건까지 다 도착해야 끝
          objs.forEach((obj, k) => {
            const curve = arc(from, to, 4.5);
            const delay = k * 200;
            const update = (t: number) => {
              const local = Math.min(1, Math.max(0, (t * total - delay) / FLIGHT));
              obj.visible = local > 0 && local < 1;
              obj.position.copy(curve.getPoint(local));
            };
            if (k === 0) tl.tween(total, update, linear);
            else tl.with(total, update, linear);
          });
          tl.call(() => {
            if (e.amount) labels.set(`gain-${e.to}`, to.clone().add(new Vector3(0, 1.2, 0)), { title: `+${e.amount.toLocaleString("ko-KR")}원`, tone: "attack" });
            ctx.onBalance?.();
          });
          break;
        }
        default:
          break;
      }
    }
  }

  tl.wait(ctx.hold);
  tl.call(ctx.onDone);
  return tl;
}
