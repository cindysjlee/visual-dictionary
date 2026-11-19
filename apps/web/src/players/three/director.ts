// 한 단계의 연출을 타임라인으로 만든다. 효과 어휘(docs/04)만 보고 순서를 정하므로 용어별 코드가 없다 (docs/06 2·3절)
import { QuadraticBezierCurve3, Vector3, type Object3D } from "three";
import type { Effect, Term } from "@app/content-schema";
import { blockTarget, passesGate, type StepView } from "@app/content-schema/scene";
import type { CameraRig } from "./camera.ts";
import type { LabelLayer, LabelTone } from "./labels.ts";
import type { Placed } from "./layout.ts";
import type { SceneModel, Tone } from "./model.ts";
import { Timeline, easeOut, linear } from "./timeline.ts";
import { TRACE, type Tracer } from "./trace.ts";

const vec = (p: readonly [number, number, number]) => new Vector3(...p);


/**
 * 검사 없는 차단의 도장 위치: 대상 옆(장면 가운데 쪽), 이름표보다 낮게. 위에 두면 대상·부모의 이름 라벨(HTML, 캔버스 위)과 겹친다.
 * focus는 대상과 도장이 함께 보이는 카메라 초점
 */
export function sideStamp(anchor: Vector3) {
  const side = anchor.x > 0.5 ? -2.7 : 2.7;
  return { at: anchor.clone().add(new Vector3(side, -0.4, 0.4)), focus: anchor.clone().add(new Vector3(side / 2, 0.4, 0)) };
}

