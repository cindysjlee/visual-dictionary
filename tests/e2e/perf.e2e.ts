// 성능(NFR-02, @perf): 홈·상세 첫 화면의 LCP·CLS를 잰다. 기준과 근거는 docs/10 "성능 기준".
// 네트워크는 Lighthouse 데스크톱 조건(왕복 40ms, 10Mbps)으로 늦춘다. 대상은 로컬 테스트 빌드(dist-e2e)라 CDN 거리는 들어가지 않는다
import { appendFileSync } from "node:fs";
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

/**
 * 로컬(배포 전 전체 E2E, 테스트 빌드)에서는 기준을 넘으면 실패한다. CI(GitHub 러너)는 GPU가 없고 성능 편차가 커서,
 * draft 검사(E2E_INCLUDE_DRAFTS)는 번들하지 않는 개발 서버를 재서 배포 성능과 무관하므로 측정값만 남기고 실패로 보지 않는다(docs/10 "성능 기준")
 */
function judge(name: string, { lcp, cls }: { lcp: number; cls: number }) {
  const within = lcp <= LCP_MS && cls <= CLS;
  const line = `${name}: LCP ${Math.round(lcp)}ms, CLS ${cls.toFixed(3)} (기준 LCP ≤ ${LCP_MS}ms, CLS ≤ ${CLS}: ${within ? "이내" : "초과"})`;
  console.log(line);
  expect(lcp, "LCP가 측정되어야 한다").toBeGreaterThan(0);
  if (process.env.CI || process.env.E2E_INCLUDE_DRAFTS === "1") {
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- 성능 측정(@perf, 실패로 보지 않음) ${line}\n`);
    return;
  }
  expect(lcp).toBeLessThanOrEqual(LCP_MS);
  expect(cls).toBeLessThanOrEqual(CLS);
}

// 랜딩 시안 3개. C는 실제 3D 플레이어가 스크린에 뜰 때까지 기다린다
const LANDINGS = [
  { hero: "a", ready: ".la-steps" },
  { hero: "b", ready: ".lb-board" },
  { hero: "c", ready: ".lc-screen .play-btn" },
];
for (const { hero, ready } of LANDINGS) {
  test(`랜딩 ${hero} 첫 화면: LCP·CLS 기준 이내`, tag, async ({ page }) => {
    judge(`랜딩 ${hero}`, await measure(page, `/?hero=${hero}`, async (p) => void (await expect(p.locator(ready).first()).toBeVisible())));
  });
}

test("목록 첫 화면: LCP·CLS 기준 이내", tag, async ({ page }) => {
  judge("목록", await measure(page, "/terms", async (p) => void (await expect(p.locator(".term-card").first()).toBeVisible())));
});

test("상세(CSRF) 첫 화면: 플레이어까지 뜬 뒤 LCP·CLS 기준 이내", tag, async ({ page }) => {
  judge("상세(CSRF)", await measure(page, "/terms/csrf", async (p) => void (await expect(p.locator(".caption-text")).toBeVisible())));
});
