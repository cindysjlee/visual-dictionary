// 추천 학습 경로 E2E(@paths): 색인(/terms) 왼쪽 "처음이라면 이 순서로" 3개. 데이터는 content/paths.json
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { terms } from "./terms.ts";

const tag = { tag: "@paths" };
const PW = "abc12345";
const paths = JSON.parse(readFileSync(new URL("../../content/paths.json", import.meta.url), "utf8")) as { id: string; title: string; why: string; steps: string[] }[];
const nameOf = (id: string) => terms.find((t) => t.id === id)!.name;
const section = (page: Page) => page.getByRole("region", { name: "처음이라면 이 순서로" });

/** 로그인된 상태 + 완독 기록(가짜 인증·가짜 기록 API, progress.e2e.ts와 같은 방식) */
async function signedIn(page: Page, read: string[]) {
  await page.goto("/");
  await page.evaluate(
    ([ids, pw]) => {
      localStorage.setItem("fake-auth-users", JSON.stringify({ "p@example.com": { password: pw, confirmed: true } }));
      localStorage.setItem("fake-auth-session", "p@example.com");
      const rows = Object.fromEntries((ids as string[]).map((id) => [id, { termId: id, read: true, source: "manual", updatedAt: "2026-01-01T00:00:00Z" }]));
      localStorage.setItem("fake-progress", JSON.stringify({ "p@example.com": rows }));
    },
    [read, PW] as const,
  );
}

test("경로 3개가 그려지고, 단계 링크 순서(ol)가 읽는 순서이며 이유 한 줄이 있다", tag, async ({ page }) => {
  await page.goto("/terms");
  await expect(section(page).locator(".la-path")).toHaveCount(3);
  for (const p of paths) {
    const item = section(page).locator(".la-path").filter({ has: page.getByRole("heading", { level: 3, name: p.title, exact: true }) });
    await expect(item.getByRole("list").getByRole("link")).toHaveCount(p.steps.length);
    await expect(item.locator(".la-path-name")).toHaveText(p.steps.map(nameOf)); // 링크 순서 = 읽는 순서
    await expect(item.locator(".la-path-node")).toHaveText(p.steps.map((_, i) => String(i + 1))); // 마디 번호
    await expect(item.locator("ol")).toHaveCount(1);
    await expect(item.locator(".la-path-why")).toHaveText(p.why);
  }
});

test("단계 링크를 누르면 그 용어 쪽으로 간다", tag, async ({ page }) => {
  await page.goto("/terms");
  const first = paths[0]!.steps[0]!;
  await section(page).getByRole("link", { name: nameOf(first), exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/terms/${first}$`));
});

test("비회원에게는 도장·n/3 완독이 없고, 로그인하면 완독한 용어의 마디만 完 도장이 되며 쪽 머리에 n/3 완독이 붙는다(오른쪽 진행률 카드는 그대로)", tag, async ({ page }) => {
  await page.goto("/terms");
  await expect(section(page).locator(".la-seal")).toHaveCount(0);
  await expect(section(page).locator(".la-path-count")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "내 진행률" })).toContainText("로그인하면");

  const done = [paths[0]!.steps[0]!, paths[2]!.steps[2]!];
  await signedIn(page, done);
  await page.goto("/terms");
  await expect(section(page).locator(".la-seal")).toHaveCount(done.length);
  await expect(section(page).locator(".is-done")).toHaveCount(done.length);
  // 쪽 머리: 그 경로에서 읽은 수 / 전체 수(첫 경로 1/3, 둘째 0/3, 셋째 1/3)
  await expect(section(page).locator(".la-path-count")).toHaveText(["1/3 완독", "0/3 완독", "1/3 완독"]);
  for (const id of done) await expect(section(page).getByRole("link", { name: `${nameOf(id)} (완독` })).toBeVisible();
  const unread = paths[1]!.steps[0]!;
  await expect(section(page).getByRole("link", { name: nameOf(unread), exact: true })).toBeVisible(); // 안 읽은 용어는 이름만
  await expect(page.getByRole("complementary", { name: "내 진행률" }).getByText("내 진행률")).toBeVisible();
  await expect(page.getByText("이어 보기")).toHaveCount(0); // 이어 보기 카드는 두지 않는다
});

test("경로 파일이 늦게 와도 색인과 함께 나타나 아래가 밀리지 않는다", tag, async ({ page }) => {
  await page.route("**/content/paths.json", async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.continue();
  });
  await page.goto("/terms");
  await expect(page.locator(".la-index-tools")).toBeVisible();
  const before = await page.locator(".la-index-tools").boundingBox();
  await expect(section(page)).toBeVisible(); // 색인 도구가 보이는 순간 경로도 이미 있다
  await page.waitForTimeout(300);
  expect((await page.locator(".la-index-tools").boundingBox())!.y).toBeCloseTo(before!.y, 0);
});

test("경로 파일을 못 읽으면 경로만 빠지고 색인은 그대로 뜬다", tag, async ({ page }) => {
  await page.route("**/content/paths.json", (route) => route.fulfill({ status: 500, body: "" }));
  await page.goto("/terms");
  await expect(page.locator(".term-card").first()).toBeVisible();
  await expect(section(page)).toHaveCount(0);
});

test("넓은 화면은 진행률 카드 왼쪽에, 900px 이하는 한 열로 쌓이고 가로 스크롤이 없다", tag, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/terms");
  const aside = page.getByRole("complementary", { name: "내 진행률" });
  const wide = { paths: (await section(page).boundingBox())!, aside: (await aside.boundingBox())! };
  expect(wide.paths.x + wide.paths.width).toBeLessThanOrEqual(wide.aside.x);
  expect(wide.aside.y).toBeLessThan(wide.paths.y + wide.paths.height); // 나란히

  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const narrow = { paths: (await section(page).boundingBox())!, aside: (await aside.boundingBox())! };
    expect(narrow.aside.y).toBeGreaterThanOrEqual(narrow.paths.y + narrow.paths.height - 1); // 아래로 쌓임
    expect(narrow.paths.width).toBeGreaterThan(width * 0.8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // 한 열: 쪽 3개가 같은 x에서 위아래로 쌓이고 폭이 구역을 거의 다 채운다
    const cards = await section(page).locator(".la-path").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width })));
    expect(cards).toHaveLength(3);
    expect(new Set(cards.map((c) => Math.round(c.x))).size, `${width}px: 쪽의 x`).toBe(1);
    expect(cards[1]!.y).toBeGreaterThan(cards[0]!.y);
    expect(cards[2]!.y).toBeGreaterThan(cards[1]!.y);
    expect(cards[0]!.w).toBeGreaterThan(narrow.paths.width * 0.95);
  }
  // 넓은 화면: 쪽 3개가 나란히(같은 y)
  await page.setViewportSize({ width: 1440, height: 900 });
  const row = await section(page).locator(".la-path").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().y)));
  expect(new Set(row).size).toBe(1);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`접근성(${colorScheme}, 로그인·완독 도장 있음)`, tag, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await signedIn(page, [paths[0]!.steps[0]!]);
    await page.goto("/terms");
    await expect(section(page).locator(".la-seal")).toHaveCount(1);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  });
}
