// 플레이어 E2E: 3D 화면 모양이 아니라 자막·단계 번호·차단 표시로 확인한다.
// 자동 재생 끝까지는 CSRF만, 나머지 용어는 "다음" 버튼으로 넘기며 확인(용어를 추가하면 대상이 자동으로 늘어난다)
import { readdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { termSchema, type Term } from "../../packages/content-schema/src/index.ts";
import { lastStepIndex, stepView } from "../../packages/content-schema/src/scene.ts";

const dir = new URL("../../content/terms/", import.meta.url);
const published: Term[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => termSchema.parse(JSON.parse(readFileSync(new URL(f, dir), "utf8"))))
  .filter((t) => t.status === "published");
const csrf = published.find((t) => t.id === "csrf")!;
const TOKEN = csrf.defenses.findIndex((d) => d.name === "CSRF 토큰");
const SAMESITE = csrf.defenses.findIndex((d) => d.name === "SameSite 쿠키");

const player = (page: Page) => page.getByRole("region", { name: "애니메이션 플레이어" });
const stepPos = (page: Page) => player(page).locator(".step-pos");
const captionTitle = (page: Page) => player(page).locator(".caption-title");
const playButton = (page: Page) => player(page).locator(".play-btn");

async function open(page: Page, id: string, query = "") {
  await page.goto(`/terms/${id}${query}`);
  await expect(playButton(page)).toBeVisible();
}

test("CSRF 공격 흐름: 자동 재생으로 6단계까지 자막과 단계 번호가 맞고 멈춘다", async ({ page }) => {
  await open(page, "csrf");
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
  const blocked = csrf.defenses[TOKEN]!.blockedAtStep!;
  await expect(stepPos(page)).toHaveText(`${blocked} / ${blocked} 단계`, { timeout: 60_000 });
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

for (const term of published) {
  test(`${term.id}: "다음" 버튼으로 모든 단계의 자막·단계 번호를 확인`, async ({ page }) => {
    await open(page, term.id);
    await player(page).getByRole("button", { name: "1단계로 이동" }).click(); // 자동 재생을 멈추고 1단계부터
    const last = lastStepIndex(term, null);
    for (let i = 0; i <= last; i++) {
      await expect(stepPos(page)).toHaveText(`${i + 1} / ${last + 1} 단계`);
      await expect(captionTitle(page)).toHaveText(`${i + 1}. ${stepView(term, null, i).title}`);
      if (i < last) await player(page).getByRole("button", { name: "다음 단계" }).click();
    }
  });
}
