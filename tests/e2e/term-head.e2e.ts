// 용어 상세 머리 영역(@explore): 완독 칸은 맨 위(제목 줄)에서만 자리를 차지하고, 설명과 플레이어는 카드 폭을 쓴다.
// 설명 줄 길이는 한글 55~60자 안팎으로 제한(--measure-ko), 좁은 화면은 제목 → 완독 → 설명이 한 열로 쌓이고, Tab 순서는 완독 → 설명 → 플레이어.
// 대상 용어는 content/terms에서 자동으로 늘어난다. 기본 1440×900, 좁은 화면은 390×844
import { expect, test, type Page } from "@playwright/test";
import { terms } from "./terms.ts";

type Rect = { l: number; t: number; r: number; b: number };

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
      study: rect(".study-card"),
      body: rect(".la-explain, .la-term-head > .la-term-def"),
      fig: rect(".la-term-fig"),
      lines,
      scrollOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

for (const term of terms) {
  test(`${term.id} · 머리 영역: 완독 칸은 제목 줄에서만 자리를 차지하고, 설명·플레이어는 카드 폭을 쓰며, 설명 줄은 55~60자 안팎이다(1440 → 390 한 열)`, { tag: ["@explore", `@${term.id}`] }, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/terms/${term.id}`);
    await expect(page.locator(".la-term-fig .caption-text")).toBeVisible();

    // 넓은 화면
    const wide = await layout(page);
    const { head, title, study, body, fig } = wide as { [k in "head" | "title" | "study" | "body" | "fig"]: Rect };
    // 완독 칸은 머리 영역 오른쪽 위, 제목과 같은 줄. 설명은 제목·완독 칸 둘 다의 아래에서 시작
    expect(study.l).toBeGreaterThan(title.r - 1);
    expect(study.t).toBeLessThan(title.b);
    expect(body.t).toBeGreaterThanOrEqual(Math.max(title.b, study.b) - 1);
    // 설명은 카드 왼쪽 안쪽 여백부터(제목과 같은 왼쪽), 플레이어 카드는 머리 카드와 같은 폭
    expect(Math.abs(body.l - title.l)).toBeLessThanOrEqual(1);
    expect(Math.abs(fig.l - head.l)).toBeLessThanOrEqual(1);
    expect(Math.abs(fig.r - head.r)).toBeLessThanOrEqual(1);
    // 줄 길이 상한(--measure-ko = 48.4rem): 문단 폭이 이 값을 넘지 않는다. 글자 수로는 줄마다 띄어쓰기 포함 52~60자 안팎이다.
    // 글자 수는 영문·숫자가 많은 글에서 달라지므로, 설명 틀로 옮긴 용어(문단이 여러 개라 줄이 충분한 것)에서만 가운데 값을 본다
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect((body.r - body.l) / rem).toBeLessThanOrEqual(48.4 + 0.1);
    expect((body.r - body.l) / rem).toBeGreaterThanOrEqual(47); // 오른쪽 열에 눌려 좁아지지 않는다(예전: 약 43rem)
    if (typeof term.description !== "string" && wide.lines.length >= 8) {
      const sorted = [...wide.lines].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      expect(median).toBeGreaterThanOrEqual(50);
      expect(median).toBeLessThanOrEqual(62);
    }
    // 설명이 카드 오른쪽 끝까지 늘어나지 않는다(줄 길이 상한)
    expect(body.r).toBeLessThan(head.r - 100);
    expect(wide.scrollOver).toBeLessThanOrEqual(0);

    // 좁은 화면: 한 열(제목 → 완독 → 설명), 가로 스크롤 없음
    await page.setViewportSize({ width: 390, height: 844 });
    const narrow = await layout(page);
    const n = narrow as { [k in "head" | "title" | "study" | "body" | "fig"]: Rect };
    expect(n.study.t).toBeGreaterThanOrEqual(n.title.b - 1);
    expect(n.body.t).toBeGreaterThanOrEqual(n.study.b - 1);
    expect(Math.abs(n.study.l - n.title.l)).toBeLessThanOrEqual(24); // 완독 칸의 왼쪽 괘선·안쪽 여백만큼
    expect(Math.abs(n.body.l - n.title.l)).toBeLessThanOrEqual(1);
    expect(n.body.r).toBeLessThanOrEqual(n.head.r + 1);
    expect(narrow.scrollOver).toBeLessThanOrEqual(0);
  });
}

test("Tab 순서: 완독 칸 → 설명(각주 단어) → 플레이어 (넓은 화면·좁은 화면)", { tag: ["@explore", "@ssrf"] }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("fake-auth-users", JSON.stringify({ "tab@example.com": { password: "abc12345", confirmed: true } }));
    localStorage.setItem("fake-auth-session", "tab@example.com");
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/terms/ssrf");
    await expect(page.locator(".la-term-fig .caption-text")).toBeVisible();
    await expect(page.locator(".study-card").getByRole("button", { name: "완독으로 표시" })).toBeVisible();
    const zones: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      zones.push(
        await page.evaluate(() => {
          const e = document.activeElement as HTMLElement;
          return e.closest(".study-card") ? "study" : e.closest(".la-explain") ? "explain" : e.closest(".la-term-fig") ? "player" : "other";
        }),
      );
    }
    // 처음 나온 순서: study → explain → player (사이에 다른 칸 없이 이 세 칸이 차례로)
    const firsts = (["study", "explain", "player"] as const).map((z) => zones.indexOf(z));
    expect(firsts.every((i) => i >= 0), `${width}px: ${zones.join(",")}`).toBe(true);
    expect(firsts[0]).toBeLessThan(firsts[1]!);
    expect(firsts[1]).toBeLessThan(firsts[2]!);
    // 완독 칸 안에서 설명으로 넘어간 뒤 완독 칸으로 되돌아가지 않는다
    expect(zones.slice(firsts[1]).includes("study")).toBe(false);
  }
});
