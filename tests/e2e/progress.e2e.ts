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

/** 제목 줄 오른쪽의 큰 도장 열, 플레이어 아래 알림 */
const stamp = (page: Page) => page.locator(".la-term-stamp");
const notice = (page: Page) => page.locator(".la-stamp-live");
const player = (page: Page) => page.getByRole("region", { name: "애니메이션 플레이어" });
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("fake-progress") ?? "{}") as Record<string, Record<string, { read: boolean; source: string }>>);

async function playToEnd(page: Page) {
  await player(page).locator(".stage-play").click();
  await expect(player(page).locator(".play-btn")).toHaveAttribute("aria-label", "재생", { timeout: 60_000 });
}
/** 장면 배속 10×(테스트 빌드 전용)으로 끝까지 빨리 간다 */
const fast = (page: Page) => page.addInitScript(() => Object.assign(globalThis, { __sceneSpeed: 10 }));
const open = async (page: Page, id: string) => {
  await page.goto(`/terms/${id}`);
  await expect(player(page).locator(".stage-play")).toBeVisible();
};

test("① 애니메이션이 끝까지 가면 完 도장이 자동으로 찍힌다(날짜, 읽어 주는 이름 \"완독함, 날짜\", 쾅 찍힘, completed로 저장), 새로고침해도 유지", tag, async ({ page }) => {
  await fast(page);
  await signedIn(page, "auto@example.com");
  await open(page, "csrf");
  await expect(stamp(page).getByText("애니메이션을 끝까지 보면 찍혀요")).toBeVisible(); // 끝까지 보기 전에는 안 찍힌다
  expect((await stored(page))["auto@example.com"]?.csrf).toBeUndefined();
  await playToEnd(page);

  await expect(stamp(page).getByRole("img")).toHaveAttribute("aria-label", /^완독함, \d{4}년 \d{1,2}월 \d{1,2}일$/);
  await expect(stamp(page).locator(".la-seal-date")).toHaveText(/^\d{4}\.\d{2}\.\d{2}$/);
  await expect(stamp(page)).toHaveClass(/is-press/); // 이 쪽에서 안 찍힘 → 찍힘이 되면 쾅 찍힌다
  await expect.poll(async () => (await stored(page))["auto@example.com"]?.csrf).toMatchObject({ read: true, source: "completed" });
  await expect(page.locator(".la-study-end")).toHaveCount(0); // 글 끝 블록은 없다

  await page.reload();
  await expect(stamp(page).getByRole("button", { name: "완독 취소" })).toBeVisible();
  await expect(stamp(page)).not.toHaveClass(/is-press/); // 이미 찍힌 쪽을 열 때는 그대로
});

test("② '다음'으로 한 단계씩 넘겨 마지막 단계에 가도 찍히고, 단계 막대·처음/끝 건너뛰기로 간 것은 찍히지 않는다", tag, async ({ page }) => {
  await signedIn(page, "skip@example.com");
  await open(page, "csrf");
  // 건너뛰기: 단계 막대로 마지막(6단계)에 한 번에 → 찍히지 않는다. 그 자리에서 기다리고, 다시 앞뒤로 움직여도(마지막에서 '다음'은 제자리)
  await player(page).getByRole("button", { name: "6단계로 이동" }).click();
  await expect(page.locator(".step-pos")).toHaveText(/^6 \/ 6/);
  await player(page).getByRole("button", { name: "다음 단계" }).click();
  await page.waitForTimeout(800);
  await expect(stamp(page).getByText("애니메이션을 끝까지 보면 찍혀요")).toBeVisible();
  expect((await stored(page))["skip@example.com"]?.csrf).toBeUndefined();
  await expect(notice(page)).toBeEmpty();

  // 다음으로 순서대로: 1단계부터 5번 누르면 6단계에 도착해 찍힌다
  await player(page).getByRole("button", { name: "1단계로 이동" }).click();
  for (let i = 0; i < 5; i++) await player(page).getByRole("button", { name: "다음 단계" }).click();
  await expect(page.locator(".step-pos")).toHaveText(/^6 \/ 6/);
  await expect(stamp(page).getByRole("button", { name: "완독 취소" })).toBeVisible();
  await expect.poll(async () => (await stored(page))["skip@example.com"]?.csrf).toMatchObject({ read: true, source: "completed" });
});

