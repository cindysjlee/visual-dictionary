// 화면 이동 시 스크롤 위치(@scroll): 용어 쪽은 늘 맨 위(용어 이름)에서 시작하고, 뒤로 가기는 색인의 원래 위치로 돌아온다.
// 플레이어로 바로 가는 주소(#term-fig, 랜딩의 "3D로 자세히 보기")로 들어왔을 때만 플레이어에서 시작한다.
// 배경: 라우터가 새 화면에서 스크롤을 맨 위로 되돌리지 않아, 색인을 내려 둔 채 용어를 열면 그 높이에서 시작했다
import { expect, test, type Page } from "@playwright/test";
import { terms } from "./terms.ts";

const tag = { tag: "@scroll" };
/** 그림 윗변이 화면 맨 위에서 벗어나도 되는 px: 이동한 뒤 글꼴·내용이 늦게 들어와 위쪽 높이가 몇 px 바뀔 수 있다 */
const TOP_TOLERANCE = 40;
/** 초안 포함 실행(npm run test:e2e:drafts)은 개발 서버가 대상이다. 개발 서버는 CSS·글꼴이 늦게 들어와 높이가 바뀌어서, 뒤로 가기 때 복원한 위치가 어긋난다(공개된 xss도 같은 증상이라 용어 내용 문제가 아니다). 위치를 정확히 비교하는 테스트는 빌드(공개 용어만)를 쓰는 실행에서만 돈다 */
const DEV_SERVER = process.env.E2E_INCLUDE_DRAFTS === "1";
const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
/** 색인 줄의 용어 링크(첫소리 묶음 안의 이름 링크) */
const entryLinks = (page: Page) => page.locator(".term-card .la-word");
/** 플레이어의 재생 버튼(플레이어가 다 뜬 것을 알리는 표지) */
const playButton = (page: Page) => page.getByRole("region", { name: "애니메이션 플레이어" }).locator(".play-btn");
/** 포커스가 있는 요소가 플레이어 그림(#term-fig) 안인지 */
const focusInFigure = (page: Page) => page.evaluate(() => !!document.activeElement?.closest("#term-fig"));

/** 색인을 맨 아래까지 내리고 마지막 용어의 id를 돌려준다(스크롤이 가장 큰 경우) */
async function openIndexScrolledToBottom(page: Page) {
  await page.goto("/terms");
  await expect(entryLinks(page)).toHaveCount(terms.length);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => scrollY(page)).toBeGreaterThan(300); // 내릴 만큼 긴 색인이어야 의미 있는 테스트
  const link = entryLinks(page).last();
  const href = await link.getAttribute("href");
  return { link, href: href!, y: await scrollY(page) };
}

test("색인 → 용어 쪽: 색인을 내려 둔 채 열어도 용어 이름이 있는 맨 위에서 시작하고, 포커스는 플레이어에 가지 않는다", tag, async ({ page }) => {
  const { link, href } = await openIndexScrolledToBottom(page);
  await link.click();
  await expect(page).toHaveURL(href);
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
  await expect.poll(() => scrollY(page)).toBe(0);
  // 플레이어·내용이 다 뜬 뒤에도 그대로(늦게 도착하는 내용이 스크롤을 옮기지 않는다)
  await expect(playButton(page)).toBeVisible();
  expect(await scrollY(page)).toBe(0);
  expect(await focusInFigure(page)).toBe(false);
});

test("뒤로 가기: 용어 쪽에서 돌아오면 색인이 떠나기 전 위치에 있다", tag, async ({ page }) => {
  const { link, href, y } = await openIndexScrolledToBottom(page);
  await link.click();
  await expect(page).toHaveURL(href);
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
  await page.goBack();
  await expect(page).toHaveURL("/terms");
  await expect(entryLinks(page)).toHaveCount(terms.length);
  await expect.poll(() => scrollY(page)).toBe(y);
});

test("용어 쪽 주소를 직접 열면 맨 위에서, #term-fig 주소를 직접 열면 플레이어 그림에서 시작한다", tag, async ({ page }) => {
  const id = terms[0]!.id;
  await page.goto(`/terms/${id}`);
  await expect(playButton(page)).toBeVisible();
  expect(await scrollY(page)).toBe(0);

  await page.goto(`/terms/${id}#term-fig`);
  await expect(playButton(page)).toBeVisible();
  await expect.poll(() => scrollY(page)).toBeGreaterThan(100);
  await expect(page.locator("#term-fig")).toBeInViewport();
  const top = await page.locator("#term-fig").evaluate((el) => Math.round(el.getBoundingClientRect().top));
  expect(Math.abs(top), "그림이 화면 맨 위 근처에 맞춰진다").toBeLessThanOrEqual(TOP_TOLERANCE);
});

