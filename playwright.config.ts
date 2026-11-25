// E2E: npm run test:e2e (테스트 빌드 dist-e2e → 로컬 미리보기 → Playwright). 테스트 빌드에만 장면 기록(players/three/trace.ts)이 들어 있다. 브라우저는 설치된 Chrome을 쓴다
// draft 포함: npm run test:e2e:drafts (E2E_INCLUDE_DRAFTS=1) → draft까지 든 개발 서버(generated/dev)를 대상으로 같은 검사를 돌린다
import { defineConfig } from "@playwright/test";

const drafts = process.env.E2E_INCLUDE_DRAFTS === "1";
const port = drafts ? 5174 : 4173;
/** 실제 속도 테스트: "CSRF 공격 흐름 1×(실제 속도)", "재생 속도 2×" (tests/e2e/player.e2e.ts) */
const REALTIME = /\(실제 속도\)|재생 속도 2×/;
const FILTERED = process.argv.some((a) => a === "--grep" || a === "-g" || a.startsWith("--grep="));

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 120_000,
  // 16코어 데스크톱에서 잰 값: 6이면 3D 페이지가 몰려 테스트마다 2~5배 느려진다. CI(4코어 러너)는 E2E_WORKERS=2
  workers: Number(process.env.E2E_WORKERS ?? 4),
  // 브라우저가 닫히지 않고 멈춰도 전체 실행을 끊는다. CI는 E2E를 5개 shard로 나눠(scripts/e2e-shard.ts, CH-69) shard 하나가 약 10분(workers 2)이다.
  // 한 job으로 돌리던 때(14~22분, 용어 20개에서 35분 초과)의 제한이 아니라 shard 하나 기준이다: 25분(job 제한 35분). 늘려서 가리지 말고, 넘으면 shard 수를 늘린다
  globalTimeout: (process.env.CI ? 25 : 20) * 60_000,
  fullyParallel: true, // 같은 파일의 테스트도 나눠 돈다(테스트마다 새 페이지라 서로 독립)
  reporter: [["list"], ["./tests/e2e/progress-reporter.ts"]], // 진단 리포터: 끊기면 돌던 테스트·마지막 단계를 남긴다
  // 실제 속도로 재는 두 테스트는 나머지가 다 끝난 뒤 따로 돈다(병렬 부하로 프레임이 떨어지면 장면 시간이 느려져 배속 비율이 틀어진다)
  projects: [
    { name: "main", grepInvert: REALTIME },
    // --grep으로 고를 때는 의존을 끈다: 의존 프로젝트(main)는 grep과 상관없이 통째로 돌아, @csrf가 "CSRF 1×"를 잡으면 전체가 따라온다(grep은 대소문자 무시)
    { name: "realtime", grep: REALTIME, dependencies: FILTERED ? [] : ["main"] },
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
