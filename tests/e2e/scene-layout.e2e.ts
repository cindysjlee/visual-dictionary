// 3D 장면 가독성: 단계마다 연출이 끝나고 카메라가 멈췄을 때, 그 단계의 등장 행위자(출발·목적지·경유지·효과 대상)가
// 모두 화면 안에 있고 서로 20% 넘게 겹치지 않는지 본다. 화면 사각형은 테스트 빌드의 window.__sceneProbe가 준다(픽셀 비교 없음).
// 데스크톱 1440×900 (playwright.config.ts). 용어를 추가하면 대상이 자동으로 늘어난다
import { expect, test, type Page } from "@playwright/test";
import type { Term } from "../../packages/content-schema/src/index.ts";
import { modeDefenses, lastStepIndex, stepView, type Mode } from "../../packages/content-schema/src/scene.ts";
import { terms } from "./terms.ts";

const SCENE_SPEED = 10; // 테스트 빌드 전용 장면 배속(player.e2e.ts와 같은 값)

const MAX_OVERLAP = Number(process.env.MAX_OVERLAP ?? 0.2);
type Rect = { l: number; t: number; r: number; b: number };
type Probe = { settled: boolean; width: number; height: number; rects: Record<string, Rect | undefined>; parents: Record<string, string | undefined>; stamp?: Rect };
/** 라벨끼리·라벨과 도장은 거의 겹치지 않아야 한다(경계에 닿는 정도만 허용) */
const MAX_LABEL_OVERLAP = 0.02;

/** 지금 보이는 HTML 라벨의 사각형(무대 기준 px). data-label: actor-<id>, bal-<id>, gain-<id>, screen-<id>(화면판 내용), checks, packet, note */
const visibleLabels = (page: Page) =>
  page.evaluate(() => {
    type El = { style: { opacity: string }; dataset: { label: string }; textContent: string | null; getBoundingClientRect(): { left: number; top: number; right: number; bottom: number } };
    const doc = (globalThis as unknown as { document: { querySelector(s: string): El; querySelectorAll(s: string): Iterable<El> } }).document;
    const root = doc.querySelector(".scene-labels").getBoundingClientRect();
    return [...doc.querySelectorAll(".scene-labels [data-label]")]
      .filter((el) => el.style.opacity === "1")
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.dataset.label, text: el.textContent ?? "", l: r.left - root.left, t: r.top - root.top, r: r.right - root.left, b: r.bottom - root.top };
      });
  });

/** i단계가 끝난 뒤 보여야 할 화면판 라벨 → 첫 줄. mirrorScreen 행위자와 이 단계에서 rewrite된 판, 내용은 판의 보이는 면 (docs/04 mirrorScreen) */
function expectedScreenLabels(term: Term, mode: Mode, i: number): Map<string, string> {
  const actors = term.scenario.actors;
  type Screen = Term["scenario"]["actors"][number]["screen"];
  const screens = new Map<string, { front?: Screen; back?: Screen }>(actors.map((a) => [a.id, { front: a.screen, back: a.back }]));
  const flipped = new Set<string>();
  const out = new Map<string, string>();
  const shown = new Set<string>();
  for (let k = 0; k <= i; k++) {
    for (const e of stepView(term, mode, k).effects) {
      if (e.type === "flip") flipped.add(e.target);
      if (e.type !== "rewrite") continue;
      screens.set(e.target, { ...screens.get(e.target), [e.side]: e.screen });
      if (k === i) shown.add(e.target);
    }
  }
  for (const a of actors) if (a.mirrorScreen) shown.add(a.id);
  for (const id of shown) {
    const s = flipped.has(id) ? screens.get(id)?.back : screens.get(id)?.front;
    out.set(id, s?.lines[0] ?? s?.title ?? "");
  }
  return out;
}

/** 등장 행위자: 출발·목적지·경유지와 효과가 가리키는 행위자 (docs/04 효과 어휘) */
function involved(term: Term, mode: Mode, i: number): string[] {
  const v = stepView(term, mode, i);
  if (term.scenario.playerType === "stack") {
    // 스택형: 코드 판, 맨 위 프레임, 바로 아래 프레임(반환값을 받거나 기다리는 쪽). pop 단계는 빠지기 전 자리도 센다
    let depth = 0;
    for (let k = 0; k <= i; k++) {
      const a = stepView(term, mode, k).action;
      depth += a === "push" ? 1 : a === "pop" ? -1 : 0;
    }
    return ["code", ...[depth - 1, depth - 2].filter((d) => d >= 0).map((d) => `frame-${d}`)];
  }
  const ids = [v.from, v.to, v.via];
  for (const e of v.effects) {
    for (const [k, val] of Object.entries(e)) if (["target", "into", "at", "to", "from"].includes(k) && val !== "packet") ids.push(val as string);
  }
  return [...new Set(ids.filter((x): x is string => Boolean(x)))];
}

