// 운영 사이트 실제 가입 확인: node scripts/smoke-auth-signup.ts [주소]. 인증 메일을 1통 쓰므로(계정 전체 하루 50통) 배포마다 돌리지 않고,
// 인증 관련 코드(features/auth, infra/lib/auth-stack.ts, CSP)를 바꿨을 때만 돌린다. 화면에서 가입 → 브라우저가 보낸 SignUp 응답 확인 →
// 관리자 명령(AWS CLI, 프로필 vd)으로 그 사용자가 UNCONFIRMED로 생겼는지 확인 → 삭제. 주소는 예약 도메인 example.com, 실행마다 다른 이름.
// 지우지 못하면 남은 사용자 이름을 출력한다
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";

const base = (process.argv[2] ?? process.env.SITE_URL ?? "https://d1y3rvak3nd08u.cloudfront.net").replace(/\/$/, "");
const profile = process.env.AWS_PROFILE ?? "vd";

const config = (await (await fetch(`${base}/config.json`)).json()) as { region: string; userPoolId: string };
const aws = (...args: string[]) =>
  execFileSync("aws", ["cognito-idp", ...args, "--user-pool-id", config.userPoolId, "--region", config.region, "--profile", profile, "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const email = `smoke-signup-${Date.now()}-${randomBytes(3).toString("hex")}@example.com`;
const password = `Signup${randomBytes(9).toString("base64url")}1a`;
const results: [boolean, string][] = [];
const check = (ok: boolean, what: string) => results.push([ok, what]);

let maybeCreated = false;
try {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const signUps: number[] = [];
    page.on("response", (r) => {
      if (r.url().startsWith("https://cognito-idp.") && r.request().headers()["x-amz-target"] === "AWSCognitoIdentityProviderService.SignUp") signUps.push(r.status());
    });

    await page.goto(`${base}/auth/signup`);
    check((await page.getByRole("note").count()) === 0, "운영 화면에 가짜 인증 안내가 없음(배포 빌드)");
    await page.getByLabel("이메일", { exact: true }).fill(email);
    await page.getByLabel("비밀번호", { exact: true }).fill(password);
    await page.getByLabel("비밀번호 확인", { exact: true }).fill(password);
    maybeCreated = true;
    await page.getByRole("button", { name: "가입하기" }).click();
    await page.waitForURL(`${base}/auth/confirm`, { timeout: 30_000 }).catch(() => undefined);
    const alert = ((await page.getByRole("alert").first().textContent()) ?? "").trim();
    check(signUps.length === 1 && signUps[0] === 200, `브라우저 → Cognito SignUp 요청: ${signUps.length ? signUps.join(", ") : "나가지 않음"}`);
    check(page.url() === `${base}/auth/confirm` && !alert, `코드 입력 화면으로 넘어감${alert ? ` (오류: ${alert})` : ""} — ${page.url().replace(base, "")}`);
  } finally {
    await browser.close();
  }

  const user = JSON.parse(aws("admin-get-user", "--username", email)) as { UserStatus: string; UserAttributes: { Name: string; Value: string }[] };
  const verified = user.UserAttributes.find((a) => a.Name === "email_verified")?.Value;
  check(user.UserStatus === "UNCONFIRMED" && verified !== "true", `사용자 풀에 UNCONFIRMED로 생김(email_verified: ${verified ?? "없음"})`);
} catch (e) {
  check(false, `진행 중 실패: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
} finally {
  if (maybeCreated) {
    try {
      aws("admin-delete-user", "--username", email);
      check(true, "테스트 사용자 삭제");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("UserNotFoundException")) check(true, "테스트 사용자 없음(가입이 안 됐으므로 지울 것 없음)");
      else check(false, `테스트 사용자 삭제 실패 → 남은 사용자: ${email} (콘솔: Cognito → 사용자 풀 → 사용자 관리 → 사용자에서 지울 것) ${msg.split("\n")[0]}`);
    }
  }
}

for (const [ok, what] of results) console.log(`${ok ? "통과" : "실패"}  ${what}`);
const failed = results.filter(([ok]) => !ok).length;
console.log(failed ? `smoke:auth:signup 실패 ${failed}건 (${base})` : `smoke:auth:signup 통과 ${results.length}건 (${base}, 인증 메일 1통 사용)`);
process.exit(failed ? 1 : 0);
