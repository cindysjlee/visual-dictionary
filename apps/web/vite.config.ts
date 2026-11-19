import { existsSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// draft 보호: vite build는 published만 있는 generated/build만 정적 파일로 복사한다.
// --mode가 아니라 command로 고르므로 `vite build --mode development`도 draft를 가져갈 수 없다.
export default defineConfig(({ command }) => {
  const publicDir = command === "build" ? "generated/build" : "generated/dev";
  if (command === "build" && !existsSync(`${publicDir}/content/index.json`)) {
    throw new Error(`${publicDir}/content가 없습니다. npm run build로 빌드하세요 (콘텐츠 생성이 먼저 실행됨).`);
  }
  // assetsInlineLimit 0: 작은 글꼴을 data: URI로 넣으면 CSP font-src 'self'에 막힌다
  return {
    plugins: [react()],
    publicDir,
    build: { assetsInlineLimit: 0 },
    // 빌드 결과물은 감시하지 않는다: verify·test:e2e가 dist-e2e/index.html 등을 다시 쓰면 개발 서버가 열린 페이지를 모두 새로고침해
    // draft E2E(개발 서버 대상)가 도중에 끊긴다(모드 선택 풀림·장면 로딩 중단·실행 문맥 사라짐)
    server: {
      watch: { ignored: ["**/dist/**", "**/dist-e2e/**", "**/generated/build/**"] },
      // 3D 장면(동적 import)을 서버가 뜰 때 미리 변환한다: 병렬 E2E가 첫 요청을 몰면 "Failed to fetch dynamically imported module"로 2D 대체 화면이 된다
      warmup: { clientFiles: ["./src/players/three/**/*.tsx"] },
    },
  };
});