test("방어 모드의 마지막(차단) 단계에 도착한 것은 완독이 아니다(공격 흐름 끝까지만)", tag, async ({ page }) => {
  await fast(page);
  await signedIn(page, "defense@example.com");
  await open(page, "csrf");
  await player(page).getByRole("button", { name: /방어 모드/ }).click();
  await playToEnd(page);
  await page.waitForTimeout(500);
  await expect(stamp(page).getByText("애니메이션을 끝까지 보면 찍혀요")).toBeVisible();
  expect((await stored(page))["defense@example.com"]?.csrf).toBeUndefined();
});

test("③ 찍히면 플레이어 아래에 \"完 도장이 찍혔어요 · 취소\"가 role=status로 뜨고 약 6초 뒤 사라지며, 취소하면 도장이 지워지고 취소 안내가 뜬다", tag, async ({ page }) => {
  await fast(page);
  await signedIn(page, "notice@example.com");
  await open(page, "csrf");
  await playToEnd(page);
  const note = notice(page);
  await expect(note).toHaveAttribute("role", "status");
  await expect(note).toContainText("完 도장이 찍혔어요 ·");
  const cancel = note.getByRole("button", { name: "방금 찍은 도장 취소" });
  await expect(cancel).toHaveText("취소");
  await expect(note).toBeVisible();
  // 약 6초 뒤 사라진다(3초에는 남아 있고, 그 뒤 5초 안에는 사라진다)
  await page.waitForTimeout(3000);
  await expect(note).toContainText("도장이 찍혔어요");
  await expect(note).toBeEmpty({ timeout: 5000 });

  // 알림의 취소: 알림이 다시 필요하므로 제목 줄에서 취소 → 다시 찍기로 한 번 더 찍고, 알림의 취소 버튼을 누른다
  await stamp(page).getByRole("button", { name: "완독 취소" }).click();
  await expect(stamp(page).getByRole("button", { name: "다시 찍기" })).toBeVisible();
  await stamp(page).getByRole("button", { name: "다시 찍기" }).click();
  await expect(note).toContainText("完 도장이 찍혔어요");
  await cancel.click();
  await expect(stamp(page).getByRole("button", { name: "다시 찍기" })).toBeVisible();
  await expect(note).toContainText("完 도장을 취소했어요");
  await expect.poll(async () => (await stored(page))["notice@example.com"]?.csrf).toMatchObject({ read: false, source: "manual" });
});

test("알림의 취소 버튼에 키보드 포커스가 있는 동안은 6초가 지나도 사라지지 않고, 포커스가 떠나면 사라진다", tag, async ({ page }) => {
  await fast(page);
  await signedIn(page, "focus@example.com");
  await open(page, "csrf");
  await playToEnd(page);
  const cancel = notice(page).getByRole("button", { name: "방금 찍은 도장 취소" });
  await expect(cancel).toBeVisible();
  await cancel.focus();
  await page.waitForTimeout(7000);
  await expect(cancel).toBeFocused();
  await expect(notice(page)).toContainText("도장이 찍혔어요");
  await page.mouse.move(2, 2); // 포커스로 화면이 움직여 알림이 마우스 아래에 놓였을 수 있다(마우스가 있어도 알림은 남는다)
  await cancel.blur();
  await expect(notice(page)).toBeEmpty();
  expect((await stored(page))["focus@example.com"]?.csrf).toMatchObject({ read: true }); // 사라져도 기록은 그대로
});

