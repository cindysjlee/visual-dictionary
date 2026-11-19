// 배포 후 학습 기록·권한·탈퇴 확인: node scripts/smoke-progress.ts [주소]. 메일을 쓰지 않는다.
// 사용자 A·B를 관리자 명령(AWS CLI, 프로필 vd)으로 만든다: 예약 도메인 example.com, 실행마다 다른 이름, 메일 보내지 않음(SUPPRESS).
// 확인: 토큰 없음·변조·만료 시각 조작 → 401, A 토큰으로 본문에 B의 userId를 넣어도 B 기록 그대로, B의 GET에 A 기록 없음,
// 다른 브라우저(새 컨텍스트)에서 같은 진행률, 화면에서 탈퇴(비밀번호 재확인) → Cognito에서 삭제 → 예전 토큰 PUT 거부 → 정리 후 테이블에 A 기록 0건.
// 토큰·비밀번호는 출력하지 않는다. 끝나면(실패해도) 남은 사용자를 지우고, 못 지우면 이름을 출력한다
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium, type Browser } from "@playwright/test";

const base = (process.argv[2] ?? process.env.SITE_URL ?? "https://d1y3rvak3nd08u.cloudfront.net").replace(/\/$/, "");
const profile = process.env.AWS_PROFILE ?? "vd";
const config = (await (await fetch(`${base}/config.json`)).json()) as { region: string; userPoolId: string };

