// 행위자 종류(kind)별 3D 물체를 만든다. 용어별 코드 없음: layoutScene의 배치와 JSON의 kind·tone·gate·screen만 읽는다
import {
  Box3,
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
  type Camera,
  type Material,
} from "three";
import type { Actor, Item, Term } from "@app/content-schema";
import { hasPanel } from "@app/content-schema/scene";
import { BROWSER_SIZE, type Placed, type Vec3 } from "./layout.ts";
import type { SceneState, Screen } from "./sceneState.ts";
import { paintCard, paintScreen, paintSign, paintStamp, screenPainter, signPainter, type Painter } from "./textures.ts";
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
  /** wifi look의 전파 고리. 봉투가 가까이 지날 때만 퍼진다(pulseRings) */
  rings?: Mesh[];
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
  private signs: { painter: Painter; text: string; tone: "attack" | "neutral" }[] = [];

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
    this.stamp = plane(this.stampPaint, 3.6, 1.65);
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
    for (const sg of this.signs) paintSign(sg.painter, sg.text, sg.tone, palette);
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
    // 엇갈려 높인 섬(layout STAGGER)은 바닥까지 받침 기둥을 세운다
    const lift = parent.position.y;
    if (lift > 0.01) this.mesh(new CylinderGeometry(radius * 0.35, radius * 0.5, lift, 24), this.std("objectDim"), [0, -lift / 2, 0], parent);
  }

  private buildActor(actor: Actor) {
    const placed = this.layout.get(actor.id)!;
    const group = new Group();
    group.position.copy(v(placed.position));
    this.root.add(group);
    const tone: Tone = actor.tone === "attack" ? "attack" : "neutral";
    const node: ActorNode = { actor, placed, group, labelPoint: new Vector3(), slots: new Map() };
    let labelY = 2.4;
    let labelAt: Vector3 | undefined;

    if (actor.look) {
      labelY = this.buildLook(actor, node, tone);
      if (placed.gate) node.gate = this.buildGate(placed, group);
      if (hasPanel(actor) && !node.panel) node.panel = this.buildStandPanel(group, tone);
    } else switch (placed.kind) {
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
        // 이름표는 상자 왼쪽 바깥 앞: 위에 두면 위에서 내려다볼 때 안쪽 탭 이름표와 겹친다
        labelAt = new Vector3(-w / 2 - 1.1, h * 0.55, d / 2);
        break;
      }
      case "tab": {
        node.panel = this.buildPanel(group, tone);
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
          // 신전형 건물: 바닥판 → 기둥·본체 → 기둥을 받치는 판 → 지붕. 폭 2.6, 깊이 1.7로 위아래를 맞춘다
          this.mesh(new BoxGeometry(2.6, 0.24, 1.7), this.std("objectDim"), [0, 0.42, 0], group);
          this.mesh(new BoxGeometry(2.0, 1.1, 0.9), this.std("object"), [0, 1.09, -0.3], group);
          for (const x of [-1.0, -0.34, 0.34, 1.0]) this.mesh(new CylinderGeometry(0.11, 0.11, 1.1, 16), this.std("object"), [x, 1.09, 0.5], group);
          this.mesh(new BoxGeometry(2.6, 0.2, 1.7), this.std("objectDim"), [0, 1.74, 0], group);
          // 사각뿔을 도형 단계에서 45° 돌려 변을 축에 맞춘 뒤 깊이만 줄인다(메시 회전 + 크기 조정은 찌그러진다)
          const roofGeo = new ConeGeometry(1.3 * Math.SQRT2, 0.6, 4);
          roofGeo.rotateY(Math.PI / 4);
          const roof = this.mesh(roofGeo, this.std("objectDim"), [0, 2.14, 0], group);
          roof.scale.set(1, 1, 1.7 / 2.6);
          labelY = 2.9;
        }
        if (placed.gate) node.gate = this.buildGate(placed, group);
        if (hasPanel(actor)) node.panel = this.buildStandPanel(group, tone);
        break;
      }
      case "database": {
        this.island(group, 1.8);
        for (let i = 0; i < 3; i++) this.mesh(new CylinderGeometry(0.8, 0.8, 0.45, 32), this.std("object"), [0, 0.55 + i * 0.5, 0], group);
        if (hasPanel(actor)) node.panel = this.buildStandPanel(group, tone);
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
    node.labelPoint.copy(group.position).add(labelAt ?? new Vector3(0, labelY, 0));
    this.nodes.set(actor.id, node);
    // 가림 자동 투명은 모든 행위자 대상. 어느 행위자의 메시인지 적어 두어, 그 행위자를 보려는 시선에서는 자기 자신을 흐리지 않는다
    group.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.userData.actor = actor.id;
      if (!this.occluders.includes(o)) this.occluders.push(o);
    });
  }

  /** 간판·주소판(행위자 site를 글자로). 테마가 바뀌면 다시 그린다 */
  private sign(parent: Object3D, text: string | undefined, tone: Tone, at: Vec3, w: number, h: number, tiltX = 0) {
    if (!text) return;
    const painter = signPainter();
    const t = tone === "attack" ? "attack" : "neutral";
    this.signs.push({ painter, text, tone: t });
    paintSign(painter, text, t, this.palette);
    const m = this.mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: painter.texture, transparent: true, toneMapped: false }), at, parent);
    m.rotation.x = tiltX;
    m.castShadow = false;
  }

  /**
   * 생김새(look, docs/06 2절). 모두 기본 도형 조합이고 외부 모델 파일은 쓰지 않는다. 공격 쪽(tone: attack)은 어두운 재질에 공격색 띠.
   * 돌려주는 값은 이름 라벨 높이
   */
  private buildLook(actor: Actor, node: ActorNode, tone: Tone): number {
    const g = node.group;
    const attack = tone === "attack";
    const body: ColorKey = attack ? "objectAttack" : "object";
    const dim: ColorKey = attack ? "objectAttack" : "objectDim";
    const glow = (key: ColorKey, emissive: number) => this.std(key, { emissive });
    const box = (w: number, h: number, d: number, at: Vec3, mat: Material = this.std(body)) => this.mesh(new BoxGeometry(w, h, d), mat, at, g);
    const cyl = (r: number, h: number, at: Vec3, mat: Material = this.std(body), seg = 32) => this.mesh(new CylinderGeometry(r, r, h, seg), mat, at, g);
    /** 공격 쪽 띠(색만이 아니라 형태로도 구분: 위쪽 가장자리를 두른다) */
    const stripe = (w: number, d: number, y: number) => {
      if (attack) box(w + 0.06, 0.06, d + 0.06, [0, y, 0], glow("attack", 0.8));
    };
    const site = actor.site;

    switch (actor.look!) {
      case "bank": {
        // 기둥 건물(바닥판 → 본체·기둥 → 받침판 → 지붕) + 오른쪽 앞 금고(상자 + 둥근 문 + 손잡이)
        this.island(g);
        box(2.6, 0.24, 1.7, [0, 0.42, 0], this.std(dim));
        box(2.0, 1.1, 0.9, [-0.1, 1.09, -0.3]);
        for (const x of [-1.0, -0.34, 0.34, 1.0]) cyl(0.11, 1.1, [x - 0.1, 1.09, 0.5], this.std(body), 16);
        box(2.6, 0.2, 1.7, [0, 1.74, 0], this.std(dim));
        const roofGeo = new ConeGeometry(1.3 * Math.SQRT2, 0.6, 4);
        roofGeo.rotateY(Math.PI / 4);
        this.mesh(roofGeo, this.std(dim), [0, 2.14, 0], g).scale.set(1, 1, 1.7 / 2.6);
        this.sign(g, site, tone, [0, 2.12, 0.6], 1.7, 0.4, -0.35);
        box(0.8, 0.8, 0.7, [1.65, 0.7, 0.75], this.std(dim));
        cyl(0.27, 0.06, [1.65, 0.7, 1.12], glow("gold", 0.2)).rotation.x = Math.PI / 2;
        box(0.22, 0.05, 0.05, [1.65, 0.7, 1.17]);
        stripe(2.6, 1.7, 1.86);
        return 2.9;
      }
      case "web": {
        // 랙 서버: 납작한 칸 4개(칸마다 표시등·슬롯) + 위에 사이트 이름이 뜬 작은 모니터
        this.island(g);
        for (let i = 0; i < 4; i++) {
          const y = 0.52 + i * 0.42;
          box(1.5, 0.36, 1.0, [0, y, 0]);
          for (const x of [0.45, 0.6]) this.mesh(new SphereGeometry(0.045, 10, 8), glow(attack ? "attack" : "neutral", 0.9), [x, y, 0.51], g).castShadow = false;
          box(0.9, 0.04, 0.02, [-0.25, y, 0.51], this.std(dim));
        }
        box(0.08, 0.3, 0.08, [0, 2.32, 0], this.std(dim));
        box(1.5, 0.6, 0.1, [0, 2.72, 0], this.std(dim));
        this.sign(g, site, tone, [0, 2.72, 0.06], 1.36, 0.46);
        stripe(1.5, 1.0, 2.16);
        return 3.4;
      }
      case "shop":
      case "community": {
        // 상점 몸통 + 문·창. shop은 줄무늬 차양과 지붕 위 간판, community는 앞 게시판(기둥 2개 위 판에 사이트 이름) + 지붕 위 말풍선
        this.island(g);
        const shop = actor.look === "shop";
        const z = shop ? 0 : -0.35;
        box(2.0, 1.2, 1.3, [0, 0.9, z]);
        box(0.5, 0.75, 0.04, [0.5, 0.68, z + 0.66], this.std(dim));
        box(0.6, 0.4, 0.04, [-0.45, 1.0, z + 0.66], this.std("paper"));
        stripe(2.0, 1.3, 1.5);
        if (shop) {
          for (let i = 0; i < 5; i++) box(0.42, 0.06, 0.6, [-0.84 + i * 0.42, 1.48, 0.86], this.std(i % 2 ? dim : "paper")).rotation.x = 0.35;
          box(1.9, 0.5, 0.08, [0, 1.85, 0.2], this.std(dim));
          this.sign(g, site, tone, [0, 1.85, 0.25], 1.78, 0.42);
          return 2.5;
        }
        for (const x of [-0.95, 0.95]) box(0.1, 1.3, 0.1, [x, 0.95, 0.85], this.std(dim));
        box(2.1, 0.75, 0.08, [0, 1.3, 0.85], this.std(dim));
        this.sign(g, site, tone, [0, 1.3, 0.9], 1.95, 0.6);
        const bubbleMat = glow(attack ? "attack" : "paper", attack ? 0.4 : 0.1);
        this.mesh(new SphereGeometry(0.42, 24, 16), bubbleMat, [0.5, 2.05, -0.35], g).scale.set(1.3, 0.8, 0.5);
        this.mesh(new ConeGeometry(0.12, 0.3, 12), bubbleMat, [0.25, 1.7, -0.35], g).rotation.z = Math.PI * 0.85;
        return 2.8;
      }
      case "database": {
        // 층층 원통 3단 + 위 뚜껑
        this.island(g, 1.8);
        for (let i = 0; i < 3; i++) cyl(0.8, 0.45, [0, 0.55 + i * 0.5, 0]);
        cyl(0.86, 0.08, [0, 1.84, 0], this.std(dim));
        stripe(1.6, 1.6, 1.92);
        return 2.4;
      }
      case "cloud-metadata": {
        // 구름 받침(구 4개) 위에 칩 상자(납작 상자 + 양옆 핀 + 가운데 코어) + 그 위 주소판(site, 예: 169.254.169.254)
        this.island(g);
        for (const [x, y, z, r] of [[-0.6, 0.75, 0, 0.55], [0.1, 0.85, 0.1, 0.7], [0.75, 0.72, -0.05, 0.5], [0, 0.7, -0.45, 0.55]] as const) {
          this.mesh(new SphereGeometry(r, 24, 16), glow(attack ? "objectAttack" : "paper", 0.05), [x, y, z], g).scale.y = 0.7;
        }
        box(1.1, 0.22, 1.1, [0.05, 1.42, 0], this.std(dim));
        for (let i = 0; i < 4; i++) for (const side of [-1, 1]) box(0.16, 0.05, 0.08, [0.05 + side * 0.62, 1.42, -0.39 + i * 0.26], this.std("gold"));
        box(0.5, 0.06, 0.5, [0.05, 1.56, 0], glow(attack ? "attack" : "neutral", 0.5));
        // 주소판은 칩 위에 세운다(앞에 두면 검문소 링에 가린다)
        box(0.08, 0.3, 0.08, [0.05, 1.72, 0], this.std(dim));
        box(2.0, 0.5, 0.06, [0.05, 2.1, 0], this.std(dim));
        this.sign(g, site, tone, [0.05, 2.1, 0.04], 1.86, 0.4);
        return 2.8;
      }
      case "wifi": {
        // 공유기 상자 + 안테나 2개 + 위로 퍼지는 전파 고리 3개(반원). 고리는 봉투가 지날 때만 퍼진다
        this.island(g, 1.6);
        box(1.4, 0.35, 0.9, [0, 0.5, 0]);
        for (const x of [-0.45, 0.45]) cyl(0.04, 0.9, [x, 1.1, -0.2], this.std(dim), 8);
        node.rings = [0.45, 0.75, 1.05].map((r) => {
          const ring = this.mesh(new TorusGeometry(r, 0.04, 8, 40, Math.PI), glow(attack ? "attack" : "neutral", 0.6), [0, 1.0, 0.1], g);
          ring.castShadow = false;
          return ring;
        });
        return 2.4;
      }
      case "laptop": {
        // 키보드 받침(납작 상자 + 터치패드) + 뒤에 세운 화면. screen이 있으면 화면판 자체가 노트북 화면이 된다(옆 화면판 없음)
        this.island(g);
        box(2.5, 0.14, 1.6, [0, 0.42, 0.2]);
        box(2.1, 0.02, 0.8, [0, 0.5, 0.05], this.std(dim));
        box(0.6, 0.02, 0.36, [0, 0.5, 0.72], this.std(dim));
        stripe(2.5, 1.6, 0.52);
        if (hasPanel(actor)) node.panel = this.buildPanel(g, tone, [0, 1.35, -0.55]);
        else box(2.3, 1.6, 0.08, [0, 1.35, -0.55]);
        return 2.6;
      }
      case "printer":
      case "scanner":
        return 2.4; // 점유형(LockScene)이 따로 그린다. 흐름형에서는 쓰지 않는다
    }
  }

  /** wifi 전파 고리: active면 바깥으로 퍼지며 되풀이, 아니면 제자리(봉투가 멀거나 동작 줄이기) */
  pulseRings(id: string, time: number, active: boolean) {
    const rings = this.nodes.get(id)?.rings;
    if (!rings) return;
    rings.forEach((ring, k) => ring.scale.setScalar(1 + (active ? (time * 0.9 + k / rings.length) % 1 : 0) * 0.8));
  }

  /** 앞뒤 화면이 있는 판(탭, 서버·DB 화면). 뒤집기(flip)는 pivot을 돌린다 */
  private buildPanel(parent: Object3D, tone: Tone, at: Vec3 = [0, 0, 0]): NonNullable<ActorNode["panel"]> {
    const pivot = new Group();
    pivot.position.set(...at);
    parent.add(pivot);
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
    return { pivot, front, back };
  }

  /** 서버·DB 옆에 세운 화면판(서버 안에서 일어나는 일: 만들어진 쿼리, 미리보기 결과 등) */
  private buildStandPanel(group: Group, tone: Tone) {
    this.mesh(new BoxGeometry(0.1, 1.2, 0.1), this.std("objectDim"), [2.6, 0.6, 0.6], group);
    return this.buildPanel(group, tone, [2.6, 1.95, 0.6]);
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

  /**
   * 인터넷(점선): 사용자 쪽 → 길목(between) → 서버 구역, 사용자 쪽 → 공격자. 사내망(internal)은 서버 구역에서만 이어진다.
   * 밖에서 사내망으로 바로 가는 선을 긋지 않아 "서버를 거쳐야만 닿는다"가 보이게 한다. 사용자 쪽이 없으면 공격자 쪽에서 긋는다
   */
  private buildInternet() {
    const mat = new LineDashedMaterial({ dashSize: 0.3, gapSize: 0.25, transparent: true, opacity: 0.8 });
    this.bound.push({ mat, key: "grid" });
    this.paint(mat, "grid");
    const roots = [...this.layout.values()].filter((p) => !p.parent);
    const inZone = (zone: Placed["zone"]) => roots.filter((p) => p.zone === zone);
    const link = (a: Placed, b: Placed) => {
      const line = new Line(new BufferGeometry().setFromPoints([v(a.position).setY(0.02), v(b.position).setY(0.02)]), mat);
      line.computeLineDistances();
      this.root.add(line);
    };
    const servers = inZone("server");
    const between = inZone("between");
    const front = inZone("client")[0] ?? inZone("outside")[0];
    if (!front) return;
    for (const p of front.zone === "client" ? inZone("outside") : []) link(front, p);
    for (const b of between) link(front, b);
    for (const s of servers) for (const from of between.length > 0 ? between : [front]) link(from, s);
    for (const i of inZone("internal")) for (const s of servers) link(s, i);
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
        // 서버·인물 등은 오른쪽 앞에 둔다(머리 위면 이름표에 가린다)
        node.placed.kind === "cookieJar" ? [0, 0.45 + k * 0.1, 0] : node.placed.kind === "tab" ? [0.78 - k * 0.4, -0.5, 0.12] : [1.5, 1.2 + k * 0.55, 0.9];
      slot.position.set(...at);
      (node.panel?.pivot ?? node.group).add(slot);
      this.billboards.push(slot);
      node.slots.set(item, slot);
    }
    if (slot) slot.visible = on;
  }

  /** 행위자에서 지금 보이는 부분의 월드 상자(숨은 물건·숨은 행위자 제외). 안 보이면 빈 상자 */
  visibleBox(id: string): Box3 {
    const box = new Box3();
    const node = this.nodes.get(id);
    if (!node?.group.visible) return box;
    this.root.updateMatrixWorld(true);
    const shown = (o: Object3D): boolean => o === node.group || (o.visible && (!o.parent || shown(o.parent)));
    node.group.traverse((o) => {
      if (!(o instanceof Mesh) || !shown(o)) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld));
    });
    return box;
  }

  /** 카메라가 이 행위자를 화면에 담을 때 들어와야 할 점: 보이는 상자의 꼭짓점 + 이름 라벨 자리 */
  framePoints(id: string): Vector3[] {
    const node = this.nodes.get(id);
    if (!node) return [];
    let box = this.visibleBox(id);
    // 아직 숨은 행위자(이 단계에 나타날 대상 등)도 나타날 자리를 담는다: 봉투가 날아가는 목적지가 처음부터 화면에 있어야 한다
    if (box.isEmpty()) {
      const p = new Vector3(...node.placed.position);
      box = new Box3(p.clone().add(new Vector3(-1.2, 0, -0.6)), p.clone().add(new Vector3(1.2, 1.4, 0.6)));
    }
    const { min: a, max: b } = box;
    const corners = [a.x, b.x].flatMap((x) => [a.y, b.y].flatMap((y) => [a.z, b.z].map((z) => new Vector3(x, y, z))));
    // 자식(탭·보관함)이면 부모 이름표 자리도 담는다: 부모 이름표가 화면 가장자리에 잘리지 않게
    const labels: Vector3[] = [];
    for (let n = this.nodes.get(id); n; n = n.actor.parent ? this.nodes.get(n.actor.parent) : undefined) {
      labels.push(n.labelPoint.clone().add(new Vector3(0, 0.55, 0)));
      if (labels.length > 4) break;
    }
    return [...corners, ...labels];
  }

  /** 화면에서 이 행위자가 차지하는 사각형(px). 테스트 빌드의 겹침 검사용 */
  screenRect(id: string, camera: Camera, width: number, height: number) {
    const box = this.visibleBox(id);
    if (box.isEmpty()) return undefined;
    const { min: a, max: b } = box;
    let l = Infinity, t = Infinity, r = -Infinity, btm = -Infinity;
    for (const x of [a.x, b.x]) for (const y of [a.y, b.y]) for (const z of [a.z, b.z]) {
      const p = new Vector3(x, y, z).project(camera);
      const sx = ((p.x + 1) / 2) * width;
      const sy = ((1 - p.y) / 2) * height;
      l = Math.min(l, sx); r = Math.max(r, sx); t = Math.min(t, sy); btm = Math.max(btm, sy);
    }
    return { l, t, r, b: btm };
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
