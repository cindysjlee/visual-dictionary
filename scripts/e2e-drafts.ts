// draft 용어까지 E2E·axe 검사: E2E_INCLUDE_DRAFTS=1로 Playwright를 돌린다(개발 서버 대상, playwright.config.ts).
// npm 스크립트에 VAR=1을 쓰면 Windows cmd에서 안 되므로 여기서 환경 변수를 넣는다. 추가 인자는 그대로 넘긴다
import { spawnSync } from "node:child_process";

// shell을 거치므로 인자를 따옴표로 감싼다(--grep "csrf|xss"의 |가 Windows cmd 파이프로 읽히지 않게)
const args = process.argv.slice(2).map((a) => `"${a.replace(/"/g, '\\"')}"`);
const result = spawnSync("npx", ["playwright", "test", ...args], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, E2E_INCLUDE_DRAFTS: "1" },
});
process.exit(result.status ?? 1);
