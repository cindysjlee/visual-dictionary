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
  return { plugins: [react()], publicDir };
});