const area = (r: Rect) => Math.max(0, r.r - r.l) * Math.max(0, r.b - r.t);
const overlap = (a: Rect, b: Rect) => {
  const inter = area({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
  return inter / Math.max(1, Math.min(area(a), area(b)));
};
const related = (p: Probe, a: string, b: string) => {
  const ancestors = (id: string) => {
    const out: string[] = [];
    for (let cur = p.parents[id]; cur && !out.includes(cur); cur = p.parents[cur]) out.push(cur);
    return out;
  };
  return ancestors(a).includes(b) || ancestors(b).includes(a);
};

async function selectMode(page: Page, term: Term, mode: Mode) {
  if (mode === null) return;
  await page.getByRole("button", { name: /방어 모드|해결 방법/ }).click();
  if (modeDefenses(term).length > 1) {
    await page.getByRole("group", { name: /^(방어 기법|해결 방법)$/ }).getByRole("button", { name: term.defenses[mode]!.name, exact: true }).click();
  }
}

const probe = (page: Page) => page.evaluate(() => (globalThis as unknown as { __sceneProbe: () => Probe }).__sceneProbe());
const stepEnded = (page: Page, step: number) =>
  page.evaluate(([s]) => ((globalThis as unknown as { __sceneTrace?: { step: number; kind: string }[] }).__sceneTrace ?? []).some((e) => e.step === s && e.kind === "stepEnd"), [step] as const);

for (const term of terms) {
  for (const mode of [null, ...modeDefenses(term)] as Mode[]) {
    const modeName = mode === null ? (term.category === "web-security" ? "공격 흐름" : "기본 흐름") : term.defenses[mode]!.name;
    test(`${term.id} · ${modeName}: 단계마다 등장 행위자가 모두 화면 안에 있고 ${MAX_OVERLAP * 100}% 넘게 겹치지 않는다`, async ({ page }) => {
      // 연출을 재생하지 않고 단계 결과 상태로 바로 간다(동작 줄이기 경로: 결과 적용 → 등장 행위자 샷). 남은 자막 대기는 테스트 배속으로 줄인다
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript((x) => Object.assign(globalThis, { __sceneSpeed: x }), SCENE_SPEED);
      await page.goto(`/terms/${term.id}`);
      await expect(page.locator(".scene3d canvas")).toBeVisible({ timeout: 15_000 });
      await selectMode(page, term, mode);
      const problems: string[] = [];
      for (let i = 0; i <= lastStepIndex(term, mode); i++) {
        await page.evaluate(() => Object.assign(globalThis, { __sceneTrace: [] }));
        await page.getByRole("button", { name: `${i + 1}단계로 이동` }).click();
        await expect.poll(() => stepEnded(page, i), { timeout: 30_000 }).toBe(true);
        await expect.poll(async () => (await probe(page)).settled, { timeout: 15_000 }).toBe(true);
        const p = await probe(page);
        const ids = involved(term, mode, i).filter((id) => p.rects[id]);
        for (const id of ids) {
          const r = p.rects[id]!;
          if (r.l < 0 || r.t < 0 || r.r > p.width || r.b > p.height) problems.push(`${i + 1}단계 ${id}: 화면 밖 (${[r.l, r.t, r.r, r.b].map(Math.round).join(",")})`);
        }
        // 차단 도장은 늘 맨 위에 보이고, 이름표·잔액·검사 목록은 도장을 피하며 서로 겹치지 않는다
        const labels = await visibleLabels(page);
        for (const lb of labels) {
          if (p.stamp && overlap(p.stamp, lb) > MAX_LABEL_OVERLAP) problems.push(`${i + 1}단계 도장↔${lb.id}: ${Math.round(overlap(p.stamp, lb) * 100)}% 겹침`);
        }
        // 화면판 라벨: mirrorScreen 행위자는 늘, 이 단계에서 rewrite된 판은 단계가 끝날 때까지 보이고 첫 줄(상태)이 맞아야 한다
        for (const [id, first] of expectedScreenLabels(term, mode, i)) {
          const lb = labels.find((x) => x.id === `screen-${id}`);
          if (!lb) problems.push(`${i + 1}단계 screen-${id}: 화면판 라벨이 안 보임`);
          else if (!lb.text.startsWith(first)) problems.push(`${i + 1}단계 screen-${id}: "${first}" 대신 "${lb.text}"`);
        }
        const fixed = labels.filter((lb) => /^(actor|bal|gain|screen)-|^checks$/.test(lb.id));
        for (const [k, a] of fixed.entries()) {
          for (const b of fixed.slice(k + 1)) {
            if (overlap(a, b) > MAX_LABEL_OVERLAP) problems.push(`${i + 1}단계 라벨 ${a.id}↔${b.id}: ${Math.round(overlap(a, b) * 100)}% 겹침`);
          }
        }
        for (const [k, a] of ids.entries()) {
          for (const b of ids.slice(k + 1)) {
            if (related(p, a, b)) continue;
            const o = overlap(p.rects[a]!, p.rects[b]!);
            if (o > MAX_OVERLAP) problems.push(`${i + 1}단계 ${a}↔${b}: ${Math.round(o * 100)}% 겹침`);
          }
        }
      }
      expect(problems).toEqual([]);
    });
  }
}
