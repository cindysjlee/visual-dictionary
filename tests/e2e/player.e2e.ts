// 플레이어 E2E: 3D 화면 모양이 아니라 자막·단계 번호·차단 표시로 확인한다.
// 재생 버튼을 눌러 끝까지는 CSRF만, 모든 용어 × 모든 모드는 "다음" 버튼으로 넘기며 확인(용어를 추가하면 대상이 자동으로 늘어난다).
// 3D 연출은 테스트 빌드의 장면 기록(window.__sceneTrace)으로 단계마다 출발·도착·효과·차단이 실제로 일어났는지 본다(픽셀 비교 없음)
import { expect, test, type Page } from "@playwright/test";
import type { Term } from "../../packages/content-schema/src/index.ts";
import { blockTarget, blockingDefenses, lastStepIndex, passesGate, stepView, type Mode } from "../../packages/content-schema/src/scene.ts";
import { terms } from "./terms.ts";

const csrf = terms.find((t) => t.id === "csrf")!;
const TOKEN = csrf.defenses.findIndex((d) => d.name === "CSRF 토큰");
const SAMESITE = csrf.defenses.findIndex((d) => d.name === "SameSite 쿠키");

const player = (page: Page) => page.getByRole("region", { name: "애니메이션 플레이어" });
const stepPos = (page: Page) => player(page).locator(".step-pos");
const captionTitle = (page: Page) => player(page).locator(".caption-title");
const playButton = (page: Page) => player(page).locator(".play-btn");
const stagePlay = (page: Page) => player(page).locator(".stage-play");

async function open(page: Page, id: string, query = "") {
  await page.goto(`/terms/${id}${query}`);
  await expect(playButton(page)).toBeVisible();
}

