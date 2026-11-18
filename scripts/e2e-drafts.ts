// draft 용어까지 E2E·axe 검사: E2E_INCLUDE_DRAFTS=1로 Playwright를 돌린다(개발 서버 대상, playwright.config.ts).
// npm 스크립트에 VAR=1을 쓰면 Windows cmd에서 안 되므로 여기서 환경 변수를 넣는다. 추가 인자는 그대로 넘긴다
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, E2E_INCLUDE_DRAFTS: "1" },
});
process.exit(result.status ?? 1);
