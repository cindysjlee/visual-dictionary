// 학습 기록 E2E(@progress): 테스트 빌드의 가짜 인증·가짜 기록 API(features/progress/fake.ts) 위에서 화면을 확인한다.
// 실제 API(권한·탈퇴 순서)는 배포 후 npm run smoke:progress가 확인한다
import { expect, test, type Page } from "@playwright/test";

const tag = { tag: "@progress" };
const PW = "abc12345";

/** 로그인된 상태로 시작: 가짜 인증 저장소에 사용자와 세션을 넣는다 */
async function signedIn(page: Page, email: string) {
  await page.goto("/");
  await page.evaluate(
    ([e, pw]) => {
      localStorage.setItem("fake-auth-users", JSON.stringify({ [e]: { password: pw, confirmed: true } }));
      localStorage.setItem("fake-auth-session", e);
    },
    [email, PW] as const,
  );
}

const card = (page: Page) => page.locator(".study-card");

async function playToEnd(page: Page) {
  await page.getByRole("region", { name: "애니메이션 플레이어" }).locator(".stage-play").click();
  await expect(page.getByRole("region", { name: "애니메이션 플레이어" }).locator(".play-btn")).toHaveAttribute("aria-label", "재생", { timeout: 60_000 });
}

test("끝까지 보면 읽음으로 저장되고, 새로고침해도 유지되며, 직접 안 읽음으로 되돌릴 수 있다(read:false로 남음)", tag, async ({ page }) => {
  await page.addInitScript(() => Object.assign(globalThis, { __sceneSpeed: 10 }));
  await signedIn(page, "reader@example.com");
  await page.goto("/terms/csrf");
  await expect(card(page)).toContainText("아직 안 읽음");
  await playToEnd(page);
  await expect(card(page)).toContainText("읽음");
  await expect(card(page)).not.toContainText("아직 안 읽음");

  await page.reload();
  await expect(card(page)).toContainText("✓ 읽음");
  await card(page).getByRole("button", { name: "안 읽음으로 되돌리기" }).click();
  await expect(card(page)).toContainText("아직 안 읽음");
  await page.reload();
  await expect(card(page)).toContainText("아직 안 읽음");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("fake-progress") ?? "{}"));
  expect(stored["reader@example.com"].csrf).toMatchObject({ read: false, source: "manual" });
});

test("기록 API가 실패해도 재생은 끝까지 가고, 저장 실패만 알린다(NFR-02)", tag, async ({ page }) => {
  await page.addInitScript(() => Object.assign(globalThis, { __sceneSpeed: 10 }));
  await signedIn(page, "offline@example.com");
  await page.evaluate(() => localStorage.setItem("fake-progress-fail", "1"));
  await page.goto("/terms/csrf");
  await expect(card(page)).toContainText("기록을 불러오지 못했어요");
  await playToEnd(page);
  await expect(page.locator(".step-pos")).toHaveText(/^6 \/ 6/);
  await expect(page.locator(".steps2d")).toHaveCount(0); // 3D 그대로
});
