// 행위자 종류(kind)별 3D 물체를 만든다. 용어별 코드 없음: layoutScene의 배치와 JSON의 kind·tone·gate·screen만 읽는다
import {
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Line,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
} from "three";
import type { Actor, Item, Term } from "@app/content-schema";
import { BROWSER_SIZE, type Placed, type Vec3 } from "./layout.ts";
import type { SceneState, Screen } from "./sceneState.ts";
import { paintCard, paintScreen, paintStamp, screenPainter, type Painter } from "./textures.ts";
import type { Palette } from "./tokens.ts";

export type Tone = "neutral" | "attack" | "defense";
type ColorKey = keyof Palette;

export type ActorNode = {
  actor: Actor;
  placed: Placed;
  group: Group;
  labelPoint: Vector3;
  panel?: { pivot: Group; front: Painter; back: Painter };
  slots: Map<Item, Object3D>;
  gate?: { arm: Group; ring: Mesh; toneMats: MeshStandardMaterial[] };
};

const v = (p: Vec3) => new Vector3(...p);

export class SceneModel {
  readonly root = new Group();
  readonly nodes = new Map<string, ActorNode>();
  readonly occluders: Mesh[] = [];
  readonly billboards: Object3D[] = [];
  readonly envelope = new Group();
  readonly flap = new Group();
  readonly carry = new Map<Item, Object3D>();
  readonly flyers = new Map<Item, Object3D>();
  readonly coins: Object3D[] = [];
  readonly stamp: Mesh;
  readonly card: Mesh;
  private stampPaint = screenPainter();
  private cardPaint = screenPainter();
  private envMat: MeshStandardMaterial;
  private envTone: Tone = "neutral";
  private bound: { mat: MeshStandardMaterial | MeshBasicMaterial | LineBasicMaterial; key: ColorKey; emissive?: number }[] = [];
  private layout: Map<string, Placed>;
  private palette: Palette;

