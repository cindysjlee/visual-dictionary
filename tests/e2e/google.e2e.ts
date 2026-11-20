// 구글 로그인 E2E(@google): 테스트 빌드의 가짜 인증(apps/web/src/features/auth/fake.ts)이 구글 화면 대신 바로 /auth/callback?code=fake로 보낸다.
// 콜백 화면·next 검증·탈퇴 재확인 화면 흐름을 확인한다. 실제 구글·Cognito 경로는 배포 후 smoke와 사람 확인 체크리스트(docs/03)
import { expect, test, type Page } from "@playwright/test";

const tag = { tag: "@google" };
const GOOGLE_EMAIL = "google-user@example.com"; // fake.ts FAKE_GOOGLE_EMAIL
const bar = (page: Page) => page.locator(".topbar");

test("로그인 화면: 계정이 다르다는 안내 → Google로 계속하기 → next로 돌아옴, 새로고침해도 유지, 로그아웃", tag, async ({ page }) => {
  await page.goto("/auth/login?next=%2Fterms%2Fcsrf");
  await expect(page.locator(".google-note")).toHaveText(/구글 로그인과 이메일 가입은 서로 다른 계정이에요/);
  await expect(page.locator(".auth-divider")).toHaveText("또는 이메일로");
  await page.getByRole("button", { name: "Google로 계속하기" }).click();
  await expect(page).toHaveURL(/\/terms\/csrf$/);
  await expect(bar(page).getByText(GOOGLE_EMAIL)).toBeVisible();
  await page.reload();
  await expect(bar(page).getByText(GOOGLE_EMAIL)).toBeVisible();
  await bar(page).getByRole("button", { name: "로그아웃" }).click();
  await expect(bar(page).getByRole("link", { name: "로그인" })).toBeVisible();
});

test("가입 화면에도 Google로 계속하기·계정 분리 안내·개인정보처리방침 링크가 있다", tag, async ({ page }) => {
  await page.goto("/auth/signup");
  await expect(page.getByRole("button", { name: "Google로 계속하기" })).toBeVisible();
  await expect(page.locator(".google-note")).toBeVisible();
  await page.locator(".auth-card").getByRole("link", { name: "개인정보처리방침" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "개인정보처리방침" })).toBeVisible();
});

test("콜백: 실패하면 안내와 로그인 링크, 코드 없이 오면 안내, next가 사이트 밖이면 첫 화면으로", tag, async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("fake-google", "fail"));
  await page.goto("/auth/callback?code=fake&state=%2Fme");
  await expect(page.getByRole("alert")).toHaveText("Google 로그인을 끝내지 못했어요. 다시 시도해 주세요.");
  await expect(page.getByRole("link", { name: "로그인 화면으로" })).toBeVisible();

  await page.evaluate(() => localStorage.removeItem("fake-google"));
  await page.goto("/auth/callback");
  await expect(page.getByRole("alert")).toHaveText("로그인 정보가 없어요. 로그인 화면에서 다시 시도해 주세요.");

  await page.goto(`/auth/callback?code=fake&state=${encodeURIComponent("//evil.example.com/x")}`);
  await expect(page).toHaveURL(/\/$/);
  await expect(bar(page).getByText(GOOGLE_EMAIL)).toBeVisible();
});

test("구글 사용자 탈퇴: 비밀번호 칸 없이 Google로 다시 확인 → 탈퇴 버튼 켜짐 → 탈퇴 → 홈 안내, 로그아웃", tag, async ({ page }) => {
  await page.goto("/auth/login?next=%2Fme");
  await page.getByRole("button", { name: "Google로 계속하기" }).click();
  await expect(page).toHaveURL(/\/me$/);
  const section = page.locator(".withdraw");
  await expect(section.getByLabel("비밀번호", { exact: true })).toHaveCount(0);
  const withdrawBtn = section.getByRole("button", { name: "탈퇴하기" });
  await expect(withdrawBtn).toBeDisabled();

  await section.getByRole("button", { name: "Google로 다시 확인" }).click();
  await expect(page).toHaveURL(/\/me\?reauth=1$/);
  await expect(section.getByRole("status")).toHaveText("Google 계정을 다시 확인했어요. 5분 안에 탈퇴해 주세요.");
  await expect(withdrawBtn).toBeEnabled();

  await withdrawBtn.click();
  await page.getByRole("dialog", { name: "정말 탈퇴할까요?" }).getByRole("button", { name: "탈퇴", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "탈퇴했어요" })).toBeVisible();
  await expect(bar(page).getByRole("link", { name: "로그인" })).toBeVisible();
});

test("푸터: 개인정보처리방침 링크 → 문의처 메일", tag, async ({ page }) => {
  await page.goto("/");
  await page.locator(".site-footer").getByRole("link", { name: "개인정보처리방침" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator(".privacy").getByRole("link", { name: "visualdict.help@gmail.com" })).toHaveAttribute("href", "mailto:visualdict.help@gmail.com");
});