const cli = (args: string[]) =>
  execFileSync("aws", [...args, "--region", config.region, "--profile", profile, "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const cognito = (...args: string[]) => cli(["cognito-idp", ...args, "--user-pool-id", config.userPoolId]);
const tableName = (JSON.parse(cli(["cloudformation", "describe-stacks", "--stack-name", "VisualDictionaryApi"])) as { Stacks: { Outputs: { OutputKey: string; OutputValue: string }[] }[] }).Stacks[0]!.Outputs.find(
  (o) => o.OutputKey === "TableName",
)!.OutputValue;
/** 그 사용자의 학습 기록 수(탈퇴 표시 "#deleted" 제외) */
const recordCount = (sub: string) =>
  (JSON.parse(cli(["dynamodb", "query", "--table-name", tableName, "--key-condition-expression", "userId = :u", "--expression-attribute-values", JSON.stringify({ ":u": { S: sub } })])) as {
    Items: { termId: { S: string } }[];
  }).Items.filter((i) => !i.termId.S.startsWith("#")).length;

const results: [boolean, string][] = [];
const check = (ok: boolean, what: string) => results.push([ok, what]);
const runId = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const users = { A: `smoke-progress-a-${runId}@example.com`, B: `smoke-progress-b-${runId}@example.com` };
const password = `Prog${randomBytes(9).toString("base64url")}1a`;
const created: string[] = [];

const api = (path: string, init: { method?: string; token?: string; body?: unknown } = {}) =>
  fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers: { ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const recordsOf = async (token: string) => ((await (await api("/api/progress", { token })).json()) as { records: { termId: string; read: boolean }[] }).records;
const payloadOf = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString("utf8")) as { sub: string; exp: number };

/** 화면에서 로그인하고 액세스 토큰을 꺼낸다(Amplify 기본 저장소) */
async function login(browser: Browser, email: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/auth/login`);
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.locator(".topbar").getByText(email).waitFor({ timeout: 30_000 });
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("CognitoIdentityServiceProvider.") && k.endsWith(".accessToken"));
    return key ? localStorage.getItem(key) : null;
  });
  if (!token) throw new Error("액세스 토큰을 찾지 못함");
  return { context, page, token };
}

let browser: Browser | undefined;
try {
  for (const email of Object.values(users)) {
    cognito("admin-create-user", "--username", email, "--message-action", "SUPPRESS", "--user-attributes", `Name=email,Value=${email}`, "Name=email_verified,Value=true");
    created.push(email);
    cognito("admin-set-user-password", "--username", email, "--password", password, "--permanent");
  }
  check(true, "테스트 사용자 A·B 생성(메일 없음)");

  browser = await chromium.launch({ channel: "chrome" });
  const a = await login(browser, users.A);
  const b = await login(browser, users.B);
  const subA = payloadOf(a.token).sub;
  const subB = payloadOf(b.token).sub;

  // 토큰 검증(API Gateway JWT 인가)
  check((await api("/api/progress")).status === 401, "토큰 없음 → 401");
  const [h, p, sig] = a.token.split(".") as [string, string, string];
  const flipped = sig.slice(0, -2) + (sig.at(-2) === "A" ? "B" : "A") + sig.at(-1);
  check((await api("/api/progress", { token: `${h}.${p}.${flipped}` })).status === 401, "서명을 바꾼 토큰 → 401");
  const expired = Buffer.from(JSON.stringify({ ...payloadOf(a.token), exp: Math.floor(Date.now() / 1000) - 3600 })).toString("base64url");
  check((await api("/api/progress", { token: `${h}.${expired}.${sig}` })).status === 401, "만료 시각을 과거로 바꾼 토큰 → 401");

  // 사용자 분리: 대상은 토큰의 sub로만 정한다
  check((await api("/api/progress/csrf", { method: "PUT", token: a.token, body: { read: true, source: "manual" } })).status === 200, "A가 csrf 읽음 저장 → 200");
  const spoof = await api("/api/progress/xss", { method: "PUT", token: a.token, body: { read: true, source: "manual", userId: subB } });
  check(spoof.status === 400, `A 토큰 + 본문에 B의 userId → ${spoof.status}(거부)`);
  const bRecords = await recordsOf(b.token);
  check(bRecords.length === 0, `B의 GET에 A 기록이 없고 B 기록도 그대로(0건): ${bRecords.map((r) => r.termId).join(", ") || "없음"}`);
  check(recordCount(subB) === 0, "테이블의 B 기록 0건");
  const aRecords = await recordsOf(a.token);
  check(aRecords.length === 1 && aRecords[0]!.termId === "csrf" && aRecords[0]!.read, "A의 GET에는 A의 csrf만");

  // 다른 브라우저(새 컨텍스트)에서 같은 진행률(완료 기준)
  const a2 = await login(browser, users.A);
  await a2.page.goto(`${base}/`);
  const total = await a2.page.locator(".progress-total").textContent({ timeout: 30_000 });
  check(/^1 \/ \d+ 용어를 읽었어요$/.test((total ?? "").trim()), `다른 브라우저에서 같은 진행률: ${total?.trim()}`);
  await a2.context.close();

  // 화면에서 탈퇴: 비밀번호 재확인(Cognito ChangePassword 같은 값) → 확인 대화상자 → 탈퇴
  await a.page.goto(`${base}/me`);
  const section = a.page.locator(".withdraw");
  await section.getByLabel("비밀번호", { exact: true }).fill(password);
  await section.getByRole("button", { name: "비밀번호 확인" }).click();
  // 대화상자 안의 "탈퇴" 버튼도 .btn-danger라서 "탈퇴하기" 글자로 좁힌다
  await section.locator("button.btn-danger:not([disabled])", { hasText: "탈퇴하기" }).waitFor({ timeout: 15_000 });
  check(true, "비밀번호 재확인(실제 Cognito) → 탈퇴 버튼 켜짐");
  await section.getByRole("button", { name: "탈퇴하기" }).click();
  await a.page.getByRole("dialog", { name: "정말 탈퇴할까요?" }).getByRole("button", { name: "탈퇴", exact: true }).click();
  await a.page.getByRole("status").filter({ hasText: "탈퇴했어요" }).waitFor({ timeout: 30_000 });
  check(true, "화면에서 탈퇴 → 홈 안내");

  let cognitoGone = false;
  try {
    cognito("admin-get-user", "--username", users.A);
  } catch (e) {
    cognitoGone = String(e).includes("UserNotFoundException");
  }
  check(cognitoGone, "Cognito에서 A 삭제됨");
  if (cognitoGone) created.splice(created.indexOf(users.A), 1);

  // 탈퇴 직후 예전 토큰(아직 유효)으로 저장 → 거부, 정리 후 테이블에 A 기록 0건
  const after = await api("/api/progress/xss", { method: "PUT", token: a.token, body: { read: true, source: "manual" } });
  check(after.status === 403, `탈퇴 직후 예전 토큰으로 PUT → ${after.status}(거부)`);
  let left = recordCount(subA);
  for (let i = 0; i < 30 && left > 0; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    left = recordCount(subA);
  }
  check(left === 0, `정리 후 테이블에 A 기록 ${left}건`);
  const again = await api("/api/progress/tcp-handshake", { method: "PUT", token: a.token, body: { read: true, source: "manual" } });
  check(again.status === 403 && recordCount(subA) === 0, `정리 뒤에도 예전 토큰 PUT → ${again.status}, 테이블 0건 유지`);
} catch (e) {
  check(false, `진행 중 실패: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
} finally {
  await browser?.close();
  for (const email of [...created]) {
    try {
      cognito("admin-delete-user", "--username", email);
      check(true, `테스트 사용자 삭제: ${email === users.A ? "A" : "B"}`);
    } catch (e) {
      check(false, `테스트 사용자 삭제 실패 → 남은 사용자: ${email} (콘솔: Cognito → 사용자 풀 → 사용자 관리 → 사용자) ${e instanceof Error ? e.message.split("\n")[0] : ""}`);
    }
  }
}

for (const [ok, what] of results) console.log(`${ok ? "통과" : "실패"}  ${what}`);
const failed = results.filter(([ok]) => !ok).length;
console.log(failed ? `smoke:progress 실패 ${failed}건 (${base})` : `smoke:progress 통과 ${results.length}건 (${base})`);
process.exit(failed ? 1 : 0);