test("상세 진입: 1단계에서 멈춰 있고, 무대 가운데 재생 버튼을 누르면 사라지며 재생된다", async ({ page }) => {
  await open(page, "csrf");
  await expect(stagePlay(page)).toHaveAttribute("aria-label", "재생");
  await expect(playButton(page)).toHaveAttribute("aria-label", "재생");
  await page.waitForTimeout(6000); // 기다려도 넘어가지 않는다
  await expect(stepPos(page)).toHaveText(/^1 \//);
  await stagePlay(page).click();
  await expect(stagePlay(page)).toHaveCount(0);
  await expect(playButton(page)).toHaveAttribute("aria-label", "일시정지");
  await expect(player(page).locator(".stage-slot")).toBeFocused();
});

test("아래 재생 버튼·스페이스로 시작해도 가운데 버튼이 사라진다", async ({ page }) => {
  await open(page, "csrf");
  await playButton(page).click();
  await expect(stagePlay(page)).toHaveCount(0);
  await expect(playButton(page)).toHaveAttribute("aria-label", "일시정지");

  await open(page, "csrf");
  await player(page).locator(".stage-slot").focus();
  await page.keyboard.press("Space");
  await expect(stagePlay(page)).toHaveCount(0);
  await expect(playButton(page)).toHaveAttribute("aria-label", "일시정지");
});

test("모드 탭을 바꾸면 1단계로 가고 재생 상태는 그대로", async ({ page }) => {
  await open(page, "csrf");
  await player(page).getByRole("button", { name: /방어 모드/ }).click();
  await expect(stagePlay(page)).toBeVisible();
  await expect(playButton(page)).toHaveAttribute("aria-label", "재생");
  await stagePlay(page).click();
  await player(page).getByRole("button", { name: "공격 흐름" }).click();
  await expect(stepPos(page)).toHaveText(/^1 \//);
  await expect(playButton(page)).toHaveAttribute("aria-label", "일시정지");
});

test("CSRF 공격 흐름: 재생 버튼을 누르면 6단계까지 자막과 단계 번호가 맞고 멈춘다", async ({ page }) => {
  await open(page, "csrf");
  await stagePlay(page).click();
  const last = lastStepIndex(csrf, null);
  for (let i = 0; i <= last; i++) {
    await expect(stepPos(page)).toHaveText(`${i + 1} / ${last + 1} 단계`, { timeout: 20_000 });
    await expect(captionTitle(page)).toHaveText(`${i + 1}. ${stepView(csrf, null, i).title}`);
  }
  await expect(playButton(page)).toHaveAttribute("aria-label", "재생", { timeout: 20_000 });
  await expect(stepPos(page)).toHaveText(`${last + 1} / ${last + 1} 단계`);
});

test("CSRF 방어 모드: CSRF 토큰은 5단계 403에서, SameSite는 401에서 차단된다", async ({ page }) => {
  await open(page, "csrf");
  await player(page).getByRole("button", { name: /방어 모드/ }).click();
  await stagePlay(page).click();
  const blocked = csrf.defenses[TOKEN]!.blockedAtStep!;
  await expect(stepPos(page)).toHaveText(`${blocked} / ${blocked} 단계`, { timeout: 90_000 });
  await expect(playButton(page)).toHaveAttribute("aria-label", "재생", { timeout: 20_000 });
  await expect(captionTitle(page)).toHaveText(`${blocked}. ${csrf.defenses[TOKEN]!.blockedTitle}`);
  await expect(player(page).locator(".step-seg-btn")).toHaveCount(blocked);
  await expect(page.locator(".scene-label.has-rows")).toContainText("CSRF 토큰");
  await expect(page.locator(".scene-label.has-rows")).toContainText("없음");

  await player(page).getByRole("button", { name: "SameSite 쿠키" }).click();
  await player(page).getByRole("button", { name: `${blocked}단계로 이동` }).click();
  await expect(captionTitle(page)).toHaveText(`${blocked}. ${csrf.defenses[SAMESITE]!.blockedTitle}`);
  await expect(player(page).locator(".caption-text")).toContainText("401");
});

test("재생 속도 2×: 선택 상자가 현재 속도를 알리고, 끝까지 재생되며, 새로고침해도 기억한다", async ({ page }) => {
  await open(page, "csrf");
  const speed = player(page).getByRole("combobox", { name: "재생 속도" });
  await expect(speed).toHaveValue("1");
  await speed.selectOption("2");
  await expect(speed).toHaveValue("2");
  await expect(speed.locator("option:checked")).toHaveText("2×");
  await page.evaluate(() => Object.assign(globalThis, { __sceneTrace: [] }));
  await stagePlay(page).click();
  const last = lastStepIndex(csrf, null);
  await expect(stepPos(page)).toHaveText(`${last + 1} / ${last + 1} 단계`, { timeout: 60_000 });
  await expect(playButton(page)).toHaveAttribute("aria-label", "재생", { timeout: 20_000 });
  // 2×면 단계 연출(+대기)이 1× 기준 시간의 절반 남짓으로 끝난다: 첫 단계 길이를 1×로 다시 재서 비교
  const firstAt = (s: number) =>
    page.evaluate((k) => {
      const tr = (globalThis as unknown as { __sceneTrace: { step: number; kind: string; t: number }[] }).__sceneTrace.filter((e) => e.step === k);
      return tr.find((e) => e.kind === "stepEnd")!.t - tr.find((e) => e.kind === "stepStart")!.t;
    }, s);
  const fast = await firstAt(0);
  await page.reload();
  await expect(player(page).getByRole("combobox", { name: "재생 속도" })).toHaveValue("2");
  await player(page).getByRole("combobox", { name: "재생 속도" }).selectOption("1");
  await page.evaluate(() => Object.assign(globalThis, { __sceneTrace: [] }));
  await player(page).getByRole("button", { name: "1단계로 이동" }).click();
  await expect.poll(() => page.evaluate(() => (globalThis as unknown as { __sceneTrace: { kind: string }[] }).__sceneTrace.some((e) => e.kind === "stepEnd")), { timeout: 30_000 }).toBe(true);
  const normal = await firstAt(0);
  expect(fast / normal).toBeGreaterThan(0.4);
  expect(fast / normal).toBeLessThan(0.62);
});

test("?no3d 2D 대체 화면: 단계 목록과 방어 모드 차단 표시", async ({ page }) => {
  await open(page, "csrf", "?no3d");
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator(".steps2d-item")).toHaveCount(csrf.scenario.steps.length);
  await player(page).getByRole("button", { name: /방어 모드/ }).click();
  await player(page).getByRole("button", { name: "SameSite 쿠키" }).click();
  const blocked = csrf.defenses[SAMESITE]!.blockedAtStep!;
  await expect(page.locator(".steps2d-item")).toHaveCount(blocked);
  await expect(page.locator(".steps2d-item").last()).toContainText(csrf.defenses[SAMESITE]!.blockedLabel!);
});

async function selectMode(page: Page, term: Term, mode: Mode) {
  if (mode === null) return; // 진입 시 공격 흐름
  await player(page).getByRole("button", { name: /방어 모드/ }).click();
  if (blockingDefenses(term).length > 1) {
    await player(page).getByRole("group", { name: "방어 기법" }).getByRole("button", { name: term.defenses[mode]!.name, exact: true }).click();
  }
}

/* ---------- 장면 기록: 기대한 연출이 실제로 일어났는지 (테스트 빌드 전용 기록, apps/web/src/players/three/trace.ts) ---------- */
type Effect = Term["scenario"]["steps"][number]["effects"][number];
type TraceEvent = { step: number; mode: Mode; kind: string; actor?: string; effect?: string; refused?: boolean; inShot?: boolean };
type Rect = { l: number; t: number; r: number; b: number };
type Probe = { settled: boolean; width: number; height: number; rects: Record<string, Rect | undefined> };
const RINGS = new Set(["ringsStart", "ringsEnd"]);

const effectActor = (e: Effect) => ("target" in e ? e.target : "into" in e ? e.into : e.type === "attach" ? e.from : e.type === "inspect" ? e.at : e.to);
const effectKey = (e: Effect, refused = "refused" in e && e.refused) => `effect:${e.type}:${effectActor(e)}${refused ? "!" : ""}`;
const eventKey = (e: TraceEvent) => (e.kind === "effect" ? `effect:${e.effect}:${e.actor}${e.refused ? "!" : ""}` : e.actor ? `${e.kind}:${e.actor}` : e.kind);

/** JSON 규칙(docs/04 "3D 장면 필드"·"방어 모드 동작")으로 정한 한 단계의 기대 이벤트 순서 */
function expectedEvents(term: Term, mode: Mode, i: number): string[] {
  const v = stepView(term, mode, i);
  const self = v.from === v.to;
  const via = v.via && !self && v.via !== v.from && v.via !== v.to ? v.via : undefined;
  const inspect = v.effects.find((e) => e.type === "inspect");
  const gate = passesGate(term, v.from, v.to);
  const out = ["stepStart"];
  if (!self) out.push(`depart:${v.from}`);
  for (const e of v.effects) if (e.type === "attach") out.push(effectKey(e));
  if (via) out.push(`via:${via}`);
  for (const e of v.effects) if (e.type === "give") out.push(effectKey(e));
  if (gate) out.push(`gate:${v.to}`);
  else if (!self) out.push(`arrive:${v.to}`);
  let ended = false;
  if (gate && inspect?.type === "inspect") {
    const failed = inspect.checks.some((c) => c.status === "fail");
    out.push(effectKey(inspect, failed && v.blocked));
    if (failed && v.blocked) {
      out.push(`blocked:${v.to}`);
      ended = true;
    }
  }
  if (gate && !ended) out.push(`arrive:${v.to}`);
  if (!ended && v.roundTrip) out.push(`return:${v.from}`);
  if (!ended) for (const e of v.effects) if (!["attach", "give", "inspect"].includes(e.type)) out.push(effectKey(e));
  if (v.blocked && !inspect) out.push(`blocked:${blockTarget(v)}`);
  out.push("stepEnd");
  return out;
}

for (const term of terms) {
  for (const mode of [null, ...blockingDefenses(term)] as Mode[]) {
    const modeName = mode === null ? "공격 흐름" : term.defenses[mode]!.name;
    test(`${term.id} · ${modeName}: 3D 장면이 단계마다 기대한 출발·도착·효과·차단을 실제로 연출한다`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => Object.assign(globalThis, { __sceneSpeed: 6 }));
      await open(page, term.id);
      await expect(page.locator(".scene3d canvas")).toBeVisible({ timeout: 15_000 }); // 2D 대체 화면으로 넘어가지 않았는지
      await selectMode(page, term, mode);
      for (let i = 0; i <= lastStepIndex(term, mode); i++) {
        await page.evaluate(() => Object.assign(globalThis, { __sceneTrace: [] }));
        await player(page).getByRole("button", { name: `${i + 1}단계로 이동` }).click();
        const events = () =>
          page.evaluate(
            ([step, m]) => ((globalThis as unknown as { __sceneTrace?: TraceEvent[] }).__sceneTrace ?? []).filter((e) => e.step === step && e.mode === m),
            [i, mode] as const,
          );
        await expect.poll(async () => (await events()).some((e) => e.kind === "stepEnd"), { timeout: 30_000, message: `${i + 1}단계 연출이 끝나지 않음` }).toBe(true);
        const got = await events();
        expect(got.filter((e) => !RINGS.has(e.kind)).map(eventKey), `${i + 1}단계`).toEqual(expectedEvents(term, mode, i));

        // 출발 샷이 처음부터 목적지를 담는다(멀리 날아가는 동안 출발지만 비추지 않는다)
        const depart = got.find((e) => e.kind === "depart");
        if (depart) expect(depart.inShot, `${i + 1}단계 출발 샷에 목적지 ${stepView(term, mode, i).to}가 없음`).toBe(true);

        // wifi 전파 고리: 봉투가 그 길목을 지나는 단계에서만 퍼졌다 멈춘다
        const v = stepView(term, mode, i);
        const wifi = term.scenario.actors.filter((a) => a.look === "wifi").map((a) => a.id);
        for (const id of wifi) {
          const passes = v.from !== v.to && [v.via, v.from, v.to].includes(id);
          const rings = got.filter((e) => RINGS.has(e.kind) && e.actor === id).map((e) => e.kind);
          expect(rings, `${i + 1}단계 ${id} 전파 고리`).toEqual(passes ? ["ringsStart", "ringsEnd"] : []);
        }

        // 단계 끝: 카메라가 멈췄을 때 목적지와 효과 대상이 화면 안에 있다
        await expect.poll(() => page.evaluate(() => (globalThis as unknown as { __sceneProbe: () => Probe }).__sceneProbe().settled), { timeout: 15_000 }).toBe(true);
        const probe = await page.evaluate(() => (globalThis as unknown as { __sceneProbe: () => Probe }).__sceneProbe());
        const targets = [v.to, ...v.effects.flatMap((e) => ("target" in e ? [e.target] : "into" in e ? [e.into] : e.type === "inspect" ? [e.at] : e.type === "give" || e.type === "transfer" ? [e.to] : []))];
        for (const id of new Set(targets)) {
          const r = probe.rects[id];
          expect(r && r.l >= 0 && r.t >= 0 && r.r <= probe.width && r.b <= probe.height, `${i + 1}단계 끝 화면에 ${id}가 없음`).toBe(true);
        }
      }
      await expect(page.locator(".steps2d")).toHaveCount(0);
      expect(errors).toEqual([]);
    });

    test(`${term.id} · ${modeName}: "다음" 버튼으로 모든 단계의 자막·단계 번호를 확인`, async ({ page }) => {
      await open(page, term.id);
      await selectMode(page, term, mode);
      const last = lastStepIndex(term, mode);
      await expect(player(page).locator(".step-seg-btn")).toHaveCount(last + 1);
      for (let i = 0; i <= last; i++) {
        await expect(stepPos(page)).toHaveText(`${i + 1} / ${last + 1} 단계`);
        await expect(captionTitle(page)).toHaveText(`${i + 1}. ${stepView(term, mode, i).title}`);
        if (i < last) await player(page).getByRole("button", { name: "다음 단계" }).click();
      }
    });
  }
}
