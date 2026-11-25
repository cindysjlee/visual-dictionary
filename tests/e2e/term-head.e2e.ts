// 용어 상세 머리 영역(@explore): 제목 바로 아래에 설명이 붙고(오른쪽 세로 열 없음), 설명·플레이어는 카드 폭을 쓰며, 설명 줄은 55~60자 안팎이다(--measure-ko).
// 완독 표시: 완독한 용어에만 제목 줄 오른쪽에 작은 完 도장(날짜만, 제목 줄 높이는 그대로), 완독 표시·취소·로그인 안내는 글 맨 끝 한 줄 블록.
// Tab 순서는 본문(각주) → 글 끝 완독 버튼 → 플레이어. 대상 용어는 content/terms에서 자동으로 늘어난다. 기본 1440×900, 좁은 화면은 390×844
import { expect, test, type Page } from "@playwright/test";
import { terms } from "./terms.ts";

type Rect = { l: number; t: number; r: number; b: number };
const EMAIL = "head@example.com";

/** 머리 영역 안 요소들의 사각형(문서 좌표)과 설명 문단의 줄마다 글자 수(한 줄 정의와 코드 표기가 든 문단은 뺀다) */
const layout = (page: Page) =>
  page.evaluate(() => {
    const rect = (sel: string): Rect | undefined => {
      const el = document.querySelector(sel);
      if (!el) return undefined;
      const b = el.getBoundingClientRect();
      return { l: b.left, t: b.top + scrollY, r: b.right, b: b.bottom + scrollY };
    };
    const lines: number[] = [];
    for (const p of document.querySelectorAll(".la-term-head p.term-desc")) {
      // 한 줄 정의는 글자가 커서, 고정폭 코드 표기가 든 문단은 글자 폭이 달라(코드가 더 넓다) 글자 수 비교에서 뺀다
      if (p.closest(".is-definition") || p.querySelector("code")) continue;
      const rows = new Map<number, number>();
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if ((n.parentElement as HTMLElement).closest(".la-fn-box")) continue;
        const text = n.textContent ?? "";
        for (let i = 0; i < text.length; i++) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + 1);
          const b = r.getBoundingClientRect();
          if (b.width) rows.set(Math.round(b.top / 4), (rows.get(Math.round(b.top / 4)) ?? 0) + 1);
        }
      }
      // 마지막 줄은 짧을 수 있어 뺀다
      lines.push(...[...rows.values()].slice(0, -1));
    }
    return {
      head: rect(".la-term-head"),
      title: rect(".la-term-title"),
      row: rect(".la-term-titlerow"),
      stamp: rect(".la-term-stamp"),
      body: rect(".la-explain, .la-term-head > .la-term-def"),
      end: rect(".la-study-end"),
      fig: rect(".la-term-fig"),
      lines,
      scrollOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

/** 로그인한 상태로 시작한다(가짜 인증). 기록은 따로 넣는다 */
async function signIn(page: Page) {
  await page.goto("/");
  await page.evaluate((e) => {
    localStorage.setItem("fake-auth-users", JSON.stringify({ [e]: { password: "abc12345", confirmed: true } }));
    localStorage.setItem("fake-auth-session", e);
  }, EMAIL);
}
/** 가짜 기록 API에 이 용어를 완독으로 넣는다 */
const markRead = (page: Page, id: string) =>
  page.evaluate(
    ([e, termId]) => {
      localStorage.setItem("fake-progress", JSON.stringify({ [e as string]: { [termId as string]: { termId, read: true, source: "manual", updatedAt: "2026-11-24T09:00:00Z" } } }));
    },
    [EMAIL, id] as const,
  );

for (const term of terms) {
  test(`${term.id} · 머리 영역: 제목 바로 아래에 설명, 오른쪽 세로 열 없음, 글 끝에 완독 블록, 설명 줄은 55~60자 안팎(1440 → 390 한 열)`, { tag: ["@explore", `@${term.id}`] }, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/terms/${term.id}`);
    await expect(page.locator(".la-term-fig .caption-text")).toBeVisible();
    await expect(page.locator(".study-card")).toHaveCount(0); // 옛 완독 칸(오른쪽 세로 열)은 없다

    // 넓은 화면
    const wide = await layout(page);
    const { head, title, body, end, fig } = wide as { [k in "head" | "title" | "body" | "end" | "fig"]: Rect };
    // 설명은 제목(원어·분야 줄) 바로 아래에 붙고 카드 왼쪽 안쪽 여백부터 시작한다. 플레이어 카드는 머리 카드와 같은 폭
    expect(body.t - title.b).toBeLessThanOrEqual(24);
    expect(body.t).toBeGreaterThanOrEqual(title.b - 1);
    expect(Math.abs(body.l - title.l)).toBeLessThanOrEqual(1);
    expect(Math.abs(fig.l - head.l)).toBeLessThanOrEqual(1);
    expect(Math.abs(fig.r - head.r)).toBeLessThanOrEqual(1);
    // 글 맨 끝 완독 블록: 설명(각주 목록 포함) 뒤, 그림 앞, 설명과 같은 왼쪽
    expect(end.t).toBeGreaterThanOrEqual(body.b - 1);
    expect(end.b).toBeLessThanOrEqual(fig.t + 1);
    expect(Math.abs(end.l - body.l)).toBeLessThanOrEqual(1);
    // 줄 길이 상한(--measure-ko = 48.4rem): 문단 폭이 이 값을 넘지 않는다. 글자 수로는 줄마다 띄어쓰기 포함 52~60자 안팎이다.
    // 글자 수는 영문·숫자가 많은 글에서 달라지므로, 설명 틀로 옮긴 용어(문단이 여러 개라 줄이 충분한 것)에서만 가운데 값을 본다
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect((body.r - body.l) / rem).toBeLessThanOrEqual(48.4 + 0.1);
    expect((body.r - body.l) / rem).toBeGreaterThanOrEqual(47); // 오른쪽 열에 눌려 좁아지지 않는다
    if (typeof term.description !== "string" && wide.lines.length >= 8) {
      const sorted = [...wide.lines].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      expect(median).toBeGreaterThanOrEqual(50);
      expect(median).toBeLessThanOrEqual(62);
    }
    // 설명이 카드 오른쪽 끝까지 늘어나지 않는다(줄 길이 상한)
    expect(body.r).toBeLessThan(head.r - 100);
    expect(wide.scrollOver).toBeLessThanOrEqual(0);
    // 로그아웃: 글 끝 블록은 로그인 링크 하나, 도장은 없다
    await expect(page.locator(".la-study-end").getByRole("link", { name: "로그인하고 完 도장 남기기" })).toBeVisible();
    await expect(page.locator(".la-term-stamp")).toHaveCount(0);

    // 좁은 화면: 한 열(제목 → 설명 → 글 끝 완독 블록), 가로 스크롤 없음
    await page.setViewportSize({ width: 390, height: 844 });
    const narrow = await layout(page);
    const n = narrow as { [k in "head" | "title" | "body" | "end" | "fig"]: Rect };
    expect(n.body.t).toBeGreaterThanOrEqual(n.title.b - 1);
    expect(n.end.t).toBeGreaterThanOrEqual(n.body.b - 1);
    expect(Math.abs(n.body.l - n.title.l)).toBeLessThanOrEqual(1);
    expect(n.body.r).toBeLessThanOrEqual(n.head.r + 1);
    expect(narrow.scrollOver).toBeLessThanOrEqual(0);
  });

  test(`${term.id} · 완독한 용어: 제목 줄 오른쪽에 작은 完 도장(날짜만), 제목 줄 높이는 그대로(1440), 390px에서도 제목 줄 안`, { tag: ["@explore", `@${term.id}`] }, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signIn(page);
    await page.goto(`/terms/${term.id}`);
    await expect(page.locator(".la-term-fig .caption-text")).toBeVisible();
    await expect(page.locator(".la-study-end").getByRole("button", { name: "다 읽었으면 完 도장 찍기" })).toBeVisible();
    await expect(page.locator(".la-term-stamp")).toHaveCount(0); // 완독 전에는 도장이 없다
    const before = await layout(page);

    await markRead(page, term.id);
    await page.reload();
    await expect(page.locator(".la-term-stamp")).toBeVisible();
    const after = await layout(page);
    const row0 = before.row!;
    const { row, stamp } = after as { row: Rect; stamp: Rect };
    // 제목 줄 높이는 도장 때문에 늘지 않는다
    expect(row.b - row.t).toBeLessThanOrEqual(row0.b - row0.t + 1);
    // 도장은 제목 줄 안 오른쪽
    expect(stamp.t).toBeGreaterThanOrEqual(row.t - 1);
    expect(stamp.b).toBeLessThanOrEqual(row.b + 1);
    expect(stamp.r).toBeLessThanOrEqual(row.r + 1);
    expect(stamp.l).toBeGreaterThan(row.l + (row.r - row.l) * 0.3);
    // 날짜만: 문구·버튼 없이 날짜 글자와 그림. 읽어 주는 이름은 "완독함, 날짜"
    await expect(page.locator(".la-term-stamp")).toHaveAttribute("aria-label", "완독함, 2026년 11월 24일");
    await expect(page.locator(".la-term-stamp .la-seal-date")).toHaveText("2026.11.24");
    await expect(page.locator(".la-term-stamp").getByRole("button")).toHaveCount(0);
    await expect(page.locator(".la-study-end")).toContainText(/^完 2026\.11\.24 ·\s*완독 취소$/);

    await page.setViewportSize({ width: 390, height: 844 });
    const narrow = await layout(page);
    const nr = narrow as { row: Rect; stamp: Rect };
    expect(nr.stamp.t).toBeGreaterThanOrEqual(nr.row.t - 1);
    expect(nr.stamp.b).toBeLessThanOrEqual(nr.row.b + 1);
    expect(nr.stamp.r).toBeLessThanOrEqual(nr.row.r + 1);
    expect(narrow.scrollOver).toBeLessThanOrEqual(0);
  });
}

test("Tab 순서: 본문(각주 단어) → 글 끝 완독 버튼 → 플레이어 (넓은 화면·좁은 화면)", { tag: ["@explore", "@ssrf"] }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/terms/ssrf");
    await expect(page.locator(".la-term-fig .caption-text")).toBeVisible();
    await expect(page.locator(".la-study-end").getByRole("button", { name: "다 읽었으면 完 도장 찍기" })).toBeVisible();
    const zones: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      zones.push(
        await page.evaluate(() => {
          const e = document.activeElement as HTMLElement;
          return e.closest(".la-study-end") ? "study" : e.closest(".la-explain") ? "explain" : e.closest(".la-term-fig") ? "player" : "other";
        }),
      );
    }
    // 처음 나온 순서: explain → study → player (제목·도장은 포커스를 받지 않는다)
    const firsts = (["explain", "study", "player"] as const).map((z) => zones.indexOf(z));
    expect(firsts.every((i) => i >= 0), `${width}px: ${zones.join(",")}`).toBe(true);
    expect(firsts[0]).toBeLessThan(firsts[1]!);
    expect(firsts[1]).toBeLessThan(firsts[2]!);
    // 글 끝 완독 블록 뒤에는 본문으로 되돌아가지 않는다
    expect(zones.slice(firsts[1]).includes("explain")).toBe(false);
  }
});