test("④ 제목 줄의 \"완독 취소\" 버튼(눈에 보이는 글자 버튼, 키보드로 누를 수 있다)으로 취소하면 흐린 윤곽 + \"다시 찍기\"로 바뀌고 새로고침해도 유지된다(read:false, manual)", tag, async ({ page }) => {
  await signedIn(page, "undo@example.com");
  await page.evaluate(() => localStorage.setItem("fake-progress", JSON.stringify({ "undo@example.com": { csrf: { termId: "csrf", read: true, source: "completed", updatedAt: "2026-11-24T09:00:00Z" } } })));
  await open(page, "csrf");
  const undo = stamp(page).getByRole("button", { name: "완독 취소" });
  await expect(undo).toBeVisible();
  await expect(undo).toHaveText("완독 취소");
  await undo.focus();
  await page.keyboard.press("Enter"); // 키보드로 누른다
  await expect(stamp(page).getByRole("button", { name: "다시 찍기" })).toBeVisible();
  await expect(stamp(page).locator(".la-seal.is-ghost")).toBeVisible();
  await expect(stamp(page).getByRole("img")).toHaveCount(0); // 찍힌 도장 이름("완독함")은 없다
  await page.reload();
  await expect(stamp(page).getByRole("button", { name: "다시 찍기" })).toBeVisible();
  expect((await stored(page))["undo@example.com"]?.csrf).toMatchObject({ read: false, source: "manual" });
});

test("⑤ 취소한 용어는 다시 열어 끝까지 봐도 자동으로 다시 찍히지 않고, \"다시 찍기\"로 직접 복구한다", tag, async ({ page }) => {
  await fast(page);
  await signedIn(page, "again@example.com");
  await page.evaluate(() => localStorage.setItem("fake-progress", JSON.stringify({ "again@example.com": { csrf: { termId: "csrf", read: false, source: "manual", updatedAt: "2026-11-24T09:00:00Z" } } })));
  await open(page, "csrf");
  await playToEnd(page);
  await page.waitForTimeout(800);
  await expect(stamp(page).getByRole("button", { name: "다시 찍기" })).toBeVisible();
  await expect(notice(page)).toBeEmpty();
  expect((await stored(page))["again@example.com"]?.csrf).toMatchObject({ read: false, source: "manual" });

  await stamp(page).getByRole("button", { name: "다시 찍기" }).click();
  await expect(stamp(page).getByRole("img")).toHaveAttribute("aria-label", /^완독함, /);
  await expect(notice(page)).toContainText("完 도장이 찍혔어요");
  await expect.poll(async () => (await stored(page))["again@example.com"]?.csrf).toMatchObject({ read: true, source: "manual" });
  await page.reload();
  await expect(stamp(page).getByRole("button", { name: "완독 취소" })).toBeVisible();
});