/** 이 단계에 등장하는 행위자: 출발·목적지·경유지와 효과 대상. 카메라는 단계마다 이들을 모두 화면에 담는다 */
export function involvedActors(view: Pick<StepView, "from" | "to" | "via" | "effects">): string[] {
  const ids = [view.from, view.to, view.via];
  for (const e of view.effects) {
    if ("target" in e) ids.push(e.target);
    if ("into" in e) ids.push(e.into);
    if ("at" in e) ids.push(e.at);
    if ("to" in e) ids.push(e.to);
    if ("from" in e && e.from !== "packet") ids.push(e.from);
  }
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
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
  /** 테스트·개발 빌드의 장면 기록(trace.ts). 배포 빌드에서는 아무것도 하지 않는다 */
  trace?: Tracer;
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
  const trace: Tracer = ctx.trace ?? (() => {});
  const tl = new Timeline();
  const env = model.envelope;
  const node = (id: string) => model.nodes.get(id);
  const anchor = (id: string) => vec(layout.get(id)!.anchor);
  const tone: Tone = view.tone === "defense" ? "attack" : view.tone; // 차단은 검사 결과가 나온 뒤에 방어색으로
  const effects = view.effects;
  const inspect = effects.find((e): e is Extract<Effect, { type: "inspect" }> => e.type === "inspect");
  let label = view.label;
  const cur = anchor(view.from);
  const self = view.from === view.to; // 제자리 단계(예: 탭 안에서 스크립트 실행): 봉투가 날지 않는다
  const via = view.via && !self && view.via !== view.from && view.via !== view.to ? view.via : undefined;
  const panelPoint = (id: string) => node(id)?.panel?.pivot.getWorldPosition(new Vector3()) ?? anchor(id);
  const involved = involvedActors(view);
  /** 등장 행위자 전체(+ 차단 도장, 카메라 힌트 대상)가 들어오는 샷. 근접 연출이 끝나면 여기로 돌아온다 */
  const frameShot = () => {
    const ids = view.camera ? [...involved, ...(view.camera.focus === "all" ? [...layout.values()].filter((p) => !p.parent).map((p) => p.id) : [view.camera.focus])] : involved;
    const pts = ids.flatMap((id) => model.framePoints(id));
    if (model.stamp.visible) pts.push(model.stamp.position.clone().add(new Vector3(1.9, 0.9, 0)), model.stamp.position.clone().add(new Vector3(-1.9, -0.9, 0)));
    rig.frame(pts);
  };

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
    trace("stepStart");
    env.position.copy(cur);
    env.visible = !self;
    model.setEnvelopeTone(tone);
    packetLabel(label);
    if (view.camera) {
      if (view.camera.focus === "all") rig.frame([...layout.values()].filter((p) => !p.parent).map((p) => vec(p.anchor)));
      else rig.shot(anchor(view.camera.focus), view.camera.distance);
    } else frameShot();
    // 출발 샷이 목적지(숨은 대상이면 나타날 자리)를 처음부터 담는지 기록한다(테스트 빌드). 멀리 날아가는 동안 출발지만 보이면 안 된다
    if (!self) trace("depart", { actor: view.from, ...(TRACE ? { inShot: rig.covers([anchor(view.to), ...model.framePoints(view.to).slice(0, 8)]) } : {}) });
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
      trace("effect", { effect: "attach", actor: e.from, refused: e.refused });
      rig.shot(from, "near");
      const site = layout.get(view.to) && ctx.term.scenario.actors.find((a) => a.id === view.to)?.site;
      labels.set(
        NOTE,
        from.clone().add(new Vector3(0, 1.2, 0)),
        e.refused
          ? { title: `${e.reason ?? "거부"} → ${e.label ?? "물건"} 안 붙임`, tone: "defense" }
          : { title: e.note ?? `목적지 ${site ?? view.to} → ${e.label ?? e.item} 자동 첨부`, tone: "plain" },
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
      frameShot();
    });
  }

  // 2) 본 비행: 검문소가 있으면 검문소에 먼저 들른다
  const target = layout.get(view.to)!;
  const gate = passesGate(ctx.term, view.from, view.to) ? target.gate : undefined;
  const blockedWithoutInspect = view.blocked && !inspect;
  let ended = false;

  // 경유지(via): 먼저 들렀다 간다. 봉투에서 빠져나가는 물건(엿보기·가로채기)은 경유지에서 출발한다
  if (via) {
    fly(anchor(via), 1.0);
    tl.call(() => trace("via", { actor: via }));
  }
  const firstLeg = gate ? vec(gate.entry) : anchor(view.to);
  const legFrom = cur.clone();
  const legStart = tl.duration;
  if (self) tl.wait(900);
  else fly(firstLeg, via ? 1.2 : 1.6);
  for (const g of gives) {
    const obj = model.flyers.get(g.item)!;
    const from = g.from === "packet" ? legFrom : anchor(g.from);
    if (g.refused) continue;
    const curve = arc(from, anchor(g.to), 2.2);
    const update = (t: number) => {
      obj.visible = t < 1;
      obj.position.copy(curve.getPoint(t));
    };
    if (self) tl.tween(1200, update);
    else tl.with(Math.max(1200, tl.duration - legStart), update);
  }
  tl.call(() => {
    for (const g of gives) {
      trace("effect", { effect: "give", actor: g.to, refused: g.refused });
      if (!g.refused) model.setHolding(g.to, g.item, true);
    }
    if (gate) trace("gate", { actor: view.to });
    else if (!self) trace("arrive", { actor: view.to });
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
      tl.call(() => trace("effect", { effect: "inspect", actor: inspect.at, refused: failed && view.blocked }));
      if (failed && view.blocked) {
        tl.call(() => {
          trace("blocked", { actor: view.to });
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
          frameShot();
        });
        fly(anchor(view.to), 0.7, 1000);
      }
    } else {
      armOpen();
      fly(anchor(view.to), 0.6, 900);
    }
    if (!ended) tl.call(() => trace("arrive", { actor: view.to }));
  }

  // 3) 왕복
  if (!ended && view.roundTrip) {
    tl.call(() => {
      label = view.returnLabel ?? label;
      packetLabel(label);
    });
    fly(anchor(view.from));
    tl.call(() => trace("return", { actor: view.from }));
  }

  // 4) 도착한 뒤의 효과 (적힌 순서대로)
  if (!ended) {
    tl.call(() => {
      if (!effects.some((e) => e.type === "store")) env.visible = false;
      labels.show(PACKET, false);
    });
    for (const e of effects) {
      if (!["attach", "give", "inspect"].includes(e.type)) {
        const actor = "target" in e ? e.target : "into" in e ? e.into : "to" in e ? e.to : undefined;
        tl.call(() => trace("effect", { effect: e.type, actor, refused: "refused" in e ? e.refused : false }));
      }
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
          });
          tl.tween(700, (t) => g.scale.setScalar(Math.max(0.001, t)), easeOut);
          break;
        }
        case "rewrite":
          tl.call(() => {
            rig.shot(panelPoint(e.target), "near");
            model.repaintScreen(e.target, e.side, e.screen);
          });
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
          tl.call(frameShot);
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

  // 검사 없이 막히는 차단(실행·읽기·엿보기가 거부됨): 단계를 끝까지 보여 준 뒤 거부된 곳에 도장 (docs/04 방어 모드 동작)
  if (blockedWithoutInspect) {
    const stamp = sideStamp(anchor(blockTarget(view)));
    tl.call(() => {
      trace("blocked", { actor: blockTarget(view) });
      labels.show(NOTE, false);
      model.setEnvelopeTone("defense");
      model.showStamp(view.blockedLabel ?? "차단", stamp.at);
      rig.shot(stamp.focus, "near");
    });
    tl.tween(320, (t) => model.stamp.scale.set(2.4 - 1.4 * t, 2.4 - 1.4 * t, 1), easeOut);
  }

  // 근접 연출(보관함·뒤집기·도장)을 잠깐 보여 준 뒤 등장 행위자 전체 샷으로 물러나 대기한다
  tl.wait(700);
  tl.call(frameShot);
  tl.wait(ctx.hold);
  tl.call(() => trace("stepEnd"));
  tl.call(ctx.onDone);
  return tl;
}
