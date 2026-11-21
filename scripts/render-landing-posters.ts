// 랜딩 첫 화면의 정지 이미지(LCP)를 만든다: 개발 서버의 /?poster&hero=<a|b>가 3D 장면을 진행도 0·시간 정지로 그리면
// 캔버스를 WebP로 받아 apps/web/src/features/landing/posters/hero-<a|b>-<light|dark>.webp에 저장한다(LandingPage가 import, Vite가 해시 이름으로 내보냄)(유리 굴절 바탕이 테마 바탕색이라 테마별). 장면(LandingScene)을 바꾸면 다시 실행한다.
//   npm run dev(다른 터미널) → node scripts/render-landing-posters.ts [http://localhost:5173]
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5173";
const out = new URL("../apps/web/src/features/landing/posters/", import.meta.url);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=default", "--ignore-gpu-blocklist"] });
try {
  for (const [hero, theme] of [["a", "light"], ["a", "dark"], ["b", "light"], ["b", "dark"]] as const) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    await page.goto(`${base}/?poster&hero=${hero}&theme=${theme}`);
    const handle = await page.waitForFunction(() => (globalThis as { __landingPoster?: string }).__landingPoster, undefined, { timeout: 60_000 });
    const dataUrl = String(await handle.jsonValue());
    const name = `hero-${hero}-${theme}.webp`;
    if (!dataUrl.startsWith("data:image/webp;base64,")) throw new Error(`${name}: WebP가 아닙니다(${dataUrl.slice(0, 30)})`);
    const bytes = Buffer.from(dataUrl.split(",")[1]!, "base64");
    writeFileSync(new URL(name, out), bytes);
    console.log(`${name} ${(bytes.length / 1024).toFixed(1)}KB`);
    await page.close();
  }
} finally {
  await browser.close();
}
