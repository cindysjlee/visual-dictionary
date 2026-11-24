// 설명 틀과 각주(@explain): 한 줄 정의 → 쉬운 비유 → 어떻게 일어나나 → 왜 위험한가(왜 중요한가) → 각주 목록의 구성과 순서,
// 각주 단어(점선 밑줄, 단어 전체가 트리거)의 풀이 상자(마우스 올리기·누르기·키보드 포커스·Esc), 본문 ↔ 목록 왕복 링크,
// 공개된 용어는 실선 밑줄 링크(풀이 단어와 겉모양이 다름), 화면 읽기 이름, 누르는 영역 크기, 밑줄·글자 대비(라이트·다크).
// 설명 틀로 옮긴 용어(description이 객체)는 자동으로 대상이 된다
import { expect, test, type Page } from "@playwright/test";
import { explanationNoteWords, explanationParagraphs, partLabel } from "../../packages/content-schema/src/explain.ts";
import { terms } from "./terms.ts";

const tag = { tag: "@explain" };
const framed = terms.filter((t) => typeof t.description !== "string");
/** 풀이 상자를 여는 단어(점선 밑줄) */
const words = (page: Page) => page.locator(".la-fn-word");
/** 공개 용어로 가는 단어(실선 밑줄 링크) */
const links = (page: Page) => page.locator(".la-fn-link");
const box = (page: Page, n: number) => page.locator(`#fnbox-${n}`);
/** 풀이 상자가 아닌 쪽(빈 곳)으로 포인터를 치운다 */
const away = (page: Page) => page.mouse.move(2, 2);

test("설명 틀로 옮긴 용어가 있다(이 파일의 테스트가 대상으로 삼을 용어)", tag, () => {
  expect(framed.length).toBeGreaterThan(0);
});

for (const term of framed) {
  if (typeof term.description === "string") continue;
  const description = term.description;
  const labels = (["definition", "analogy", "how", "why"] as const).map((p) => partLabel(p, term));
  const noteWords = explanationNoteWords(description);

  test(`${term.id} · 설명이 정의 → 비유 → 과정 → 이유 순서로 부분 이름과 함께 나오고, 문단 수가 JSON과 같다`, { tag: ["@explain", `@${term.id}`] }, async ({ page }) => {
    await page.goto(`/terms/${term.id}`);
    const parts = page.locator(".la-explain-part");
    await expect(parts).toHaveCount(4);
    await expect(parts.locator(".la-explain-label")).toHaveText(labels);
    const paragraphs = explanationParagraphs(description);
    await expect(page.locator(".la-explain .term-desc")).toHaveCount(paragraphs.length);
    await expect(page.locator(".la-explain h2.la-explain-label").first()).toBeVisible();
    // 한 줄 정의는 본문 문단보다 크다(눈에 띄는 첫 문장)
    const size = (sel: string) => page.locator(sel).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(await size(".la-explain-part.is-definition .term-desc")).toBeGreaterThan(await size(".la-explain-part.is-how .term-desc"));
    // 각주 목록은 번호 없이 단어 이름으로, 본문에 나온 순서대로. 본문의 단어(풀이 단어 + 용어 링크)는 각주 수와 같다
    await expect(page.locator(".la-footnotes li .la-fn-list-word")).toHaveText(noteWords);
    await expect(words(page).or(links(page))).toHaveCount(noteWords.length);
    await expect(page.locator(".la-footnotes ol, .la-fnref, .la-explain sup")).toHaveCount(0); // 번호·위첨자는 없다
    await expect(page.locator(".la-footnotes ul")).toHaveCSS("list-style-type", "none");
  });
}

test("풀이 상자: 단어 위에 마우스를 올리면 열리고, 상자 위로 옮겨도 유지되고, 벗어나면 닫힌다", tag, async ({ page }) => {
  await page.goto("/terms/ssrf");
  await expect(box(page, 1)).toBeHidden();
  await words(page).first().hover();
  await expect(box(page, 1)).toBeVisible();
  await expect(box(page, 1)).toContainText("회사나 클라우드 안쪽 네트워크에서만 쓰는 주소");
  await box(page, 1).hover(); // 풀이 상자 위로 포인터를 옮길 수 있다
  await expect(box(page, 1)).toBeVisible();
  await away(page);
  await expect(box(page, 1)).toBeHidden();
});

test("단어 전체가 트리거다: 단어의 맨 왼쪽·맨 오른쪽 끝을 눌러도 열린다", tag, async ({ page }) => {
  await page.goto("/terms/ssrf");
  const word = words(page).nth(2); // "메타데이터 서비스"처럼 긴 단어
  const b = (await word.boundingBox())!;
  await word.click({ position: { x: 2, y: b.height / 2 } });
  await away(page);
  await expect(box(page, 3)).toBeVisible(); // 눌러서 연 것은 포인터가 떠나도 유지
  await page.getByRole("heading", { level: 1 }).click();
  await expect(box(page, 3)).toBeHidden();
  await word.click({ position: { x: b.width - 2, y: b.height / 2 } });
  await away(page);
  await expect(box(page, 3)).toBeVisible();
});

