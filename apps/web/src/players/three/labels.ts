// 이름·요청·잔액·검사 목록 라벨은 3D 글자가 아니라 HTML(직접 투영). 글자가 선명하고 테마 토큰을 그대로 쓴다 (docs/06 2절)
import type { Camera, Vector3 } from "three";

export type LabelTone = "plain" | "neutral" | "attack" | "defense";
export type CheckRow = { name: string; result: string; status: "ok" | "skip" | "fail" };
export type LabelContent = { title: string; sub?: string; tone?: LabelTone; rows?: CheckRow[] };

type Entry = { el: HTMLDivElement; point: Vector3; visible: boolean };

export class LabelLayer {
  /** 켜면(시작 전 전체 샷) 겹치는 라벨을 위로 비키고, 그래도 겹치면 숨긴다. 앞에 등록된 라벨(JSON의 행위자 순서)이 자리를 먼저 잡는다 */
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
    for (const { el, point, visible } of this.entries.values()) {
      const p = point.clone().project(camera);
      let show = visible && p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2;
      const x = ((p.x + 1) / 2) * width;
      let y = ((1 - p.y) / 2) * height;
      if (show && this.declutter) {
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const box = () => ({ l: x - w / 2, t: y - h, r: x + w / 2, b: y });
        const hits = (a: ReturnType<typeof box>) => placed.some((o) => a.l < o.r && o.l < a.r && a.t < o.b && o.t < a.b);
        for (let tries = 0; hits(box()) && tries < 3; tries++) y -= h + 4;
        if (hits(box()) || y - h < 0) show = false;
        else placed.push(box());
      }
      el.style.opacity = show ? "1" : "0";
      if (show) el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
  }

  dispose() {
    this.root.replaceChildren();
    this.entries.clear();
  }
}
