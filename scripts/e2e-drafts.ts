// draft 용어까지 E2E·axe 검사: E2E_INCLUDE_DRAFTS=1로 Playwright를 돌린다(개발 서버 대상, playwright.config.ts).
// npm 스크립트에 VAR=1을 쓰면 Windows cmd에서 안 되므로 여기서 환경 변수를 넣는다. 추가 인자는 그대로 넘긴다
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

// 셸 없이 Playwright CLI(JS)를 Node로 직접 실행한다: npx는 Windows에서 .cmd라 셸이 필요하고, 셸을 거치면 --grep "csrf|xss"의 |를 따옴표로 지켜야 한다
const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
const result = spawnSync(process.execPath, [cli, "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: false,
  env: { ...process.env, E2E_INCLUDE_DRAFTS: "1" },
});
process.exit(result.status ?? 1);
