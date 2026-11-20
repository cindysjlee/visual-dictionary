/// <reference lib="dom" />
// 성능(NFR-02, @perf): 홈·상세 첫 화면의 LCP·CLS를 잰다. 기준과 근거는 docs/10 "성능 기준".
// 네트워크는 Lighthouse 데스크톱 조건(왕복 40ms, 10Mbps)으로 늦춘다. 대상은 로컬 테스트 빌드(dist-e2e)라 CDN 거리는 들어가지 않는다
import { expect, test, type Page } from "@playwright/test";

const tag = { tag: "@perf" };
const LCP_MS = 2500; // web.dev "좋음" 기준. 요구사항의 "첫 화면 3초"보다 엄격하다
const CLS = 0.1; // web.dev "좋음" 기준

async function measure(page: Page, path: string, ready: (page: Page) => Promise<void>) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (10 * 1024 * 1024) / 8 });
  await page.goto(path);
  await ready(page);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500); // 마지막 레이아웃 이동이 기록될 시간
  return page.evaluate(
    () =>
      new Promise<{ lcp: number; cls: number }>((resolve) => {
        let lcp = 0;
        let cls = 0;
        new PerformanceObserver((l) => l.getEntries().forEach((e) => (lcp = Math.max(lcp, e.startTime)))).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((l) =>
          l.getEntries().forEach((e) => {
            const shift = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
            if (!shift.hadRecentInput) cls += shift.value;
          }),
        ).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => resolve({ lcp, cls }), 100);
      }),
  );
}

test("홈 첫 화면: LCP·CLS 기준 이내", tag, async ({ page }) => {
  const { lcp, cls } = await measure(page, "/", async (p) => void (await expect(p.locator(".term-card").first()).toBeVisible()));
  console.log(`${test.info().title}: LCP ${Math.round(lcp)}ms, CLS ${cls.toFixed(3)}`);
  expect(lcp).toBeGreaterThan(0);
  expect(lcp).toBeLessThanOrEqual(LCP_MS);
  expect(cls).toBeLessThanOrEqual(CLS);
});

test("상세(CSRF) 첫 화면: 플레이어까지 뜬 뒤 LCP·CLS 기준 이내", tag, async ({ page }) => {
  const { lcp, cls } = await measure(page, "/terms/csrf", async (p) => void (await expect(p.locator(".caption-text")).toBeVisible()));
  console.log(`${test.info().title}: LCP ${Math.round(lcp)}ms, CLS ${cls.toFixed(3)}`);
  expect(lcp).toBeGreaterThan(0);
  expect(lcp).toBeLessThanOrEqual(LCP_MS);
  expect(cls).toBeLessThanOrEqual(CLS);
});
