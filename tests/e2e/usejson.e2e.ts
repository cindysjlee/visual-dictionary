// 정적 JSON 읽기(useJson) 경쟁(@usejson): 응답이 오기 전에 화면을 나갔다가 같은 화면으로 곧바로 돌아와도 "불러오는 중…"에 멈추지 않는다.
// 배경: 읽은 내용을 캐시하는 useJson이 "내용이 같으면 상태를 그대로 둔다"는 분기에서 아직 loading인 상태를 그대로 둬 영원히 멈췄다.
// 개발 서버(StrictMode)는 효과를 두 번 실행해 첫 방문에서도 같은 일이 났다(용어 쪽이 "불러오는 중…"에서 안 풀림). 운영 빌드에서도 이 시나리오로 재현된다
import { expect, test } from "@playwright/test";
import { terms } from "./terms.ts";

const tag = { tag: "@usejson" };
const cards = (page: import("@playwright/test").Page) => page.locator(".term-card .la-word");

test("색인을 열자마자 나갔다가 곧바로 돌아와도(응답이 늦게 옴) 목록이 뜬다", tag, async ({ page }) => {
  // index.json 응답을 1.2초 늦춘다: 첫 요청의 응답이 오기 전에 나갔다 돌아올 시간을 만든다
  await page.route("**/content/index.json", async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await page.goto("/about"); // 랜딩(index.json을 읽는 화면)에서 시작: 클라이언트 이동으로 색인에 간다
  await page.getByRole("link", { name: "색인" }).first().click(); // 색인을 열고 응답을 기다리는 중
  await expect(page).toHaveURL(/\/terms$/);
  await page.getByRole("link", { name: "소개" }).first().click(); // 응답이 오기 전에 나가고
  await expect(page).toHaveURL(/\/about$/);
  await page.getByRole("link", { name: "색인" }).first().click(); // 곧바로 돌아온다
  await expect(page).toHaveURL(/\/terms$/);
  await expect(cards(page)).toHaveCount(terms.length, { timeout: 10_000 });
});

test("용어 쪽을 열자마자 나갔다가 곧바로 돌아와도 플레이어까지 뜬다", tag, async ({ page }) => {
  const id = terms[0]!.id;
  await page.route(`**/content/terms/${id}.json`, async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await page.goto("/terms");
  await expect(cards(page)).toHaveCount(terms.length);
  await page.locator(`a[href="/terms/${id}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/terms/${id}$`));
  await page.goBack(); // 응답이 오기 전에 나가고
  await expect(page).toHaveURL(/\/terms$/);
  await page.goForward(); // 곧바로 돌아온다
  await expect(page).toHaveURL(new RegExp(`/terms/${id}$`));
  await expect(page.getByRole("region", { name: "애니메이션 플레이어" }).locator(".play-btn")).toBeVisible({ timeout: 15_000 });
});

test("용어 쪽을 처음 열 때(개발 서버처럼 효과가 두 번 실행돼도) 내용이 뜬다", tag, async ({ page }) => {
  // 개발 서버(draft 모드, StrictMode)에서는 이 한 줄이 곧 회귀 검사다. 운영 빌드에서도 같은 결과여야 한다
  const id = terms[0]!.id;
  await page.goto(`/terms/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("region", { name: "애니메이션 플레이어" }).locator(".play-btn")).toBeVisible({ timeout: 15_000 });
});
