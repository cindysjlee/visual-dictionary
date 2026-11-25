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

/** 글 맨 끝의 완독 블록과 제목 줄 오른쪽 위의 작은 도장 */
const end = (page: Page) => page.locator(".la-study-end");
const stamp = (page: Page) => page.locator(".la-term-stamp");

async function playToEnd(page: Page) {
  await page.getByRole("region", { name: "애니메이션 플레이어" }).locator(".stage-play").click();
  await expect(page.getByRole("region", { name: "애니메이션 플레이어" }).locator(".play-btn")).toHaveAttribute("aria-label", "재생", { timeout: 60_000 });
}

test("글 끝 버튼으로 완독을 표시하면 제목 줄에 작은 完 도장(날짜만, 읽어 주는 이름 \"완독함, 날짜\")이 찍히고, 새로고침해도 유지되며, 직접 취소할 수 있다(read:false, manual)", tag, async ({ page }) => {
  await signedIn(page, "reader@example.com");
  await page.goto("/terms/csrf");
  await expect(end(page).getByRole("button", { name: "다 읽었으면 完 도장 찍기" })).toBeVisible();
  await expect(stamp(page)).toHaveCount(0); // 완독 전에는 도장·문구가 없다
  await expect(page.locator(".study-card")).toHaveCount(0); // 오른쪽 세로 열(옛 완독 칸)은 없다
  await end(page).getByRole("button", { name: "다 읽었으면 完 도장 찍기" }).click();

  // 제목 줄 도장: 날짜만, 읽어 주는 이름 "완독함, N년 N월 N일"
  await expect(stamp(page)).toBeVisible();
  await expect(stamp(page)).toHaveAttribute("role", "img");
  await expect(stamp(page)).toHaveAttribute("aria-label", /^완독함, \d{4}년 \d{1,2}월 \d{1,2}일$/);
  await expect(stamp(page).locator(".la-seal-date")).toHaveText(/^\d{4}\.\d{2}\.\d{2}$/);
  await expect(stamp(page)).toHaveClass(/is-press/); // 이 쪽에서 안 읽음 → 완독이 되면 쾅 찍힌다
  // 글 끝 블록: "完 날짜 · 완독 취소"
  await expect(end(page)).toContainText(/^完 \d{4}\.\d{2}\.\d{2} ·\s*완독 취소$/);
  await expect(end(page).getByRole("button", { name: "다 읽었으면 完 도장 찍기" })).toHaveCount(0);

  await page.reload();
  await expect(stamp(page)).toBeVisible();
  await expect(stamp(page)).not.toHaveClass(/is-press/); // 이미 완독한 쪽을 열 때는 그대로
  const undo = end(page).getByRole("button", { name: "완독 취소" });
  await expect(undo).not.toHaveAttribute("aria-pressed");
  await undo.click();
  await expect(end(page).getByRole("button", { name: "다 읽었으면 完 도장 찍기" })).toBeVisible();
  await expect(stamp(page)).toHaveCount(0);
  await page.reload();
  await expect(end(page).getByRole("button", { name: "다 읽었으면 完 도장 찍기" })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("fake-progress") ?? "{}"));
  expect(stored["reader@example.com"].csrf).toMatchObject({ read: false, source: "manual" });
});