test("랜딩의 3D로 자세히 보기: 용어 쪽이 플레이어 그림에서 시작하고, 뒤로 가면 랜딩이 떠난 자리에 있다", tag, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // 연필 스케치가 정지 컷으로 빨리 끝난다
  await page.goto("/");
  const next = page.getByRole("link", { name: /3D로 자세히 보기/ });
  await expect(page.locator(".la-fig-next")).toHaveAttribute("data-on", "true", { timeout: 30_000 });
  await next.scrollIntoViewIfNeeded();
  const y = await scrollY(page);
  await next.click();
  await expect(page).toHaveURL(/\/terms\/[^/#]+#term-fig$/);
  await expect(playButton(page)).toBeVisible();
  await expect(page.locator("#term-fig")).toBeInViewport();
  const top = await page.locator("#term-fig").evaluate((el) => Math.round(el.getBoundingClientRect().top));
  expect(Math.abs(top), "그림이 화면 맨 위 근처에 맞춰진다").toBeLessThanOrEqual(TOP_TOLERANCE);

  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect.poll(() => scrollY(page)).toBe(y);
});

test("색인의 분야·검색 필터를 바꿔도 화면이 맨 위로 튀지 않는다(같은 화면 안의 이동)", tag, async ({ page }) => {
  await page.goto("/terms");
  await expect(entryLinks(page)).toHaveCount(terms.length);
  const chips = page.getByRole("group", { name: "카테고리" });
  await chips.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 120));
  const before = await scrollY(page);
  expect(before, "필터 줄이 화면 안에 보이도록 조금 내려 둔 상태").toBeGreaterThan(0);
  await chips.getByRole("button", { name: "네트워크" }).click();
  await expect(chips.getByRole("button", { name: "네트워크" })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/field=network/);
  await page.waitForTimeout(300);
  expect(await scrollY(page)).toBeGreaterThan(0);
});

test("뒤로 가기: #term-fig로 연 용어 쪽에서 다른 곳을 거쳐 돌아와도 떠난 위치다(해시가 위치를 덮지 않는다)", tag, async ({ page }) => {
  test.skip(DEV_SERVER, "개발 서버(초안 포함 실행)에서는 CSS·글꼴이 늦게 들어와 복원 위치가 어긋난다. 빌드를 쓰는 실행에서만 돈다");
  const id = terms[0]!.id;
  await page.goto("/terms");
  await page.goto(`/terms/${id}#term-fig`);
  await expect(playButton(page)).toBeVisible();
  await expect(page.locator("#term-fig")).toBeInViewport();
  await page.evaluate(() => window.scrollBy(0, 400)); // 그림 아래로 더 내려 읽다가
  const y = await scrollY(page);
  await page.getByRole("link", { name: "개인정보처리방침" }).click();
  await expect(page).toHaveURL("/privacy");
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/terms/${id}#term-fig$`));
  await expect(playButton(page)).toBeVisible();
  await expect.poll(() => scrollY(page)).toBe(y);
});

test("용어 쪽 목차: 구역 이름을 누르면 그 구역으로 가고, 그래도 다른 용어를 열면 다시 맨 위다", tag, async ({ page }) => {
  const id = terms.find((t) => t.defenses.length > 0)!.id;
  await page.goto(`/terms/${id}`);
  await expect(playButton(page)).toBeVisible();
  const toc = page.getByRole("navigation", { name: "이 페이지 목차" });
  await toc.getByRole("link", { name: "참고" }).click();
  await expect(page.locator("#term-refs")).toBeInViewport();
  expect(await scrollY(page)).toBeGreaterThan(300);

  // 관련 용어·색인 링크로 다른 용어를 열면 새 쪽이므로 맨 위
  await page.getByRole("link", { name: "← 용어 색인으로" }).click();
  await expect(page).toHaveURL("/terms");
  const link = entryLinks(page).nth(1);
  const href = await link.getAttribute("href");
  await link.click();
  await expect(page).toHaveURL(href!);
  await expect.poll(() => scrollY(page)).toBe(0);
});