test("풀이 상자: 키보드 포커스로 열리고 Esc로 닫히며, 상자 안 링크로 Tab이 이어진다", tag, async ({ page }) => {
  await page.goto("/terms/ssrf");
  await words(page).nth(1).focus();
  await expect(box(page, 2)).toBeVisible();
  await expect(words(page).nth(1)).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab"); // 상자 안의 "목록에서 보기" 링크
  await expect(page.locator("#fnbox-2 .la-fn-jump")).toBeFocused();
  await expect(box(page, 2)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(box(page, 2)).toBeHidden();
  // 포커스를 떠났다 돌아오면 다시 열린다
  await page.locator("#fnref-3").focus();
  await expect(box(page, 3)).toBeVisible();
  await expect(box(page, 2)).toBeHidden();
});

test("풀이 상자: 단어를 누르면 열려 있고 바깥을 누르면 닫힌다(터치처럼 포인터가 머물지 않는 경우)", tag, async ({ page }) => {
  await page.goto("/terms/ssrf");
  await words(page).first().click();
  await away(page);
  await expect(box(page, 1)).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(box(page, 1)).toBeHidden();
});

test("본문 ↔ 각주 목록 왕복: 상자의 링크로 목록의 그 단어에, ↩로 본문의 그 단어에 돌아오고 포커스도 거기에 있다", tag, async ({ page }) => {
  // 포커스: Chromium은 해시로 이동하면 포커스를 가능한 요소(단어 버튼, tabindex=-1인 목록 항목)로 알아서 옮긴다. 그래서 이 검사는 코드의 포커스 처리(focusAfterJump)를
  // 따로 검증하지 못한다. 그 처리는 포커스를 옮기지 않는 브라우저를 위한 안전장치다
  await page.goto("/terms/ssrf");
  await words(page).nth(2).focus();
  await page.locator("#fnbox-3 .la-fn-jump").click();
  await expect(page).toHaveURL(/#fn-3$/);
  await expect(page.locator("#fn-3")).toBeInViewport();
  await expect(page.locator("#fn-3")).toBeFocused();
  await page.locator("#fn-3 .la-fn-back").click();
  await expect(page).toHaveURL(/#fnref-3$/);
  await expect(page.locator("#fnref-3")).toBeInViewport();
  await expect(page.locator("#fnref-3")).toBeFocused();
});

test("공개된 용어는 풀이 상자 대신 그 용어 쪽으로 가는 링크이고, 목록에도 같은 링크가 있다", tag, async ({ page }) => {
  await page.goto("/terms/deadlock");
  const link = page.getByRole("link", { name: "경쟁 상태, 용어 쪽으로 이동" });
  await expect(link).toHaveAttribute("href", "/terms/race-condition");
  await expect(links(page)).toHaveCount(1);
  await expect(page.locator(".la-fn-box", { hasText: "실행 순서에 따라" })).toHaveCount(0); // 풀이 상자가 없다
  await expect(page.locator(".la-footnotes .la-fn-term")).toHaveAttribute("href", "/terms/race-condition");
  await link.click();
  await expect(page).toHaveURL(/\/terms\/race-condition$/);
  await expect(page.getByRole("heading", { level: 1, name: "경쟁 상태" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(0); // 다른 용어 쪽은 맨 위
});

test("겉모양: 풀이 단어는 점선 밑줄, 용어 링크는 실선 밑줄(색만으로 구분하지 않는다)", tag, async ({ page }) => {
  await page.goto("/terms/deadlock");
  const style = (loc: ReturnType<Page["locator"]>) =>
    loc.first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { line: s.textDecorationLine, style: s.textDecorationStyle, thick: parseFloat(s.textDecorationThickness) };
    });
  const word = await style(words(page));
  const link = await style(links(page));
  expect(word).toMatchObject({ line: "underline", style: "dotted" });
  expect(link).toMatchObject({ line: "underline", style: "solid" });
  expect(word.thick).toBeGreaterThanOrEqual(1);
  expect(link.thick).toBeGreaterThanOrEqual(1);
  // 굵기는 구분 수단으로 단언하지 않는다: 풀이 단어가 굵은 한 줄 정의 안에 있으면 굵게 물려받는다. 구분은 밑줄 모양(점선/실선)과 화면 읽기 이름이 한다
});

test("화면 읽기: 풀이 단어는 '단어, 풀이 보기', 용어 링크는 '단어, 용어 쪽으로 이동'이고, 풀이 상자가 설명으로 연결되고, 목록의 되돌아가기에 이름이 있다", tag, async ({ page }) => {
  await page.goto("/terms/ssrf");
  const first = page.getByRole("button", { name: "내부 주소, 풀이 보기" });
  await expect(first).toHaveAttribute("aria-describedby", "fnbox-1");
  await expect(first).toHaveAccessibleDescription(/회사나 클라우드 안쪽 네트워크에서만 쓰는 주소/);
  await expect(page.getByRole("button", { name: "메타데이터 서비스, 풀이 보기" })).toBeVisible();
  await expect(page.getByRole("link", { name: "본문의 내부 주소(으)로 돌아가기" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "각주" })).toBeVisible();
  await page.goto("/terms/deadlock");
  await expect(page.getByRole("link", { name: "경쟁 상태, 용어 쪽으로 이동" })).toBeVisible();
});

/** 두 색의 WCAG 대비(상대 휘도). rgb(r, g, b) 문자열 */
const contrast = (a: string, b: string) => {
  const lum = (css: string) => {
    const [r, g, bl] = (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number) as [number, number, number];
    const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

for (const scheme of ["light", "dark"] as const) {
  test(`밑줄·글자 대비(${scheme}): 점선 밑줄·링크 밑줄은 바탕과 3:1 이상, 단어·링크 글자는 4.5:1 이상`, tag, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/terms/deadlock");
    await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
    await expect(words(page).first()).toBeVisible();
    const read = (sel: string) =>
      page.locator(sel).first().evaluate((el) => {
        const s = getComputedStyle(el);
        // 바탕: 가장 가까운 불투명한 조상 배경(카드)
        let bg = "rgba(0, 0, 0, 0)";
        for (let p: Element | null = el; p; p = p.parentElement) {
          const c = getComputedStyle(p).backgroundColor;
          if (c !== "rgba(0, 0, 0, 0)" && c !== "transparent") {
            bg = c;
            break;
          }
        }
        return { text: s.color, line: s.textDecorationColor, bg };
      });
    for (const sel of [".la-fn-word", ".la-fn-link"]) {
      const c = await read(sel);
      expect(contrast(c.line, c.bg), `${scheme} ${sel} 밑줄 ${c.line} / 바탕 ${c.bg}`).toBeGreaterThanOrEqual(3);
      expect(contrast(c.text, c.bg), `${scheme} ${sel} 글자 ${c.text} / 바탕 ${c.bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
}

// 누르는 영역: 단어 버튼·링크·↩ 모두 24×24px 이상(WCAG 2.2 목표 크기). 한 글자 단어("락")도 해당
for (const width of [375, 1440]) {
  test(`누르는 영역(${width}px): 각주 단어·링크·되돌아가기가 24×24px 이상이다`, { tag: ["@explain", ...(width === 375 ? ["@narrow"] : [])] }, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 375 });
    const page = await context.newPage();
    for (const id of framed.map((t) => t.id)) {
      await page.goto(`/terms/${id}`);
      await expect(page.locator(".la-explain")).toBeVisible();
      const targets = page.locator(".la-fn-word, .la-fn-link, .la-fn-back");
      const count = await targets.count();
      expect(count, `${id}`).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const b = (await targets.nth(i).boundingBox())!;
        const name = await targets.nth(i).evaluate((el) => (el.textContent ?? "").trim());
        expect(b.width, `${id} "${name}" 너비`).toBeGreaterThanOrEqual(24);
        expect(b.height, `${id} "${name}" 높이`).toBeGreaterThanOrEqual(24);
      }
    }
    await context.close();
  });
}

// 보정이 필요한 위치(320px의 모든 상자, 375px의 데드락 각주들)가 있어야 의미 있는 검사다. 두 용어 × 두 폭으로 본다
for (const width of [320, 375]) {
  for (const id of framed.map((t) => t.id)) {
    test(`좁은 화면(${width}px) · ${id}: 풀이 상자가 화면 밖으로 나가지 않는다`, { tag: ["@explain", "@narrow", `@${id}`] }, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await context.newPage();
      await page.goto(`/terms/${id}`);
      await expect(page.locator(".la-explain")).toBeVisible(); // 용어 쪽은 따로 받아 그려지므로 개수를 세기 전에 기다린다
      const count = await words(page).count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const n = Number((await words(page).nth(i).getAttribute("id"))!.replace("fnref-", ""));
        await words(page).nth(i).focus();
        const b = await box(page, n).boundingBox();
        expect(b, `풀이 단어 ${i + 1}의 상자`).not.toBeNull();
        expect(b!.x, `풀이 단어 ${i + 1} 왼쪽`).toBeGreaterThanOrEqual(0);
        expect(b!.x + b!.width, `풀이 단어 ${i + 1} 오른쪽`).toBeLessThanOrEqual(width);
      }
      await context.close();
    });
  }
}
