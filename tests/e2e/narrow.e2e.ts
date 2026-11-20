/// <reference lib="dom" />
// 360px 반응형(NFR-03, @narrow): 홈·상세(모든 용어)·계정 화면에서 가로 스크롤이 없고, 보이는 글자·버튼·입력이 화면 밖으로 잘리지 않는다.
// 주 대상은 데스크톱이라 이 파일만 360×800으로 돈다. 가로 스크롤 영역(overflow-x: auto) 안의 요소는 밀어서 볼 수 있으므로 제외한다
import { expect, test, type Page } from "@playwright/test";
import { terms } from "./terms.ts";

test.use({ viewport: { width: 360, height: 800 } });
const tag = { tag: "@narrow" };

async function signIn(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("fake-auth-users", JSON.stringify({ "narrow@example.com": { password: "abc12345", confirmed: true } }));
    localStorage.setItem("fake-auth-session", "narrow@example.com");
  });
}

/** 가로 스크롤 폭과, 화면 밖으로 나간 보이는 요소(최대 5개) */
const overflow = (page: Page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const scrollable = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(p).overflowX)) return true;
      }
      return false;
    };
    const out = [...document.querySelectorAll("h1, h2, h3, p, a, button, label, input, select, li, td, th, .tag")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden" || el.closest(".visually-hidden")) return false;
        return (r.left < -1 || r.right > width + 1) && !scrollable(el);
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className} "${(el.textContent ?? "").trim().slice(0, 20)}" right=${Math.round(el.getBoundingClientRect().right)}`);
    return { pageScroll: document.documentElement.scrollWidth - width, out };
  });

const PAGES: { name: string; path: string; ready: (page: Page) => Promise<void>; signedIn?: boolean }[] = [
  { name: "홈", path: "/", ready: async (p) => void (await expect(p.locator(".term-card").first()).toBeVisible()) },
  ...terms.map((t) => ({
    name: `상세 ${t.id}`,
    path: `/terms/${t.id}`,
    ready: async (p: Page) => void (await expect(p.locator(".caption-text")).toBeVisible()),
  })),
  { name: "로그인", path: "/auth/login", ready: async (p) => void (await expect(p.getByRole("button", { name: "로그인", exact: true })).toBeVisible()) },
  { name: "회원가입", path: "/auth/signup", ready: async (p) => void (await expect(p.getByRole("heading", { level: 1 })).toBeVisible()) },
  { name: "비밀번호 재설정", path: "/auth/reset", ready: async (p) => void (await expect(p.getByRole("heading", { name: "비밀번호 재설정" })).toBeVisible()) },
  { name: "내 학습(/me)", path: "/me", signedIn: true, ready: async (p) => void (await expect(p.getByRole("heading", { level: 1 })).toBeVisible()) },
  { name: "개인정보처리방침", path: "/privacy", ready: async (p) => void (await expect(p.getByRole("heading", { level: 1, name: "개인정보처리방침" })).toBeVisible()) },
];

for (const { name, path, ready, signedIn } of PAGES) {
  test(`360px · ${name}: 가로 스크롤·잘림 없음`, tag, async ({ page }) => {
    if (signedIn) await signIn(page);
    await page.goto(path);
    await ready(page);
    await page.waitForLoadState("networkidle");
    const { pageScroll, out } = await overflow(page);
    expect(pageScroll, "문서 가로 스크롤(px)").toBeLessThanOrEqual(0);
    expect(out, "화면 밖으로 나간 요소").toEqual([]);
  });
}
