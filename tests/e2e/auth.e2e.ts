// 인증 E2E(@auth): 테스트 빌드의 가짜 인증(apps/web/src/features/auth/fake.ts) 위에서 화면 흐름을 확인한다. 실제 메일·Cognito 없음.
// 실제 Cognito는 배포 후 npm run smoke:auth가 확인한다. 고정 인증 코드는 123456
import { expect, test, type Page } from "@playwright/test";

const CODE = "123456";
const PW = "abc12345";
const tag = { tag: "@auth" };

const bar = (page: Page) => page.locator(".topbar");
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

/** 가짜 인증 저장소에 사용자를 넣는다(첫 화면을 연 뒤, 같은 출처의 localStorage) */
async function seedUser(page: Page, email: string, confirmed = true) {
  await page.goto("/");
  await page.evaluate(
    ([e, pw, c]) => localStorage.setItem("fake-auth-users", JSON.stringify({ [e as string]: { password: pw, confirmed: c } })),
    [email, PW, confirmed] as const,
  );
}

async function login(page: Page, email: string, password = PW) {
  await field(page, "이메일").fill(email);
  await field(page, "비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
}

test("가입 → 틀린 코드 → 맞는 코드로 로그인되어 next로 돌아오고, 새로고침해도 유지되며, 로그아웃된다", tag, async ({ page }) => {
  await page.goto("/auth/signup?next=%2Fterms%2Fcsrf");
  // 테스트·개발 빌드는 가짜 인증임을 화면에 밝힌다(실제 가입으로 착각하지 않게. 배포 빌드에는 없다: check:bundle)
  await expect(page.getByRole("note")).toContainText("개발용 가짜 인증");
  await field(page, "이메일").fill("new@example.com");
  await field(page, "비밀번호").fill("12345678");
  await field(page, "비밀번호 확인").fill("12345678");
  await page.getByRole("button", { name: "가입하기" }).click();
  await expect(page.getByRole("alert")).toContainText("영문 포함"); // 서버는 받지만 화면에서 막는다
  await field(page, "비밀번호").fill(PW);
  await field(page, "비밀번호 확인").fill(PW);
  await page.getByRole("button", { name: "가입하기" }).click();

  await expect(page).toHaveURL(/\/auth\/confirm\?next=%2Fterms%2Fcsrf$/);
  await expect(page.getByRole("status")).toContainText("인증 코드를 보냈어요");
  await expect(field(page, "이메일")).toHaveValue("new@example.com");
  await field(page, "인증 코드").fill("000000");
  await page.getByRole("button", { name: "인증하기" }).click();
  await expect(page.getByRole("alert")).toContainText("인증 코드가 맞지 않아요");
  await field(page, "인증 코드").fill(CODE);
  await page.getByRole("button", { name: "인증하기" }).click();

  await expect(page).toHaveURL(/\/terms\/csrf$/);
  await expect(bar(page)).toContainText("new@example.com");
  await page.reload();
  await expect(bar(page)).toContainText("new@example.com"); // 새로고침 후에도 로그인 유지(완료 기준)
  await bar(page).getByRole("button", { name: "로그아웃" }).click();
  await expect(bar(page).getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/auth/login?next=%2Fterms%2Fcsrf");
  await page.reload();
  await expect(bar(page).getByRole("link", { name: "로그인" })).toBeVisible();
});

test("이미 가입된 이메일은 가입할 수 없다고 알려 준다(요구사항, docs/03 한계)", tag, async ({ page }) => {
  await seedUser(page, "dup@example.com");
  await page.goto("/auth/signup");
  await field(page, "이메일").fill("dup@example.com");
  await field(page, "비밀번호").fill(PW);
  await field(page, "비밀번호 확인").fill(PW);
  await page.getByRole("button", { name: "가입하기" }).click();
  await expect(page.getByRole("alert")).toContainText("이미 가입된 이메일");
});

test("틀린 비밀번호와 없는 이메일은 같은 문구로 거부한다(존재 노출 방지)", tag, async ({ page }) => {
  await seedUser(page, "user@example.com");
  await page.goto("/auth/login");
  await login(page, "user@example.com", "wrong1234");
  await expect(page.getByRole("alert")).toHaveText("이메일 또는 비밀번호가 맞지 않아요.");
  await login(page, "nobody@example.com");
  await expect(page.getByRole("alert")).toHaveText("이메일 또는 비밀번호가 맞지 않아요.");
});

test("인증을 끝내지 않은 계정으로 로그인하면 코드 입력 화면으로 가고, 인증하면 로그인된다", tag, async ({ page }) => {
  await seedUser(page, "later@example.com", false);
  await page.goto("/auth/login");
  await login(page, "later@example.com");
  await expect(page).toHaveURL(/\/auth\/confirm$/);
  await expect(page.getByRole("status")).toContainText("새 코드를 보냈어요");
  await field(page, "인증 코드").fill(CODE);
  await page.getByRole("button", { name: "인증하기" }).click();
  await expect(page).toHaveURL(/\/terms$/); // next가 없으면 / → 저장된 로그인이 있어 목록으로
  await expect(bar(page)).toContainText("later@example.com");
});

test("비밀번호 재설정: 코드와 새 비밀번호 → 새 비밀번호로 로그인", tag, async ({ page }) => {
  await seedUser(page, "reset@example.com");
  await page.goto("/auth/login");
  await page.getByRole("link", { name: "비밀번호를 잊었어요" }).click();
  // 재설정 화면(lazy)이 뜬 뒤에 입력한다: 먼저 입력하면 아직 남은 로그인 화면의 칸에 들어간다(병렬 실행에서 드러남)
  await expect(page.getByRole("heading", { name: "비밀번호 재설정" })).toBeVisible();
  await field(page, "이메일").fill("reset@example.com");
  await page.getByRole("button", { name: "인증 코드 받기" }).click();
  await expect(page.getByRole("status")).toContainText("가입된 이메일이라면");
  await field(page, "인증 코드").fill(CODE);
  await field(page, "새 비밀번호").fill("new12345");
  await field(page, "새 비밀번호 확인").fill("new12345");
  await page.getByRole("button", { name: "비밀번호 바꾸기" }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await expect(page.getByRole("status")).toContainText("비밀번호를 바꿨어요");
  await expect(field(page, "이메일")).toHaveValue("reset@example.com");
  await field(page, "비밀번호").fill("new12345");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(bar(page)).toContainText("reset@example.com");
});

/** 재설정 화면에서 이메일을 넣고 코드 단계까지 간다 */
async function startReset(page: Page, email: string) {
  await page.goto("/auth/reset");
  await expect(page.getByRole("heading", { name: "비밀번호 재설정" })).toBeVisible();
  await field(page, "이메일").fill(email);
  await page.getByRole("button", { name: "인증 코드 받기" }).click();
  await expect(page.getByRole("status")).toContainText("가입된 이메일이라면");
}

test("비밀번호 재설정 실패: 틀린 코드는 거부되고 예전 비밀번호가 그대로, 확인이 다르면 보내기 전에 막는다", tag, async ({ page }) => {
  await seedUser(page, "reset-fail@example.com");
  await startReset(page, "reset-fail@example.com");
  await field(page, "인증 코드").fill("000000");
  await field(page, "새 비밀번호").fill("new12345");
  await field(page, "새 비밀번호 확인").fill("new12345");
  await page.getByRole("button", { name: "비밀번호 바꾸기" }).click();
  await expect(page.getByRole("alert")).toContainText("인증 코드가 맞지 않아요");

  await field(page, "인증 코드").fill(CODE);
  await field(page, "새 비밀번호 확인").fill("new12399");
  await page.getByRole("button", { name: "비밀번호 바꾸기" }).click();
  await expect(page.getByRole("alert")).toContainText("비밀번호 확인이 일치하지 않아요");
  await expect(page).toHaveURL(/\/auth\/reset$/);

  await page.goto("/auth/login");
  await login(page, "reset-fail@example.com");
  await expect(bar(page)).toContainText("reset-fail@example.com");
});

test("비밀번호 재설정: 가입하지 않은 이메일도 같은 안내(존재 노출 방지)이고 코드 단계에서 실패한다", tag, async ({ page }) => {
  await startReset(page, "nobody@example.com");
  await field(page, "인증 코드").fill(CODE);
  await field(page, "새 비밀번호").fill("new12345");
  await field(page, "새 비밀번호 확인").fill("new12345");
  await page.getByRole("button", { name: "비밀번호 바꾸기" }).click();
  await expect(page.getByRole("alert")).toContainText("인증 코드가 맞지 않아요");
});

for (const next of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)"]) {
  test(`next 차단: ${next} → 로그인 뒤 사이트 안(/ → 로그인 상태라 목록)`, tag, async ({ page, baseURL }) => {
    await seedUser(page, "safe@example.com");
    await page.goto(`/auth/login?next=${encodeURIComponent(next)}`);
    await login(page, "safe@example.com");
    await expect(bar(page)).toContainText("safe@example.com");
    expect(page.url()).toBe(`${baseURL}/terms`);
  });
}

test("상세: 로그아웃 상태로 끝까지 보면 로그인 안내 → 로그인하면 그 용어로 돌아온다", tag, async ({ page }) => {
  await page.addInitScript(() => Object.assign(globalThis, { __sceneSpeed: 10 }));
  await seedUser(page, "viewer@example.com");
  await page.goto("/terms/csrf");
  await page.getByRole("region", { name: "애니메이션 플레이어" }).locator(".stage-play").click();
  const notice = page.locator(".complete-notice");
  await expect(notice).toContainText("끝까지 봤어요", { timeout: 60_000 });
  await notice.getByRole("link", { name: "로그인하고 저장하기" }).click();
  await expect(page).toHaveURL(/\/auth\/login\?next=%2Fterms%2Fcsrf$/);
  await login(page, "viewer@example.com");
  await expect(page).toHaveURL(/\/terms\/csrf$/);
  // 로그인하면 학습 상태 카드가 기록 상태와 직접 전환 버튼을 보인다(6단계)
  await expect(page.locator(".study-card").getByRole("button", { name: "밑줄 긋기" })).toBeVisible();
});