test("끝까지 재생하거나 스크롤해도 자동으로 완독이 되지 않는다(버튼으로만)", tag, async ({ page }) => {
  await page.addInitScript(() => Object.assign(globalThis, { __sceneSpeed: 10 }));
  await signedIn(page, "manual@example.com");
  await page.goto("/terms/csrf");
  await playToEnd(page);
  await end(page).scrollIntoViewIfNeeded();
  await expect(end(page).getByRole("button", { name: "다 읽었으면 完 도장 찍기" })).toBeVisible();
  await expect(stamp(page)).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("fake-progress") ?? "{}"));
  expect(stored["manual@example.com"]?.csrf).toBeUndefined();
});
test("기록 API가 실패해도 재생은 끝까지 가고, 글 끝 블록이 안내만 한다(NFR-02)", tag, async ({ page }) => {
  await page.addInitScript(() => Object.assign(globalThis, { __sceneSpeed: 10 }));
  await signedIn(page, "offline@example.com");
  await page.evaluate(() => localStorage.setItem("fake-progress-fail", "1"));
  await page.goto("/terms/csrf");
  await expect(end(page)).toContainText("기록을 불러오지 못했어요");
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

test("색인: 완독한 용어 줄 끝 完 도장(날짜는 화면 읽기·title), 읽음 걸러 보기(분야·검색과 함께), 전체·분야별 진행률", tag, async ({ page }) => {
  await signedIn(page, "home@example.com");
  await seedRecords(page, "home@example.com", { csrf: true, xss: false });
  await page.goto("/terms");
  const index = await page.evaluate(async () => (await (await fetch("/content/index.json")).json()) as { id: string; category: string; name: string }[]);
  const web = index.filter((t) => t.category === "web-security").length;
  await expect(page.locator(".progress-total")).toHaveText(`1 / ${index.length} 완독`);
  await expect(page.locator(".progress-cats li").filter({ hasText: "웹 보안" })).toContainText(`1/${web}`);

  // → 참조에도 다른 표제어 이름이 나오므로 표제어 이름으로 고른다
  const entry = (name: string) => list(page).locator(".term-card", { has: page.locator(".term-card-name", { hasText: new RegExp("^" + name + "$") }) });
  const csrfCard = entry("CSRF");
  await expect(csrfCard.locator(".tag-read")).toHaveText("(완독, 2026년 1월 1일)");
  await expect(csrfCard.getByRole("link", { name: "CSRF (완독, 2026년 1월 1일)" })).toBeVisible();
  await expect(csrfCard.locator(".la-seal-mark")).toHaveAttribute("title", "완독, 2026년 1월 1일");
  await expect(csrfCard.locator(".la-seal-mark svg")).toBeVisible();
  await expect(entry("XSS").locator(".tag-read")).toHaveCount(0);
  await expect(entry("XSS").locator(".la-seal-mark")).toHaveCount(0);

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

test("/me 내 단어장: 로그아웃 상태면 로그인으로 보내고, 로그인하면 분야별 진행률(n/m 완독)·완독한/안 읽은 용어(작은 도장)를 보인다(axe)", tag, async ({ page }) => {
  await page.goto("/me");
  await expect(page).toHaveURL(/\/auth\/login\?next=%2Fme$/);

  await signedIn(page, "me@example.com");
  await seedRecords(page, "me@example.com", { deadlock: true });
  await page.goto("/me");
  await expect(page.getByRole("heading", { level: 1, name: "내 단어장" })).toBeVisible();
  const done = page.getByRole("region", { name: /^완독한 용어/ });
  await expect(done.getByRole("link", { name: "데드락 (완독, 2026년 1월 1일)" })).toBeVisible();
  await expect(done.locator(".la-seal-mark svg")).toHaveCount(1);
  await expect(page.getByRole("region", { name: /^아직 안 읽은 용어/ }).locator(".la-seal-mark")).toHaveCount(0);
  await expect(page.locator(".progress-cats li").filter({ hasText: "운영체제" }).locator(".la-ledger-count")).toHaveText(/^1\/\d+ 완독$/);
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

test("상세를 열면 최근 본 용어에 남고, 색인은 읽다 만 용어에 책갈피와 최근 3개, /me는 날짜와 함께", activity, async ({ page }) => {
  await page.goto("/terms");
  await expect(page.locator(".term-card").first()).toBeVisible();
  await expect(page.locator(".la-resume")).toHaveCount(0); // 로그아웃 상태: 책갈피 없음
  await signedIn(page, "recent@example.com");
  for (const id of ["csrf", "deadlock", "xss"]) {
    await page.goto(`/terms/${id}`);
    await expect(end(page).getByRole("button", { name: "다 읽었으면 完 도장 찍기" })).toBeVisible(); // 로그인 상태로 상세가 뜬 뒤
  }
  await page.goto("/terms");
  // 책갈피: 최근 본 것 중 아직 안 읽은 가장 최근 용어
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

test("책갈피 규칙: 완독하면 책갈피가 사라지고, 완독을 취소해도 되살아나지 않으며, 다시 열면 꽂힌다(색인·내 단어장 같은 규칙)", activity, async ({ page }) => {
  await signedIn(page, "bookmark@example.com");
  const index = page.getByRole("region", { name: "용어 목록" });
  const xss = index.locator(".term-card", { has: page.locator(".term-card-name", { hasText: /^XSS$/ }) });
  const meMarks = page.locator(".la-me-marks"); // 내 단어장 "읽다 만 용어"
  const expectMarked = async (marked: boolean) => {
    await page.goto("/terms");
    await expect(index.locator(".term-card").first()).toBeVisible();
    await expect(xss.locator(".la-resume")).toHaveCount(marked ? 1 : 0);
    await page.goto("/me");
    await expect(page.getByRole("heading", { level: 1, name: "내 단어장" })).toBeVisible();
    if (marked) await expect(meMarks).toContainText("XSS");
    else await expect(meMarks).toHaveCount(0);
  };

  await page.goto("/terms/xss");
  await expect(end(page).getByRole("button", { name: "다 읽었으면 完 도장 찍기" })).toBeVisible();
  await expectMarked(true); // 열어 보고 완독하지 않음 → 책갈피

  await page.goto("/terms/xss");
  await end(page).getByRole("button", { name: "다 읽었으면 完 도장 찍기" }).click();
  await expect(stamp(page)).toBeVisible();
  await expectMarked(false); // 완독 → 책갈피 사라짐

  await page.goto("/terms/xss");
  await end(page).getByRole("button", { name: "완독 취소" }).click(); // 연 뒤에 취소: 취소 시각이 마지막으로 본 시각보다 늦다
  await expect(end(page).getByRole("button", { name: "다 읽었으면 完 도장 찍기" })).toBeVisible();
  await expectMarked(false); // 완독 취소 → 책갈피 없음(자동으로 되살리지 않음)

  await page.goto("/terms/xss"); // 다시 열기
  await expect(end(page).getByRole("button", { name: "다 읽었으면 完 도장 찍기" })).toBeVisible();
  await expectMarked(true); // 다시 열면 평소 규칙대로 책갈피
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