  constructor(term: Term, layout: Map<string, Placed>, palette: Palette) {
    this.layout = layout;
    this.palette = palette;
    this.envMat = this.std("neutral", { emissive: 0.25 });
    this.buildGround();
    for (const actor of term.scenario.actors) this.buildActor(actor);
    this.buildInternet();
    this.buildEnvelope();
    for (const item of ["cookie", "token", "script", "data", "coin"] as Item[]) {
      const flyer = this.itemMesh(item);
      flyer.visible = false;
      this.root.add(flyer);
      this.billboards.push(flyer);
      this.flyers.set(item, flyer);
    }
    for (let i = 0; i < 5; i++) {
      const coin = this.itemMesh("coin");
      coin.visible = false;
      this.root.add(coin);
      this.billboards.push(coin);
      this.coins.push(coin);
    }
    const plane = (p: Painter, w: number, h: number) =>
      new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: p.texture, transparent: true, depthTest: false, toneMapped: false }));
    this.stamp = plane(this.stampPaint, 2.4, 1.1);
    this.card = plane(this.cardPaint, 1.7, 1.17);
    for (const m of [this.stamp, this.card]) {
      m.visible = false;
      m.renderOrder = 10;
      this.root.add(m);
      this.billboards.push(m);
    }
  }

  /* ---------- 재질: 모두 토큰 색에 묶어 두고 테마가 바뀌면 한 번에 다시 칠한다 ---------- */
  private std(key: ColorKey, opts: { emissive?: number; opacity?: number; metal?: number } = {}) {
    const mat = new MeshStandardMaterial({ roughness: 0.55, metalness: opts.metal ?? 0.05 });
    if (opts.opacity !== undefined) Object.assign(mat, { transparent: true, opacity: opts.opacity, depthWrite: opts.opacity > 0.5 });
    this.bound.push({ mat, key, emissive: opts.emissive });
    this.paint(mat, key, opts.emissive);
    return mat;
  }
  private paint(mat: MeshStandardMaterial | MeshBasicMaterial | LineBasicMaterial, key: ColorKey, emissive?: number) {
    mat.color.set(this.palette[key]);
    if (mat instanceof MeshStandardMaterial) mat.emissive = new Color(this.palette[key]).multiplyScalar(emissive ?? 0);
  }
  setPalette(palette: Palette, state: SceneState) {
    this.palette = palette;
    for (const b of this.bound) this.paint(b.mat, b.key, b.emissive);
    this.setEnvelopeTone(this.envTone);
    this.repaintScreens(state);
  }

  private mesh(geo: BufferGeometry, mat: Material, at: Vec3 = [0, 0, 0], parent: Object3D = this.root, occluder = false) {
    const m = new Mesh(geo, mat);
    m.position.set(...at);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    if (occluder) this.occluders.push(m);
    return m;
  }

  private buildGround() {
    const grid = new LineBasicMaterial({ transparent: true, opacity: 0.35 });
    this.bound.push({ mat: grid, key: "grid" });
    this.paint(grid, "grid");
    const pts: Vector3[] = [];
    for (let i = -24; i <= 24; i += 2) pts.push(new Vector3(i, 0, -18), new Vector3(i, 0, 14), new Vector3(-24, 0, i * 0.66), new Vector3(24, 0, i * 0.66));
    this.root.add(new LineSegments(new BufferGeometry().setFromPoints(pts), grid));
    const shadowCatcher = new Mesh(new PlaneGeometry(60, 40), new MeshStandardMaterial({ transparent: true, opacity: 0 }));
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.receiveShadow = true;
    this.root.add(shadowCatcher);
  }

  private island(parent: Object3D, radius = 2.2) {
    this.mesh(new CylinderGeometry(radius, radius * 1.08, 0.3, 48), this.std("island"), [0, 0.15, 0], parent);
  }

  private buildActor(actor: Actor) {
    const placed = this.layout.get(actor.id)!;
    const group = new Group();
    group.position.copy(v(placed.position));
    this.root.add(group);
    const tone: Tone = actor.tone === "attack" ? "attack" : "neutral";
    const node: ActorNode = { actor, placed, group, labelPoint: new Vector3(), slots: new Map() };
    let labelY = 2.4;

    switch (placed.kind) {
      case "browser": {
        const [w, h, d] = BROWSER_SIZE;
        this.mesh(new BoxGeometry(w + 0.3, 0.16, d + 0.3), this.std("objectDim"), [0, 0.08, 0], group);
        const glass = this.std("paper", { opacity: 0.1 });
        glass.side = DoubleSide;
        this.mesh(new BoxGeometry(w, h, d), glass, [0, h / 2 + 0.16, 0], group).castShadow = false;
        const edgeMat = new LineBasicMaterial({ transparent: true, opacity: 0.5 });
        this.bound.push({ mat: edgeMat, key: "grid" });
        this.paint(edgeMat, "grid");
        const edges = new LineSegments(new EdgesGeometry(new BoxGeometry(w, h, d)), edgeMat);
        edges.position.y = h / 2 + 0.16;
        group.add(edges);
        this.mesh(new BoxGeometry(w, 0.22, d), this.std("object", { opacity: 0.95 }), [0, h + 0.27, 0], group, true);
        labelY = h + 0.9;
        break;
      }
      case "tab": {
        const pivot = new Group();
        group.add(pivot);
        const frameMat = this.std(tone === "attack" ? "attack" : "object", { opacity: 1, emissive: tone === "attack" ? 0.2 : 0 });
        this.mesh(new BoxGeometry(2.3, 1.6, 0.08), frameMat, [0, 0, 0], pivot, true);
        const front = screenPainter();
        const back = screenPainter();
        const face = (p: Painter, z: number, ry: number) => {
          const m = this.mesh(new PlaneGeometry(2.14, 1.47), new MeshBasicMaterial({ map: p.texture, transparent: true, toneMapped: false }), [0, 0, z], pivot, true); // 글자가 흐려지지 않게
          m.rotation.y = ry;
          m.castShadow = false;
        };
        face(front, 0.045, 0);
        face(back, -0.045, Math.PI);
        node.panel = { pivot, front, back };
        labelY = 1.05;
        break;
      }
      case "cookieJar": {
        this.mesh(new CylinderGeometry(0.42, 0.42, 0.75, 32), this.std("paper", { opacity: 0.35 }), [0, 0.4, 0], group);
        this.mesh(new CylinderGeometry(0.46, 0.46, 0.1, 32), this.std("objectDim"), [0, 0.82, 0], group);
        labelY = -0.25;
        break;
      }
      case "server": {
        this.island(group);
        if (tone === "attack") {
          for (let i = 0; i < 4; i++) {
            this.mesh(new BoxGeometry(1.2, 0.5, 1.2), this.std("objectAttack"), [0, 0.6 + i * 0.55, 0], group);
            this.mesh(new BoxGeometry(1.24, 0.05, 1.24), this.std("attack", { emissive: 0.8 }), [0, 0.86 + i * 0.55, 0], group);
          }
          labelY = 3.2;
        } else {
          this.mesh(new BoxGeometry(2.4, 0.25, 1.6), this.std("objectDim"), [0, 0.42, 0], group);
          for (const x of [-0.8, -0.27, 0.27, 0.8]) this.mesh(new CylinderGeometry(0.11, 0.11, 1.1, 16), this.std("object"), [x, 1.08, 0.45], group);
          this.mesh(new BoxGeometry(2.2, 1.1, 1.1), this.std("object"), [0, 1.08, -0.15], group);
          const roof = this.mesh(new ConeGeometry(1.75, 0.7, 4), this.std("objectDim"), [0, 2.0, 0], group);
          roof.rotation.y = Math.PI / 4;
          roof.scale.set(1, 1, 0.65);
          labelY = 2.8;
        }
        if (placed.gate) node.gate = this.buildGate(placed, group);
        break;
      }
      case "database": {
        this.island(group, 1.8);
        for (let i = 0; i < 3; i++) this.mesh(new CylinderGeometry(0.8, 0.8, 0.45, 32), this.std("object"), [0, 0.55 + i * 0.5, 0], group);
        labelY = 2.4;
        break;
      }
      case "network": {
        this.island(group, 1.6);
        this.mesh(new BoxGeometry(1.4, 0.35, 0.9), this.std("object"), [0, 0.5, 0], group);
        for (const x of [-0.45, 0.45]) this.mesh(new CylinderGeometry(0.04, 0.04, 0.9, 8), this.std("objectDim"), [x, 1.1, -0.2], group);
        labelY = 1.9;
        break;
      }
      case "attacker":
      case "person": {
        this.island(group, 1.5);
        const key: ColorKey = placed.kind === "attacker" ? "villain" : "object";
        this.mesh(new ConeGeometry(0.55, 1.4, 32), this.std(key), [0, 1.0, 0], group);
        this.mesh(new SphereGeometry(0.36, 32, 16), this.std(key), [0, 1.85, 0], group);
        if (placed.kind === "attacker") {
          for (const x of [-0.13, 0.13]) this.mesh(new SphereGeometry(0.05, 12, 8), this.std("gold", { emissive: 0.9 }), [x, 1.9, 0.32], group);
        }
        labelY = 2.6;
        break;
      }
    }
    node.labelPoint.copy(group.position).add(new Vector3(0, labelY, 0));
    this.nodes.set(actor.id, node);
  }

  private buildGate(placed: Placed, server: Group): ActorNode["gate"] {
    const gate = placed.gate!;
    const g = new Group();
    g.position.copy(v(gate.position)).sub(v(placed.position)); // 서버 그룹 기준 상대 위치
    server.add(g);
    const toneMats = [this.std("neutral", { emissive: 0.5 }), this.std("neutral", { emissive: 0.6 })];
    for (const x of [-1.15, 1.15]) this.mesh(new BoxGeometry(0.24, 2.3, 0.24), this.std("objectDim"), [x, 1.15, 0], g);
    const arm = new Group();
    arm.position.set(-1.05, 0.85, 0.15);
    this.mesh(new BoxGeometry(2.2, 0.1, 0.1), toneMats[0]!, [1.1, 0, 0], arm);
    g.add(arm);
    const ring = this.mesh(new TorusGeometry(0.72, 0.06, 12, 48), toneMats[1]!, [0, 1.15, 0], g);
    return { arm, ring, toneMats };
  }

  private buildInternet() {
    const mat = new LineDashedMaterial({ dashSize: 0.3, gapSize: 0.25, transparent: true, opacity: 0.8 });
    this.bound.push({ mat, key: "grid" });
    this.paint(mat, "grid");
    const client = [...this.layout.values()].find((p) => p.kind === "browser" || (!p.parent && p.position[2] > 1));
    if (!client) return;
    for (const p of this.layout.values()) {
      if (p.parent || p === client) continue;
      const line = new Line(new BufferGeometry().setFromPoints([v(client.position).setY(0.02), v(p.position).setY(0.02)]), mat);
      line.computeLineDistances();
      this.root.add(line);
    }
  }

  /* ---------- 봉투와 물건 ---------- */
  private buildEnvelope() {
    const body = new Mesh(new PlaneGeometry(0.9, 0.6), this.std("paper", { emissive: 0.15 }));
    this.envelope.add(body);
    const tri = new Shape();
    tri.moveTo(-0.45, 0);
    tri.lineTo(0.45, 0);
    tri.lineTo(0, -0.34);
    tri.closePath();
    const flapMesh = new Mesh(new ShapeGeometry(tri), this.envMat);
    flapMesh.position.z = 0.01;
    this.flap.position.y = 0.3;
    this.flap.add(flapMesh);
    this.envelope.add(this.flap);
    const offsets: Record<Item, Vec3> = { cookie: [0.34, 0.2, 0.05], token: [-0.34, 0.2, 0.05], script: [0, -0.18, 0.05], data: [-0.2, -0.15, 0.05], coin: [0.2, -0.15, 0.05] };
    for (const [item, at] of Object.entries(offsets) as [Item, Vec3][]) {
      const m = this.itemMesh(item, 0.7);
      m.position.set(...at);
      m.visible = false;
      this.envelope.add(m);
      this.carry.set(item, m);
    }
    this.envelope.visible = false;
    this.root.add(this.envelope);
    this.billboards.push(this.envelope);
  }

  /** 물건 모양: 쿠키(점 박힌 원), 토큰(열쇠), 스크립트(공격색 블록), 데이터(쌓인 상자), 돈(금색 원) */
  itemMesh(item: Item, scale = 1): Group {
    const g = new Group();
    g.scale.setScalar(scale);
    const flat = (geo: BufferGeometry, key: ColorKey, at: Vec3 = [0, 0, 0], emissive = 0.3) => {
      const m = new Mesh(geo, this.std(key, { emissive }));
      m.position.set(...at);
      g.add(m);
    };
    switch (item) {
      case "cookie":
        flat(new CircleGeometry(0.24, 32), "gold");
        for (const at of [[-0.08, 0.06, 0.01], [0.09, 0.02, 0.01], [-0.01, -0.1, 0.01]] as Vec3[]) flat(new CircleGeometry(0.035, 12), "objectAttack", at, 0);
        break;
      case "token":
        flat(new TorusGeometry(0.11, 0.04, 8, 24), "defense", [-0.12, 0, 0], 0.6);
        flat(new BoxGeometry(0.26, 0.06, 0.04), "defense", [0.1, 0, 0], 0.6);
        flat(new BoxGeometry(0.05, 0.1, 0.04), "defense", [0.2, -0.06, 0], 0.6);
        break;
      case "script":
        flat(new BoxGeometry(0.42, 0.3, 0.05), "attack", [0, 0, 0], 0.6);
        break;
      case "data":
        for (let i = 0; i < 3; i++) flat(new BoxGeometry(0.36, 0.1, 0.2), "neutral", [0, i * 0.12 - 0.12, 0], 0.4);
        break;
      case "coin":
        flat(new CircleGeometry(0.2, 32), "gold", [0, 0, 0], 0.5);
        break;
    }
    return g;
  }

  setEnvelopeTone(tone: Tone) {
    this.envTone = tone;
    this.envMat.color.set(this.palette[tone]);
    this.envMat.emissive = new Color(this.palette[tone]).multiplyScalar(0.35);
  }

  setGateTone(id: string, tone: Tone) {
    for (const m of this.nodes.get(id)?.gate?.toneMats ?? []) {
      m.color.set(this.palette[tone]);
      m.emissive = new Color(this.palette[tone]).multiplyScalar(0.6);
    }
  }

  showStamp(text: string, at: Vector3) {
    paintStamp(this.stampPaint, text, this.palette);
    this.stamp.position.copy(at);
    this.stamp.visible = true;
  }

  showCard(lines: readonly string[]) {
    paintCard(this.cardPaint, lines, this.palette);
  }

  /** 보관함·탭·서버가 가진 물건을 그 자리에 표시 */
  setHolding(id: string, item: Item, on: boolean) {
    const node = this.nodes.get(id);
    if (!node) return;
    let slot = node.slots.get(item);
    if (!slot && on) {
      slot = this.itemMesh(item, node.placed.kind === "tab" ? 0.9 : 1);
      const k = node.slots.size;
      const at: Vec3 =
        node.placed.kind === "cookieJar" ? [0, 0.45 + k * 0.1, 0] : node.placed.kind === "tab" ? [0.78 - k * 0.4, -0.5, 0.12] : [0, 3.0 + k * 0.5, 0];
      slot.position.set(...at);
      (node.panel?.pivot ?? node.group).add(slot);
      this.billboards.push(slot);
      node.slots.set(item, slot);
    }
    if (slot) slot.visible = on;
  }

  /** 결과 상태를 그대로 반영한다(타임라인 없이). 단계를 넘기거나 동작 줄이기일 때 */
  applyState(state: SceneState) {
    for (const [id, node] of this.nodes) {
      node.group.visible = !state.hidden.has(id);
      node.group.scale.setScalar(1);
      if (node.panel) node.panel.pivot.rotation.y = state.flipped.has(id) ? Math.PI : 0;
      for (const item of node.slots.keys()) this.setHolding(id, item, false);
      for (const item of state.holdings.get(id)?.keys() ?? []) {
        // 봉투로 배달된 물건 중 쿠키 보관함·탭 밖(서버)의 쿠키는 표시하지 않는다(받은 요청에 붙어 있던 것)
        if (node.placed.kind === "server" && item === "cookie") continue;
        this.setHolding(id, item, true);
      }
      if (node.gate) {
        node.gate.arm.rotation.z = 0;
        this.setGateTone(id, "neutral");
      }
    }
    this.envelope.visible = false;
    this.envelope.userData.roll = 0;
    this.flap.rotation.x = 0;
    for (const m of this.carry.values()) m.visible = false;
    for (const f of this.flyers.values()) f.visible = false;
    for (const c of this.coins) c.visible = false;
    this.stamp.visible = false;
    this.card.visible = false;
    this.repaintScreens(state);
  }

  /** rewrite 효과: 한쪽 화면만 다시 그린다 */
  repaintScreen(id: string, side: "front" | "back", screen: Screen) {
    const node = this.nodes.get(id);
    if (!node?.panel) return;
    paintScreen(node.panel[side], screen, node.actor.site, node.actor.tone === "attack" ? "attack" : "neutral", this.palette);
  }

  repaintScreens(state: SceneState) {
    for (const [id, node] of this.nodes) {
      if (!node.panel) continue;
      const s = state.screens.get(id);
      const tone = node.actor.tone === "attack" ? "attack" : "neutral";
      paintScreen(node.panel.front, s?.front, node.actor.site, tone, this.palette);
      paintScreen(node.panel.back, s?.back, node.actor.site, tone, this.palette);
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof Mesh || o instanceof Line || o instanceof LineSegments) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          (m as MeshBasicMaterial).map?.dispose();
          m.dispose();
        }
      }
    });
  }
}
