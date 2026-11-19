// E2E: npm run test:e2e (테스트 빌드 dist-e2e → 로컬 미리보기 → Playwright). 테스트 빌드에만 장면 기록(players/three/trace.ts)이 들어 있다. 브라우저는 설치된 Chrome을 쓴다
// draft 포함: npm run test:e2e:drafts (E2E_INCLUDE_DRAFTS=1) → draft까지 든 개발 서버(generated/dev)를 대상으로 같은 검사를 돌린다
import { defineConfig } from "@playwright/test";

const drafts = process.env.E2E_INCLUDE_DRAFTS === "1";
const port = drafts ? 5174 : 4173;
/** 실제 속도 테스트: "CSRF 공격 흐름 1×(실제 속도)", "재생 속도 2×" (tests/e2e/player.e2e.ts) */
const REALTIME = /\(실제 속도\)|재생 속도 2×/;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 120_000,
  workers: 4, // 16코어 데스크톱에서 잰 값: 6이면 3D 페이지가 몰려 테스트마다 2~5배 느려진다
  globalTimeout: 20 * 60_000, // 브라우저가 닫히지 않고 멈춰도 전체 실행은 20분에서 끊는다
  fullyParallel: true, // 같은 파일의 테스트도 나눠 돈다(테스트마다 새 페이지라 서로 독립)
  reporter: [["list"], ["./tests/e2e/progress-reporter.ts"]], // 진단 리포터: 끊기면 돌던 테스트·마지막 단계를 남긴다
  // 실제 속도로 재는 두 테스트는 나머지가 다 끝난 뒤 따로 돈다(병렬 부하로 프레임이 떨어지면 장면 시간이 느려져 배속 비율이 틀어진다)
  projects: [
    { name: "main", grepInvert: REALTIME },
    { name: "realtime", grep: REALTIME, dependencies: ["main"] },
  ],
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
