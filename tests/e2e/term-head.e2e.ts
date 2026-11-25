// 용어 상세 머리 영역(@explore): 제목 바로 아래에 설명이 붙고(오른쪽 세로 열 없음), 설명·플레이어는 카드 폭을 쓰며, 설명 줄은 55~60자 안팎이다(--measure-ko).
// 완독 도장(CH-67): 로그인하면 제목 줄 오른쪽에 큰 完 도장 열(1440px에서 지름 80px 이상, 390px에서 약 56px). 찍힘은 날짜·완독 취소, 안 찍힘·취소함은 흐린 윤곽.
// 도장이 있어도 제목과 정의 사이는 벌어지지 않고, 긴 제목은 도장과 겹치지 않는다. Tab 순서는 문서 순서(완독 취소 → 본문 각주 → 플레이어).
// 대상 용어는 content/terms에서 자동으로 늘어난다. 기본 1440×900, 좁은 화면은 390×844
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
      heading: rect(".la-term-title h1"),
      top: rect(".la-term-top"),
      stamp: rect(".la-term-stamp"),
      seal: rect(".la-term-stamp .la-seal"),
      body: rect(".la-explain, .la-term-head > .la-term-def"),
      fig: rect(".la-term-fig"),
      // 설명 문단의 가장 넓은 폭: 그림이 있는 용어는 설명 칸이 카드 폭 전체라서 문단 폭으로 줄 길이 상한을 본다
      paraRight: Math.max(...[...document.querySelectorAll(".la-term-head p.term-desc")].map((p) => p.getBoundingClientRect().right)),
      sealWidth: parseFloat(getComputedStyle(document.querySelector(".la-term-stamp .la-seal") ?? document.body).width),
      maxPara: Math.max(...[...document.querySelectorAll(".la-term-head p.term-desc")].map((p) => p.getBoundingClientRect().width)),
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
/** 가짜 기록 API에 이 용어의 기록을 넣는다(read=true 완독, false 취소함). 이 기기의 다른 기록은 지운다 */
const markRecord = (page: Page, id: string, read: boolean) =>
  page.evaluate(
    ([e, termId, r]) => {
      localStorage.setItem("fake-progress", JSON.stringify({ [e as string]: { [termId as string]: { termId, read: r, source: "manual", updatedAt: "2026-11-24T09:00:00Z" } } }));
    },
    [EMAIL, id, read] as const,
  );