test("⑥ 로그아웃 상태에서는 끝까지 봐도 기록하지 않고, 플레이어 아래에 로그인 안내(링크)가 있다", tag, async ({ page }) => {
  await fast(page);
  await open(page, "csrf");
  const hint = page.locator(".la-stamp-hint");
  await expect(hint).toHaveText(/^로그인하면 완독이 기록돼요 · 로그인$/);
  await expect(hint.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/auth/login?next=%2Fterms%2Fcsrf");
  await expect(stamp(page)).toHaveCount(0);
  await playToEnd(page);
  await page.waitForTimeout(500);
  await expect(notice(page)).toBeEmpty();
  await expect(stamp(page)).toHaveCount(0);
  expect(await stored(page)).toEqual({});
});

test("⑦ 아직 안 찍힌 용어: 같은 자리에 흐린 윤곽 도장과 \"애니메이션을 끝까지 보면 찍혀요\", 누를 수 없다", tag, async ({ page }) => {
  await signedIn(page, "ghost@example.com");
  await open(page, "csrf");
  await expect(stamp(page).getByText("애니메이션을 끝까지 보면 찍혀요")).toBeVisible();
  await expect(stamp(page).locator(".la-seal.is-ghost")).toBeVisible();
  await expect(stamp(page).getByRole("button")).toHaveCount(0);
  await expect(stamp(page).getByRole("img")).toHaveCount(0);
  // 윤곽은 장식이라 눌러도 아무 일도 없다
  await stamp(page).locator(".la-seal").click({ force: true });
  expect((await stored(page))["ghost@example.com"]?.csrf).toBeUndefined();
});

test("동작 줄이기에서는 찍히는 애니메이션이 없고, 아니면 la-press 애니메이션이 돈다", tag, async ({ page }) => {
  await fast(page);
  await signedIn(page, "motion@example.com");
  for (const reduce of ["reduce", "no-preference"] as const) {
    await page.emulateMedia({ reducedMotion: reduce });
    await page.evaluate(() => localStorage.removeItem("fake-progress"));
    await open(page, "csrf");
    await playToEnd(page);
    await expect(stamp(page).getByRole("img")).toBeVisible();
    const name = await stamp(page).locator(".la-seal").evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe(reduce === "reduce" ? "none" : "la-press");
  }
});

test("기록을 불러오지 못하면 제목 옆에 안내만 하고 재생은 끝까지 간다(NFR-02)", tag, async ({ page }) => {
  await fast(page);
  await signedIn(page, "offline@example.com");
  await page.evaluate(() => localStorage.setItem("fake-progress-fail", "1"));
  await page.goto("/terms/csrf");
  await expect(stamp(page)).toContainText("기록을 불러오지 못했어요");
  await playToEnd(page);
  await expect(page.locator(".step-pos")).toHaveText(/^6 \/ 6/);
  await expect(page.locator(".steps2d")).toHaveCount(0); // 3D 그대로
  await expect(notice(page)).toBeEmpty(); // 취소 여부를 알 수 없으니 찍지 않는다
});

test("저장이 실패하면 도장은 되돌아가고 알림이 안내하며, 재생은 그대로다(NFR-02)", tag, async ({ page }) => {
  await fast(page);
  await signedIn(page, "savefail@example.com");
  await open(page, "csrf");
  await page.evaluate(() => localStorage.setItem("fake-progress-fail", "1")); // 불러온 뒤에 장애
  await playToEnd(page);
  await expect(notice(page).getByRole("alert")).toContainText("기록을 저장하지 못했어요");
  await expect(stamp(page).getByText("애니메이션을 끝까지 보면 찍혀요")).toBeVisible();
  await expect(page.locator(".step-pos")).toHaveText(/^6 \/ 6/);
});

test("⑧ 도장 상태(안 찍힘·찍힘·취소함)와 알림이 떠 있을 때 axe(라이트·다크) 위반이 없다", tag, async ({ page }) => {
  await fast(page);
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const severe = async (label: string) => {
    const { violations } = await new AxeBuilder({ page }).analyze();
    return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  };
  const bad: string[] = [];
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await signedIn(page, `axe-${colorScheme}@example.com`);
    await open(page, "csrf");
    bad.push(...(await severe(`${colorScheme} 안 찍힘`)));
    await playToEnd(page);
    await expect(notice(page)).toContainText("도장이 찍혔어요");
    bad.push(...(await severe(`${colorScheme} 찍힘+알림`)));
    await stamp(page).getByRole("button", { name: "완독 취소" }).click();
    await expect(stamp(page).getByRole("button", { name: "다시 찍기" })).toBeVisible();
    bad.push(...(await severe(`${colorScheme} 취소함+알림`)));
  }
  expect(bad).toEqual([]);
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
    await expect(stamp(page).getByText("애니메이션을 끝까지 보면 찍혀요")).toBeVisible(); // 로그인 상태로 상세가 뜬 뒤
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
  await fast(page);
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

  await open(page, "xss");
  await expect(stamp(page).getByText("애니메이션을 끝까지 보면 찍혀요")).toBeVisible();
  await expectMarked(true); // 열어 보고 끝까지 보지 않음 → 책갈피

  await open(page, "xss");
  await playToEnd(page); // 끝까지 봐서 자동으로 찍힘
  await expect(stamp(page).getByRole("img")).toBeVisible();
  await expectMarked(false); // 완독 → 책갈피 사라짐

  await open(page, "xss");
  await stamp(page).getByRole("button", { name: "완독 취소" }).click(); // 연 뒤에 취소: 취소 시각이 마지막으로 본 시각보다 늦다
  await expect(stamp(page).getByRole("button", { name: "다시 찍기" })).toBeVisible();
  await expectMarked(false); // 완독 취소 → 책갈피 없음(자동으로 되살리지 않음)

  await open(page, "xss"); // 다시 열기
  await expect(stamp(page).getByRole("button", { name: "다시 찍기" })).toBeVisible();
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
