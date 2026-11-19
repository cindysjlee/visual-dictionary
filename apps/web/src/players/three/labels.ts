// 이름·요청·잔액·검사 목록 라벨은 3D 글자가 아니라 HTML(직접 투영). 글자가 선명하고 테마 토큰을 그대로 쓴다 (docs/06 2절)
import type { Camera, Vector3 } from "three";

export type LabelTone = "plain" | "neutral" | "attack" | "defense";
export type CheckRow = { name: string; result: string; status: "ok" | "skip" | "fail" };
export type LabelContent = { title: string; sub?: string; tone?: LabelTone; rows?: CheckRow[] };

type Entry = { el: HTMLDivElement; point: Vector3; visible: boolean };

/** 행위자에 붙은 고정 라벨(이름·잔액·받은 돈). 재생 중에도 서로 겹치면 비킨다. 봉투·안내·검사 라벨은 움직이므로 비키지 않고 위에 그린다 */
const STATIC_LABEL = /^(actor|bal|gain)-/;

export class LabelLayer {
  /** 켜면(시작 전 전체 샷) 가운데 재생 버튼 자리도 비우고, 모든 라벨을 비키게 한다 */
  declutter = false;
  private entries = new Map<string, Entry>();
  private root: HTMLDivElement;
  constructor(root: HTMLDivElement) {
    this.root = root;
  }

  set(id: string, point: Vector3, content: LabelContent, visible = true) {
    let entry = this.entries.get(id);
    if (!entry) {
      const el = document.createElement("div");
      this.root.appendChild(el);
      entry = { el, point, visible };
      this.entries.set(id, entry);
    }
    entry.point = point;
    entry.visible = visible;
    const { el } = entry;
    el.className = `scene-label tone-${content.tone ?? "plain"}${content.rows ? " has-rows" : ""}`;
    el.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = content.title;
    el.appendChild(title);
    if (content.sub) {
      const sub = document.createElement("small");
      sub.textContent = content.sub;
      el.appendChild(sub);
    }
    for (const row of content.rows ?? []) {
      const r = document.createElement("span");
      r.className = `scene-check is-${row.status}`;
      const n = document.createElement("span");
      n.textContent = row.name;
      const v = document.createElement("em");
      v.textContent = row.result;
      r.append(n, v);
      el.appendChild(r);
    }
  }

  show(id: string, visible: boolean) {
    const entry = this.entries.get(id);
    if (entry) entry.visible = visible;
  }

  /** 매 프레임: 3D 점을 화면 좌표로 투영해 옮긴다 (CSSOM이라 CSP style-src 'self'에 걸리지 않음) */
  update(camera: Camera, width: number, height: number) {
    // 시작 전에는 무대 가운데에 큰 재생 버튼(.stage-play, 88px)이 있으므로 그 자리도 비워 둔다
    const half = 52;
    const placed: { l: number; t: number; r: number; b: number }[] = this.declutter
      ? [{ l: width / 2 - half, t: height / 2 - half, r: width / 2 + half, b: height / 2 + half }]
      : [];
    // 움직이는 라벨(봉투·안내·검사)이 먼저 자리를 잡고(움직이지 않음), 고정 라벨은 그 자리까지 피한다
    const ordered = [...this.entries].sort(([a], [b]) => Number(STATIC_LABEL.test(a)) - Number(STATIC_LABEL.test(b)));
    for (const [id, { el, point, visible }] of ordered) {
      const avoid = this.declutter || STATIC_LABEL.test(id);
      const p = point.clone().project(camera);
      let show = visible && p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2;
      const x = ((p.x + 1) / 2) * width;
      let y = ((1 - p.y) / 2) * height;
      // 겹치는 라벨을 위로 비키고, 그래도 겹치면 숨긴다. 앞에 등록된 라벨(JSON의 행위자 순서)이 자리를 먼저 잡는다
      if (show && avoid) {
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const box = () => ({ l: x - w / 2, t: y - h, r: x + w / 2, b: y });
        const hits = (a: ReturnType<typeof box>) => placed.some((o) => a.l < o.r && o.l < a.r && a.t < o.b && o.t < a.b);
        const y0 = y;
        for (let tries = 0; hits(box()) && tries < 3; tries++) y -= h + 4;
        // 위로 자리가 없으면(화면 위 끝 포함) 아래로도 찾아본다
        if (hits(box()) || y - h < 0) for (let tries = 1, base = y0; tries <= 3 && (hits(box()) || y - h < 0 || y > height); tries++) y = base + tries * (h + 4);
        if (hits(box()) || y - h < 0 || y > height) show = false;
        else placed.push(box());
      } else if (show) placed.push({ l: x - el.offsetWidth / 2, t: y - el.offsetHeight, r: x + el.offsetWidth / 2, b: y });
      el.style.opacity = show ? "1" : "0";
      if (show) el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
  }

  dispose() {
    this.root.replaceChildren();
    this.entries.clear();
  }
}
