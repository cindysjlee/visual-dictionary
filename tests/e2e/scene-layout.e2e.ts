// 3D 장면 가독성: 단계마다 연출이 끝나고 카메라가 멈췄을 때, 그 단계의 등장 행위자(출발·목적지·경유지·효과 대상)가
// 모두 화면 안에 있고 서로 20% 넘게 겹치지 않는지 본다. 화면 사각형은 테스트 빌드의 window.__sceneProbe가 준다(픽셀 비교 없음).
// 데스크톱 1440×900 (playwright.config.ts). 용어를 추가하면 대상이 자동으로 늘어난다
import { expect, test, type Page } from "@playwright/test";
import type { Term } from "../../packages/content-schema/src/index.ts";
import { blockingDefenses, lastStepIndex, stepView, type Mode } from "../../packages/content-schema/src/scene.ts";
import { terms } from "./terms.ts";

const MAX_OVERLAP = Number(process.env.MAX_OVERLAP ?? 0.2);
type Rect = { l: number; t: number; r: number; b: number };
type Probe = { settled: boolean; width: number; height: number; rects: Record<string, Rect | undefined>; parents: Record<string, string | undefined> };

/** 등장 행위자: 출발·목적지·경유지와 효과가 가리키는 행위자 (docs/04 효과 어휘) */
function involved(term: Term, mode: Mode, i: number): string[] {
  const v = stepView(term, mode, i);
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
  await page.getByRole("button", { name: /방어 모드/ }).click();
  if (blockingDefenses(term).length > 1) {
    await page.getByRole("group", { name: "방어 기법" }).getByRole("button", { name: term.defenses[mode]!.name, exact: true }).click();
  }
}

const probe = (page: Page) => page.evaluate(() => (globalThis as unknown as { __sceneProbe: () => Probe }).__sceneProbe());
const stepEnded = (page: Page, step: number) =>
  page.evaluate(([s]) => ((globalThis as unknown as { __sceneTrace?: { step: number; kind: string }[] }).__sceneTrace ?? []).some((e) => e.step === s && e.kind === "stepEnd"), [step] as const);

for (const term of terms) {
  for (const mode of [null, ...blockingDefenses(term)] as Mode[]) {
    const modeName = mode === null ? "공격 흐름" : term.defenses[mode]!.name;
    test(`${term.id} · ${modeName}: 단계마다 등장 행위자가 모두 화면 안에 있고 ${MAX_OVERLAP * 100}% 넘게 겹치지 않는다`, async ({ page }) => {
      await page.addInitScript(() => Object.assign(globalThis, { __sceneSpeed: 6 }));
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
