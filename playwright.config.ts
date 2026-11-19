// E2E: npm run test:e2e (테스트 빌드 dist-e2e → 로컬 미리보기 → Playwright). 테스트 빌드에만 장면 기록(players/three/trace.ts)이 들어 있다. 브라우저는 설치된 Chrome을 쓴다
// draft 포함: npm run test:e2e:drafts (E2E_INCLUDE_DRAFTS=1) → draft까지 든 개발 서버(generated/dev)를 대상으로 같은 검사를 돌린다
import { defineConfig } from "@playwright/test";

const drafts = process.env.E2E_INCLUDE_DRAFTS === "1";
const port = drafts ? 5174 : 4173;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 120_000,
  workers: 2,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    channel: "chrome",
    viewport: { width: 1440, height: 900 }, // 주 대상은 PC(데스크톱 1440×900). 375px는 보조 확인만 (CLAUDE.md)
    trace: "retain-on-failure",
  },
  webServer: {
    command: drafts ? `npm run dev -- --port ${port} --strictPort` : `npx vite preview --outDir dist-e2e --port ${port} --strictPort`,
    cwd: "apps/web",
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
