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
  await expect(card(page)).toContainText("밑줄 그음 · 읽음");
  await card(page).getByRole("button", { name: "밑줄 지우기" }).click();
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

test("색인: 읽은 표제어 밑줄, 읽음 걸러 보기(분야·검색과 함께), 전체·분야별 밑줄 장부", tag, async ({ page }) => {
  await signedIn(page, "home@example.com");
  await seedRecords(page, "home@example.com", { csrf: true, xss: false });
  await page.goto("/terms");
  const index = await page.evaluate(async () => (await (await fetch("/content/index.json")).json()) as { id: string; category: string; name: string }[]);
  const web = index.filter((t) => t.category === "web-security").length;
  await expect(page.locator(".progress-total")).toHaveText(`1 / ${index.length} 표제어에 밑줄`);
  await expect(page.locator(".progress-cats li").filter({ hasText: "웹 보안" })).toContainText(`1/${web}`);

  // → 참조에도 다른 표제어 이름이 나오므로 표제어 이름으로 고른다
  const entry = (name: string) => list(page).locator(".term-card", { has: page.locator(".term-card-name", { hasText: new RegExp("^" + name + "$") }) });
  const csrfCard = entry("CSRF");
  await expect(csrfCard.locator(".tag-read")).toHaveText("(읽음)");
  await expect(csrfCard.locator(".la-hl.is-on")).toHaveText("CSRF");
  await expect(entry("XSS").locator(".tag-read")).toHaveCount(0);

  const readGroup = page.getByRole("group", { name: "읽음 상태" });
  await readGroup.getByRole("button", { name: "읽음", exact: true }).click();
  expect(await cardNames(page)).toEqual(["CSRF"]);
  await readGroup.getByRole("button", { name: "안 읽음" }).click();
  expect(await cardNames(page)).not.toContain("CSRF");
  expect(await cardNames(page)).toHaveLength(index.length - 1);
  // 카테고리와 함께: 네트워크 + 읽음 → 없음
  await readGroup.getByRole("button", { name: "읽음", exact: true }).click();
  await page.getByRole("group", { name: "카테고리" }).getByRole("button", { name: "네트워크" }).click();
  await expect(list(page)).toContainText("찾는 표제어가 없어요");
  await page.getByRole("button", { name: "전체 목록 보기" }).click();
  expect(await cardNames(page)).toHaveLength(index.length);
});

test("/me 내 단어장: 로그아웃 상태면 로그인으로 보내고, 로그인하면 밑줄 장부·밑줄 친/안 친 표제어를 보인다(axe)", tag, async ({ page }) => {
  await page.goto("/me");
  await expect(page).toHaveURL(/\/auth\/login\?next=%2Fme$/);

  await signedIn(page, "me@example.com");
  await seedRecords(page, "me@example.com", { deadlock: true });
  await page.goto("/me");
  await expect(page.getByRole("heading", { level: 1, name: "내 단어장" })).toBeVisible();
  await expect(page.getByRole("region", { name: /^밑줄 친 표제어/ })).toContainText("데드락");
  await expect(page.locator(".progress-total")).toContainText("1 / ");
  await expect(page.getByRole("navigation", { name: "주 메뉴" }).getByRole("link", { name: "내 단어장" })).toHaveAttribute("aria-current", "page");
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
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("status").filter({ hasText: "탈퇴했어요" })).toBeVisible();
  await expect(page.locator(".topbar").getByRole("link", { name: "로그인" })).toBeVisible();
  const left = await page.evaluate(() => ({
    users: JSON.parse(localStorage.getItem("fake-auth-users") ?? "{}"),
    progress: JSON.parse(localStorage.getItem("fake-progress") ?? "{}"),
  }));
  expect(left.users["bye@example.com"]).toBeUndefined();
  expect(left.progress["bye@example.com"]).toBeUndefined();
});

/* ---------- 최근 본 용어(@activity, FR-PRG-06) ---------- */
const activity = { tag: ["@activity", "@progress"] };

test("상세를 열면 최근 본 용어에 남고, 색인은 읽다 만 표제어에 책갈피와 최근 3개, /me는 날짜와 함께", activity, async ({ page }) => {
  await page.goto("/terms");
  await expect(page.locator(".term-card").first()).toBeVisible();
  await expect(page.locator(".la-resume")).toHaveCount(0); // 로그아웃 상태: 책갈피 없음
  await signedIn(page, "recent@example.com");
  for (const id of ["csrf", "deadlock", "xss"]) {
    await page.goto(`/terms/${id}`);
    await expect(page.locator(".study-card")).toContainText("아직 안 읽음"); // 로그인 상태로 상세가 뜬 뒤
  }
  await page.goto("/terms");
  // 책갈피: 최근 본 것 중 아직 안 읽은 가장 최근 표제어
  const index = page.getByRole("region", { name: "용어 목록" });
  await expect(index.locator(".term-card", { has: page.locator(".term-card-name", { hasText: /^XSS$/ }) }).locator(".la-resume")).toBeVisible();
  await expect(index.locator(".la-resume")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "최근 본 용어" }).getByRole("link")).toHaveText(["XSS", "데드락", "CSRF"]);

  await page.goto("/me");
  const list = page.locator(".recent-list li");
  await expect(list).toHaveCount(3);
  await expect(list.first()).toContainText("XSS");
  await expect(list.first()).toContainText("오늘");
});

test("최근 본 용어 기록이 실패해도 상세·색인은 그대로(책갈피 없음)", activity, async ({ page }) => {
  await signedIn(page, "recent-offline@example.com");
  await page.evaluate(() => localStorage.setItem("fake-progress-fail", "1"));
  await page.goto("/terms/csrf");
  await expect(page.getByRole("heading", { level: 1, name: "CSRF" })).toBeVisible();
  await page.goto("/terms");
  await expect(page.locator(".term-card").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "용어 목록" }).locator(".la-resume")).toHaveCount(0);
});
