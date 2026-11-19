// 배포 후 실제 Cognito 확인: node scripts/smoke-auth.ts [주소]. 메일 없이 로그인 → 새로고침 유지 → 로그아웃을 운영 사이트에서 본다.
// 테스트 사용자는 관리자 명령(AWS CLI, 프로필 vd)으로 만든다: 예약 도메인 example.com, 실행마다 다른 이름, 메일 보내지 않음(SUPPRESS), 이메일 인증된 상태.
// 끝나면(실패해도) 지운다. 지우지 못하면 남은 사용자 이름을 출력한다. 비밀번호는 실행마다 새로 만들고 어디에도 저장하지 않는다
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";
import { COGNITO_ORIGIN } from "../infra/lib/csp.ts";

const base = (process.argv[2] ?? process.env.SITE_URL ?? "https://d1y3rvak3nd08u.cloudfront.net").replace(/\/$/, "");
const profile = process.env.AWS_PROFILE ?? "vd";

const config = (await (await fetch(`${base}/config.json`)).json()) as { region: string; userPoolId: string };
const aws = (...args: string[]) =>
  execFileSync("aws", ["cognito-idp", ...args, "--user-pool-id", config.userPoolId, "--region", config.region, "--profile", profile], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const email = `smoke-auth-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`;
const password = `Smoke${randomBytes(9).toString("base64url")}1a`;
const results: [boolean, string][] = [];
const check = (ok: boolean, what: string) => results.push([ok, what]);

let created = false;
try {
  aws("admin-create-user", "--username", email, "--message-action", "SUPPRESS", "--user-attributes", "Name=email,Value=" + email, "Name=email_verified,Value=true");
  created = true;
  aws("admin-set-user-password", "--username", email, "--password", password, "--permanent");
  check(true, `테스트 사용자 생성(메일 없음): ${email}`);

  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const violations: string[] = [];
    const outside = new Set<string>();
    page.on("console", (m) => /Content Security Policy/i.test(m.text()) && violations.push(m.text()));
    page.on("request", (r) => {
      const origin = new URL(r.url()).origin;
      if (origin !== base) outside.add(origin);
    });
    const bar = page.locator(".topbar");

    await page.goto(`${base}/auth/login?next=%2Fterms%2Fcsrf`);
    await page.getByLabel("이메일", { exact: true }).fill(email);
    await page.getByLabel("비밀번호", { exact: true }).fill(password);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL(`${base}/terms/csrf`, { timeout: 30_000 });
    await bar.getByText(email).waitFor({ timeout: 15_000 });
    check(true, "로그인 → next(/terms/csrf)로 돌아옴, 상단바에 이메일");

    const tokenKeys = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("CognitoIdentityServiceProvider.") && k.endsWith(".refreshToken")).length);
    check((await tokenKeys()) === 1, "토큰이 localStorage에 저장됨(Amplify 기본)");

    await page.reload();
    await bar.getByText(email).waitFor({ timeout: 15_000 });
    check(true, "새로고침 후에도 로그인 유지");

    await bar.getByRole("button", { name: "로그아웃" }).click();
    await bar.getByRole("link", { name: "로그인" }).waitFor({ timeout: 15_000 });
    check((await tokenKeys()) === 0, "로그아웃: 상단바가 로그인 버튼으로, 저장된 토큰 삭제");

    check(violations.length === 0, `CSP 위반 없음${violations.length ? `: ${violations[0]}` : ""}`);
    check([...outside].every((o) => o === COGNITO_ORIGIN), `사이트 밖 요청은 사용자 풀 엔드포인트뿐: ${[...outside].join(", ") || "(없음)"}`);
  } finally {
    await browser.close();
  }
} catch (e) {
  check(false, `진행 중 실패: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
} finally {
  if (created) {
    try {
      aws("admin-delete-user", "--username", email);
      check(true, "테스트 사용자 삭제");
    } catch (e) {
      check(false, `테스트 사용자 삭제 실패 → 남은 사용자: ${email} (콘솔: Cognito → 사용자 풀 → 사용자 관리 → 사용자에서 지울 것) ${e instanceof Error ? e.message.split("\n")[0] : ""}`);
    }
  }
}

for (const [ok, what] of results) console.log(`${ok ? "통과" : "실패"}  ${what}`);
const failed = results.filter(([ok]) => !ok).length;
console.log(failed ? `smoke:auth 실패 ${failed}건 (${base})` : `smoke:auth 통과 ${results.length}건 (${base})`);
process.exit(failed ? 1 : 0);
