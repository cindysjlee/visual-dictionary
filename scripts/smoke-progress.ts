// 배포 후 학습 기록·권한·탈퇴 확인: node scripts/smoke-progress.ts [주소]. 메일을 쓰지 않는다.
// 사용자 A·B를 관리자 명령(AWS CLI, 프로필 vd)으로 만든다: 예약 도메인 example.com, 실행마다 다른 이름, 메일 보내지 않음(SUPPRESS).
// 확인: 토큰 없음·변조·만료 시각 조작 → 401, A 토큰으로 본문에 B의 userId를 넣어도 B 기록 그대로, B의 GET에 A 기록 없음,
// 다른 브라우저(새 컨텍스트)에서 같은 진행률, 화면에서 탈퇴(비밀번호 재확인) → Cognito에서 삭제 → 예전 토큰 PUT 거부 → 정리 후 테이블에 A 기록 0건.
// 최근 본 용어(/api/activity, RecentView)도 같은 토큰·분리·탈퇴 검사를 한다.
// 토큰·비밀번호는 출력하지 않는다. 끝나면(실패해도) 남은 사용자를 지우고, 못 지우면 이름을 출력한다
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium, type Browser } from "@playwright/test";
import { REAUTH_MAX_AGE_SECONDS } from "../services/api/src/account.ts";

const base = (process.argv[2] ?? process.env.SITE_URL ?? "https://d1y3rvak3nd08u.cloudfront.net").replace(/\/$/, "");
const profile = process.env.AWS_PROFILE ?? "vd";
const config = (await (await fetch(`${base}/config.json`)).json()) as { region: string; userPoolId: string };

