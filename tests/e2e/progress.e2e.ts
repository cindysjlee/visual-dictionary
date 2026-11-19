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

/** 가짜 기록 API에 기록을 넣는다 */
async function seedRecords(page: Page, email: string, records: Record<string, boolean>) {
  await page.evaluate(
    ([e, r]) => {
      const rows = Object.fromEntries(Object.entries(r as Record<string, boolean>).map(([id, read]) => [id, { termId: id, read, source: "manual", updatedAt: "2026-01-01T00:00:00Z" }]));
      localStorage.setItem("fake-progress", JSON.stringify({ [e as string]: rows }));
    },
    [email, records] as const,
  );
}

const list = (page: Page) => page.getByRole("region", { name: "용어 목록" }).or(page.locator('section[aria-label="용어 목록"]'));
const cardNames = (page: Page) => list(page).locator(".term-card-name").allTextContents();

test("홈: 카드 읽음 표시, 읽음 필터(카테고리·검색과 함께), 전체·카테고리별 진행률", tag, async ({ page }) => {
  await signedIn(page, "home@example.com");
  await seedRecords(page, "home@example.com", { csrf: true, xss: false });
  await page.goto("/");
  const index = await page.evaluate(async () => (await (await fetch("/content/index.json")).json()) as { id: string; category: string; name: string }[]);
  const web = index.filter((t) => t.category === "web-security").length;
  await expect(page.locator(".progress-total")).toHaveText(`1 / ${index.length} 용어를 읽었어요`);
  await expect(page.locator(".progress-cats li").filter({ hasText: "웹 보안" })).toContainText(`1/${web}`);

  const csrfCard = list(page).locator(".term-card").filter({ hasText: "CSRF" });
  await expect(csrfCard.locator(".tag-read")).toHaveText("✓ 읽음");
  await expect(list(page).locator(".term-card").filter({ hasText: "XSS" }).locator(".tag-read")).toHaveCount(0);

  const readGroup = page.getByRole("group", { name: "읽음 상태" });
  await readGroup.getByRole("button", { name: "읽음", exact: true }).click();
  expect(await cardNames(page)).toEqual(["CSRF"]);
  await readGroup.getByRole("button", { name: "안 읽음" }).click();
  expect(await cardNames(page)).not.toContain("CSRF");
  expect(await cardNames(page)).toHaveLength(index.length - 1);
  // 카테고리와 함께: 네트워크 + 읽음 → 없음
  await readGroup.getByRole("button", { name: "읽음", exact: true }).click();
  await page.getByRole("group", { name: "카테고리" }).getByRole("button", { name: "네트워크" }).click();
  await expect(list(page)).toContainText("찾는 용어가 없어요");
  await page.getByRole("button", { name: "전체 목록 보기" }).click();
  expect(await cardNames(page)).toHaveLength(index.length);
});

test("/me: 로그아웃 상태면 로그인으로 보내고, 로그인하면 진행률·읽은/안 읽은 용어를 보인다(axe)", tag, async ({ page }) => {
  await page.goto("/me");
  await expect(page).toHaveURL(/\/auth\/login\?next=%2Fme$/);

  await signedIn(page, "me@example.com");
  await seedRecords(page, "me@example.com", { deadlock: true });
  await page.goto("/me");
  await expect(page.getByRole("heading", { name: "내 학습" })).toBeVisible();
  await expect(page.locator(".card").filter({ hasText: "읽은 용어" }).first()).toContainText("데드락");
  await expect(page.getByRole("navigation", { name: "주 메뉴" }).getByRole("link", { name: "내 학습" })).toHaveAttribute("aria-current", "page");
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});

test("탈퇴: 틀린 비밀번호면 버튼이 꺼진 채, 맞으면 켜지고, 대화상자에서 취소·확인 → 계정과 기록 삭제, 로그아웃", tag, async ({ page }) => {
  await signedIn(page, "bye@example.com");
  await seedRecords(page, "bye@example.com", { csrf: true });
  await page.goto("/me");
  const section = page.locator(".withdraw");
  const withdrawBtn = section.getByRole("button", { name: "탈퇴하기" });
  await expect(withdrawBtn).toBeDisabled();

  await section.getByLabel("비밀번호", { exact: true }).fill("wrong1234");
  await section.getByRole("button", { name: "비밀번호 확인" }).click();
  await expect(section.getByRole("alert")).toContainText("비밀번호가 맞지 않아요");
  await expect(withdrawBtn).toBeDisabled();

  await section.getByLabel("비밀번호", { exact: true }).fill(PW);
  await section.getByRole("button", { name: "비밀번호 확인" }).click();
  await expect(withdrawBtn).toBeEnabled();

  await withdrawBtn.click();
  const dialog = page.getByRole("dialog", { name: "정말 탈퇴할까요?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "취소" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/me$/);

  await withdrawBtn.click();
  await dialog.getByRole("button", { name: "탈퇴", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("status").filter({ hasText: "탈퇴했어요" })).toBeVisible();
  await expect(page.locator(".topbar").getByRole("link", { name: "로그인" })).toBeVisible();
  const left = await page.evaluate(() => ({
    users: JSON.parse(localStorage.getItem("fake-auth-users") ?? "{}"),
    progress: JSON.parse(localStorage.getItem("fake-progress") ?? "{}"),
  }));
  expect(left.users["bye@example.com"]).toBeUndefined();
  expect(left.progress["bye@example.com"]).toBeUndefined();
});