for (const term of terms) {
  test(`${term.id} · 머리 영역: 제목 바로 아래에 설명, 오른쪽 세로 열 없음, 글 끝 완독 블록 없음, 설명 줄은 55~60자 안팎(1440 → 390 한 열)`, { tag: ["@explore", `@${term.id}`] }, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/terms/${term.id}`);
    await expect(page.locator(".la-term-fig .caption-text")).toBeVisible();
    await expect(page.locator(".study-card")).toHaveCount(0); // 옛 완독 칸(오른쪽 세로 열)은 없다
    await expect(page.locator(".la-study-end")).toHaveCount(0); // 글 끝 완독 블록도 없다(완독은 애니메이션 끝에서 자동)

    // 넓은 화면
    const wide = await layout(page);
    const { head, title, body, fig } = wide as { [k in "head" | "title" | "body" | "fig"]: Rect };
    // 설명은 제목(원어·분야 줄) 바로 아래에 붙고 카드 왼쪽 안쪽 여백부터 시작한다. 플레이어 카드는 머리 카드와 같은 폭
    expect(body.t - title.b).toBeLessThanOrEqual(24);
    expect(body.t).toBeGreaterThanOrEqual(title.b - 1);
    expect(Math.abs(body.l - title.l)).toBeLessThanOrEqual(1);
    expect(Math.abs(fig.l - head.l)).toBeLessThanOrEqual(1);
    expect(Math.abs(fig.r - head.r)).toBeLessThanOrEqual(1);
    // 설명(각주 목록 포함) 뒤에 바로 그림 카드가 온다
    expect(fig.t).toBeGreaterThanOrEqual(body.b - 1);
    // 줄 길이 상한(--measure-ko = 48.4rem): 문단 폭이 이 값을 넘지 않는다. 글자 수로는 줄마다 띄어쓰기 포함 52~60자 안팎이다.
    // 글자 수는 영문·숫자가 많은 글에서 달라지므로, 설명 틀로 옮긴 용어(문단이 여러 개라 줄이 충분한 것)에서만 가운데 값을 본다
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(wide.maxPara / rem).toBeLessThanOrEqual(48.4 + 0.1);
    expect(wide.maxPara / rem).toBeGreaterThanOrEqual(47); // 오른쪽 열에 눌려 좁아지지 않는다
    if (typeof term.description !== "string" && wide.lines.length >= 8) {
      const sorted = [...wide.lines].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      expect(median).toBeGreaterThanOrEqual(50);
      expect(median).toBeLessThanOrEqual(62);
    }
    // 문단이 카드 오른쪽 끝까지 늘어나지 않는다(줄 길이 상한). 설명 틀 자체는 카드 폭 전체라(구분선이 카드 폭을 쓴다) 문단의 오른쪽 끝으로 본다
    expect(wide.paraRight).toBeLessThan(head.r - 100);
    expect(wide.scrollOver).toBeLessThanOrEqual(0);
    // 로그아웃: 제목 옆 도장은 없고, 플레이어 아래에 로그인 안내가 있다
    await expect(page.locator(".la-term-stamp")).toHaveCount(0);
    await expect(page.locator(".la-term-fig").getByText("로그인하면 완독이 기록돼요")).toBeVisible();
    await expect(page.locator(".la-term-fig").getByRole("link", { name: "로그인", exact: true })).toBeVisible();

    // 좁은 화면: 한 열(제목 → 설명), 가로 스크롤 없음
    await page.setViewportSize({ width: 390, height: 844 });
    const narrow = await layout(page);
    const n = narrow as { [k in "head" | "title" | "body" | "fig"]: Rect };
    expect(n.body.t).toBeGreaterThanOrEqual(n.title.b - 1);
    expect(Math.abs(n.body.l - n.title.l)).toBeLessThanOrEqual(1);
    expect(n.body.r).toBeLessThanOrEqual(n.head.r + 1);
    expect(narrow.scrollOver).toBeLessThanOrEqual(0);
  });

  test(`${term.id} · 큰 完 도장: 1440px에서 지름 80px 이상·제목과 정의 사이 그대로·안 찍힘(흐린 윤곽·안내) → 찍힘(날짜·완독 취소) → 취소함(다시 찍기), 390px에서 제목과 겹치지 않음`, { tag: ["@explore", `@${term.id}`] }, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signIn(page);
    const open = async () => {
      await page.goto(`/terms/${term.id}`);
      await expect(page.locator(".la-term-fig .caption-text")).toBeVisible();
    };
    const stamp = page.locator(".la-term-stamp");

    // 아직 안 찍음: 흐린 윤곽 도장 + 안내, 누를 수 없다
    await open();
    await expect(stamp.getByText("애니메이션을 끝까지 보면 찍혀요")).toBeVisible();
    await expect(stamp.getByRole("button")).toHaveCount(0);
    await expect(stamp.locator(".la-seal.is-ghost")).toBeVisible();
    const never = await layout(page);
    expect(never.sealWidth).toBeGreaterThanOrEqual(80); // 작아지는 회귀 방지

    // 찍힘
    await markRecord(page, term.id, true);
    await page.reload();
    await expect(stamp.getByRole("button", { name: "완독 취소" })).toBeVisible();
    const wide = await layout(page);
    const { title, heading, stamp: box, seal, top } = wide as { [k in "title" | "heading" | "stamp" | "seal" | "top"]: Rect };
    expect(wide.sealWidth).toBeGreaterThanOrEqual(80);
    expect(wide.sealWidth).toBeLessThanOrEqual(100);
    // 제목 블록(제목·원어)과 겹치지 않고, 같은 높이대의 오른쪽에 있다
    expect(box.l).toBeGreaterThanOrEqual(title.r - 1);
    expect(seal.t).toBeGreaterThanOrEqual(top.t - 8); // 비스듬히 기울어 바깥 사각형이 조금 커진다
    expect(seal.t).toBeLessThanOrEqual(heading.b);
    // 도장이 있어도 제목과 정의(설명) 사이는 도장이 없을 때와 같다
    expect(Math.abs(wide.body!.t - never.body!.t)).toBeLessThanOrEqual(1);
    // 날짜 → 완독 취소 버튼 순서로 도장 아래에 놓인다
    const date = await page.locator(".la-term-stamp .la-seal-date").boundingBox();
    const cancel = await stamp.getByRole("button", { name: "완독 취소" }).boundingBox();
    expect(date!.y).toBeGreaterThan(box.t + 80);
    expect(cancel!.y).toBeGreaterThanOrEqual(date!.y + date!.height - 1);
    await expect(stamp.locator(".la-seal-date")).toHaveText("2026.11.24");
    // 버튼이 실제로 눌린다: 뒤따르는 설명 틀(카드 폭 전체)이 버튼 위를 덮지 않는다(trial = 누르지 않고 누를 수 있는지만 확인)
    await stamp.getByRole("button", { name: "완독 취소" }).click({ trial: true });
    await expect(stamp.getByRole("img")).toHaveAttribute("aria-label", "완독함, 2026년 11월 24일");

    // 취소함: 흐린 윤곽 + 다시 찍기
    await markRecord(page, term.id, false);
    await page.reload();
    await expect(stamp.getByRole("button", { name: "다시 찍기" })).toBeVisible();
    await expect(stamp.locator(".la-seal.is-ghost")).toBeVisible();
    await stamp.getByRole("button", { name: "다시 찍기" }).click({ trial: true });

    // 좁은 화면(390px): 도장 약 56px, 제목 오른쪽 열, 겹침·가로 스크롤 없음. 날짜·취소 버튼은 도장 아래
    await markRecord(page, term.id, true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(stamp.getByRole("button", { name: "완독 취소" })).toBeVisible();
    const narrow = await layout(page);
    const nr = narrow as { [k in "title" | "heading" | "stamp" | "seal" | "top" | "head"]: Rect };
    expect(narrow.sealWidth).toBeGreaterThanOrEqual(50);
    expect(narrow.sealWidth).toBeLessThanOrEqual(64);
    expect(nr.stamp.l).toBeGreaterThanOrEqual(nr.title.r - 1); // 제목(긴 제목은 줄바꿈)과 겹치지 않는다
    expect(nr.stamp.r).toBeLessThanOrEqual(nr.head.r + 1);
    expect(nr.seal.t).toBeLessThanOrEqual(nr.heading.b);
    const d2 = await page.locator(".la-term-stamp .la-seal-date").boundingBox();
    const c2 = await stamp.getByRole("button", { name: "완독 취소" }).boundingBox();
    expect(d2!.y).toBeGreaterThan(nr.seal.t + 50);
    expect(c2!.y).toBeGreaterThanOrEqual(d2!.y + d2!.height - 1);
    await stamp.getByRole("button", { name: "완독 취소" }).click({ trial: true });
    expect(narrow.scrollOver).toBeLessThanOrEqual(0);
  });

  test(`${term.id} · 구분선 폭: 부분 사이 선과 각주 위 선이 모두 카드 안쪽 폭 전체이고(라이트·다크, 1440·390px), 각주 목록 글은 본문 폭 제한을 유지한다`, { tag: ["@explore", `@${term.id}`] }, async ({ page }) => {
    if (typeof term.description === "string") {
      // 초안 자리 표시 설명(문단 하나)은 설명 틀이 없어 구분선도 없다
      await page.goto(`/terms/${term.id}`);
      await expect(page.locator(".la-term-head p.term-desc")).toBeVisible();
      await expect(page.locator(".la-explain")).toHaveCount(0);
      return;
    }
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/terms/${term.id}`);
        await expect(page.locator(".la-explain")).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
        const m = await page.evaluate(() => {
          const card = document.querySelector(".la-term-head")!;
          const cs = getComputedStyle(card);
          const cr = card.getBoundingClientRect();
          const inner = { l: cr.left + parseFloat(cs.paddingLeft), r: cr.right - parseFloat(cs.paddingRight) };
          // 카드 안에서 위·아래 한쪽에만 테두리 선이 있는 요소 = 구분선(부분 사이 선, 각주 위 선). 풀이 상자(.la-fn-box)와 그림 틀(.la-tfig-svg)은 네 면 테두리라 아니다
          const rules = [...card.querySelectorAll("*")]
            .filter((el) => {
              const c = getComputedStyle(el);
              return parseFloat(c.borderTopWidth) > 0 && c.borderTopStyle !== "none" && !(parseFloat(c.borderBottomWidth) > 0) && !(parseFloat(c.borderLeftWidth) > 0);
            })
            .map((el) => {
              const r = el.getBoundingClientRect();
              return { name: `${el.tagName.toLowerCase()}.${el.className}`, l: r.left, r: r.right };
            });
          const list = document.querySelector(".la-footnotes ul")?.getBoundingClientRect();
          return { inner, rules, listWidth: list?.width, rem: parseFloat(getComputedStyle(document.documentElement).fontSize), scrollOver: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        const tag = `${colorScheme} ${width}px`;
        expect(m.rules.length, `${tag}: 구분선이 있어야 한다(부분 3개 + 각주)`).toBeGreaterThanOrEqual(3);
        for (const r of m.rules) {
          expect(Math.abs(r.l - m.inner.l), `${tag} ${r.name} 왼쪽`).toBeLessThanOrEqual(2);
          expect(Math.abs(r.r - m.inner.r), `${tag} ${r.name} 오른쪽(선 끝 ${Math.round(r.r)}, 카드 안쪽 끝 ${Math.round(m.inner.r)})`).toBeLessThanOrEqual(2);
        }
        if (m.listWidth !== undefined) expect(m.listWidth / m.rem, `${tag}: 각주 목록 본문 폭 제한`).toBeLessThanOrEqual(48.4 + 0.1);
        expect(m.scrollOver).toBeLessThanOrEqual(0);
      }
    }
  });
}
test("Tab 순서(문서 순서): 완독 취소 → 본문(각주 단어) → 플레이어 (넓은 화면·좁은 화면)", { tag: ["@explore", "@ssrf"] }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await markRecord(page, "ssrf", true);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/terms/ssrf");
    await expect(page.locator(".la-term-fig .caption-text")).toBeVisible();
    await expect(page.locator(".la-term-stamp").getByRole("button", { name: "완독 취소" })).toBeVisible();
    const zones: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      zones.push(
        await page.evaluate(() => {
          const e = document.activeElement as HTMLElement;
          return e.closest(".la-term-stamp") ? "stamp" : e.closest(".la-explain") ? "explain" : e.closest(".la-term-fig") ? "player" : "other";
        }),
      );
    }
    // 처음 나온 순서: stamp → explain → player (제목·도장 그림은 포커스를 받지 않는다)
    const firsts = (["stamp", "explain", "player"] as const).map((z) => zones.indexOf(z));
    expect(firsts.every((i) => i >= 0), `${width}px: ${zones.join(",")}`).toBe(true);
    expect(firsts[0]).toBeLessThan(firsts[1]!);
    expect(firsts[1]).toBeLessThan(firsts[2]!);
    // 완독 취소 버튼은 하나뿐이고, 본문으로 되돌아가지 않는다
    expect(zones.filter((z) => z === "stamp")).toHaveLength(1);
    expect(zones.slice(firsts[2]).includes("explain")).toBe(false);
  }
});