const cli = (args: string[]) =>
  execFileSync("aws", [...args, "--region", config.region, "--profile", profile, "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const cognito = (...args: string[]) => cli(["cognito-idp", ...args, "--user-pool-id", config.userPoolId]);
const apiOutputs = Object.fromEntries(
  (JSON.parse(cli(["cloudformation", "describe-stacks", "--stack-name", "VisualDictionaryApi"])) as { Stacks: { Outputs: { OutputKey: string; OutputValue: string }[] }[] }).Stacks[0]!.Outputs.map(
    (o) => [o.OutputKey, o.OutputValue],
  ),
);
const itemsOf = (table: string, sub: string) =>
  (JSON.parse(cli(["dynamodb", "query", "--table-name", table, "--key-condition-expression", "userId = :u", "--expression-attribute-values", JSON.stringify({ ":u": { S: sub } })])) as {
    Items: { termId: { S: string } }[];
  }).Items;
/** 그 사용자의 학습 기록 수(탈퇴 표시 "#deleted" 제외) */
const recordCount = (sub: string) => itemsOf(apiOutputs.TableName!, sub).filter((i) => !i.termId.S.startsWith("#")).length;
/** 그 사용자의 최근 본 용어 수(RecentView에는 표시가 없어 전부 센다) */
const viewCount = (sub: string) => itemsOf(apiOutputs.ActivityTableName!, sub).length;

const results: [boolean, string][] = [];
const check = (ok: boolean, what: string) => results.push([ok, what]);
const runId = `${Date.now()}-${randomBytes(3).toString("hex")}`;
// C: 오래된 토큰 검사용(맨 처음 로그인해 두고, 5분이 지난 뒤 그 토큰으로 탈퇴를 시도한다. 기록은 쓰지 않는다)
const users = { A: `smoke-progress-a-${runId}@example.com`, B: `smoke-progress-b-${runId}@example.com`, C: `smoke-progress-c-${runId}@example.com` };
const labelOf = (email: string) => Object.entries(users).find(([, v]) => v === email)?.[0] ?? email;
const password = `Prog${randomBytes(9).toString("base64url")}1a`;
const created: string[] = [];

const api = (path: string, init: { method?: string; token?: string; body?: unknown } = {}) =>
  fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers: { ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const recordsOf = async (token: string) => ((await (await api("/api/progress", { token })).json()) as { records: { termId: string; read: boolean }[] }).records;
const recentOf = async (token: string) => {
  const res = await api("/api/activity", { token });
  const body = (await res.json()) as { recent?: { termId: string }[] };
  if (!res.ok || !body.recent) throw new Error(`GET /api/activity → ${res.status} ${JSON.stringify(body)}`);
  return body.recent;
};
/** 배포된 모든 API 경로의 실제 호출(새 경로를 만들면 여기에 넣어야 smoke가 통과한다, CLAUDE.md) */
const ROUTE_CALLS: Record<string, (token: string) => Promise<Response>> = {
  "GET /api/progress": (token) => api("/api/progress", { token }),
  "PUT /api/progress/{termId}": (token) => api("/api/progress/csrf", { method: "PUT", token, body: { read: true, source: "manual" } }),
  "GET /api/activity": (token) => api("/api/activity", { token }),
  "PUT /api/activity/{termId}": (token) => api("/api/activity/csrf", { method: "PUT", token }),
};
/** 부르면 탈퇴가 되므로 화면 탈퇴 단계에서 응답을 확인한다 */
const WITHDRAW_ROUTE = "DELETE /api/account";
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
  check(true, "테스트 사용자 A·B·C 생성(메일 없음)");

  browser = await chromium.launch({ channel: "chrome" });
  const c = await login(browser, users.C);
  const cLoginAt = Date.now();
  await c.context.close();
  const a = await login(browser, users.A);
  const b = await login(browser, users.B);
  const subA = payloadOf(a.token).sub;
  const subB = payloadOf(b.token).sub;

  // 토큰 검증(API Gateway JWT 인가)
  const [h, p, sig] = a.token.split(".") as [string, string, string];
  const flipped = sig.slice(0, -2) + (sig.at(-2) === "A" ? "B" : "A") + sig.at(-1);
  const expired = Buffer.from(JSON.stringify({ ...payloadOf(a.token), exp: Math.floor(Date.now() / 1000) - 3600 })).toString("base64url");
  for (const path of ["/api/progress", "/api/activity"]) {
    check((await api(path)).status === 401, `${path} 토큰 없음 → 401`);
    check((await api(path, { token: `${h}.${p}.${flipped}` })).status === 401, `${path} 서명을 바꾼 토큰 → 401`);
    check((await api(path, { token: `${h}.${expired}.${sig}` })).status === 401, `${path} 만료 시각을 과거로 바꾼 토큰 → 401`);
  }
  check((await api("/api/activity/csrf", { method: "PUT" })).status === 401, "최근 본 용어 PUT 토큰 없음 → 401");

  // 사용자 분리: 대상은 토큰의 sub로만 정한다
  check((await api("/api/progress/csrf", { method: "PUT", token: a.token, body: { read: true, source: "manual" } })).status === 200, "A가 csrf 읽음 저장 → 200");
  const spoof = await api("/api/progress/xss", { method: "PUT", token: a.token, body: { read: true, source: "manual", userId: subB } });
  check(spoof.status === 400, `A 토큰 + 본문에 B의 userId → ${spoof.status}(거부)`);
  const bRecords = await recordsOf(b.token);
  check(bRecords.length === 0, `B의 GET에 A 기록이 없고 B 기록도 그대로(0건): ${bRecords.map((r) => r.termId).join(", ") || "없음"}`);
  check(recordCount(subB) === 0, "테이블의 B 기록 0건");
  const aRecords = await recordsOf(a.token);
  check(aRecords.length === 1 && aRecords[0]!.termId === "csrf" && aRecords[0]!.read, "A의 GET에는 A의 csrf만");

  // 최근 본 용어도 같은 기준: 대상은 토큰의 sub, 본문은 받지 않는다(본 시각은 서버가 정함)
  check((await api("/api/activity/csrf", { method: "PUT", token: a.token })).status === 200, "A가 csrf 최근 본 용어 저장 → 200");
  const viewSpoof = await api("/api/activity/xss", { method: "PUT", token: a.token, body: { userId: subB } });
  check(viewSpoof.status === 400, `A 토큰 + 본문에 B의 userId(최근 본 용어) → ${viewSpoof.status}(거부)`);
  const bRecent = await recentOf(b.token);
  check(bRecent.length === 0, `B의 최근 본 용어 GET에 A 기록 없음(0건): ${bRecent.map((r) => r.termId).join(", ") || "없음"}`);
  check(viewCount(subB) === 0, "RecentView 테이블의 B 기록 0건");
  const aRecent = await recentOf(a.token);
  check(aRecent.length === 1 && aRecent[0]!.termId === "csrf", `A의 최근 본 용어 GET에는 A의 csrf만: ${aRecent.map((r) => r.termId).join(", ")}`);

  // 모든 API 경로를 실제 토큰으로 한 번씩(5xx면 실패). 경로 목록은 배포된 API Gateway 라우트에서 가져오고, smoke에 없는 경로가 있으면 실패한다.
  // A로 부른다(탈퇴 정리로 기록이 지워짐). DELETE /api/account는 아래 화면 탈퇴 단계에서 응답을 잡아 확인한다
  const deployed = (JSON.parse(cli(["apigatewayv2", "get-routes", "--api-id", apiOutputs.ApiDomain!.split(".")[0]!])) as { Items: { RouteKey: string }[] }).Items.map((r) => r.RouteKey).sort();
  const covered = [...Object.keys(ROUTE_CALLS), WITHDRAW_ROUTE].sort();
  const uncovered = deployed.filter((k) => !covered.includes(k));
  const stale = covered.filter((k) => !deployed.includes(k));
  check(!uncovered.length && !stale.length, `API 경로 ${deployed.length}개가 모두 smoke 목록에 있음${uncovered.length ? ` / smoke에 없는 경로: ${uncovered.join(", ")}` : ""}${stale.length ? ` / 배포에 없는 경로: ${stale.join(", ")}` : ""}`);
  for (const [route, call] of Object.entries(ROUTE_CALLS)) {
    const status = (await call(a.token)).status;
    check(status < 500, `실제 토큰으로 ${route} → ${status}(5xx 아님)`);
  }

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
  const withdrawRes = a.page.waitForResponse((r) => r.request().method() === "DELETE" && new URL(r.url()).pathname === "/api/account", { timeout: 30_000 });
  await a.page.getByRole("dialog", { name: "정말 탈퇴할까요?" }).getByRole("button", { name: "탈퇴", exact: true }).click();
  const withdrawStatus = (await withdrawRes).status();
  check(withdrawStatus < 300, `실제 토큰으로 ${WITHDRAW_ROUTE} → ${withdrawStatus}(화면 탈퇴)`);
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
  const viewAfter = await api("/api/activity/xss", { method: "PUT", token: a.token });
  check(viewAfter.status === 403, `탈퇴 직후 예전 토큰으로 최근 본 용어 PUT → ${viewAfter.status}(거부)`);
  let left = recordCount(subA);
  let viewsLeft = viewCount(subA);
  for (let i = 0; i < 30 && left + viewsLeft > 0; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    left = recordCount(subA);
    viewsLeft = viewCount(subA);
  }
  check(left === 0, `정리 후 테이블에 A 기록 ${left}건`);
  check(viewsLeft === 0, `정리 후 RecentView에 A 기록 ${viewsLeft}건`);
  const again = await api("/api/progress/tcp-handshake", { method: "PUT", token: a.token, body: { read: true, source: "manual" } });
  check(again.status === 403 && recordCount(subA) === 0, `정리 뒤에도 예전 토큰 PUT → ${again.status}, 테이블 0건 유지`);
  const viewAgain = await api("/api/activity/tcp-handshake", { method: "PUT", token: a.token });
  check(viewAgain.status === 403 && viewCount(subA) === 0, `정리 뒤에도 예전 토큰 최근 본 용어 PUT → ${viewAgain.status}, RecentView 0건 유지`);

  // 탈퇴 재인증(서버): 로그인한 지 5분이 넘은 토큰으로 API를 직접 불러 탈퇴 → 거부, 계정은 남는다
  const waitMs = cLoginAt + (REAUTH_MAX_AGE_SECONDS + 20) * 1000 - Date.now();
  if (waitMs > 0) {
    console.log(`오래된 토큰 검사: C가 로그인한 지 ${REAUTH_MAX_AGE_SECONDS + 20}초가 되도록 ${Math.ceil(waitMs / 1000)}초 기다립니다`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  const staleRes = await api("/api/account", { method: "DELETE", token: c.token });
  const staleError = ((await staleRes.json().catch(() => ({}))) as { error?: string }).error;
  let cStillExists = true;
  try {
    cognito("admin-get-user", "--username", users.C);
  } catch {
    cStillExists = false;
  }
  check(staleRes.status === 403 && staleError === "reauth-required" && cStillExists, `5분 넘은 토큰으로 DELETE /api/account → ${staleRes.status} ${staleError ?? ""}(거부), 계정 남음: ${cStillExists}`);
} catch (e) {
  check(false, `진행 중 실패: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
} finally {
  await browser?.close();
  for (const email of [...created]) {
    try {
      cognito("admin-delete-user", "--username", email);
      check(true, `테스트 사용자 삭제: ${labelOf(email)}`);
    } catch (e) {
      check(false, `테스트 사용자 삭제 실패 → 남은 사용자: ${email} (콘솔: Cognito → 사용자 풀 → 사용자 관리 → 사용자) ${e instanceof Error ? e.message.split("\n")[0] : ""}`);
    }
  }
}

for (const [ok, what] of results) console.log(`${ok ? "통과" : "실패"}  ${what}`);
const failed = results.filter(([ok]) => !ok).length;
console.log(failed ? `smoke:progress 실패 ${failed}건 (${base})` : `smoke:progress 통과 ${results.length}건 (${base})`);
process.exit(failed ? 1 : 0);
