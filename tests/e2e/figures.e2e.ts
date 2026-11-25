// 용어 옆 그림(@figures): 직접 그린 SVG를 설명의 한 부분 옆에 놓는다.
// ① 1440px: 그림은 그 부분 글 오른쪽, 글 줄 길이 상한(48.4rem)은 그대로 ② 390px: 그 부분 글 바로 아래 한 열, 가로 스크롤 없음
// ③ 라이트·다크: 그림 색은 사이트 색 토큰을 따르고 카드 바탕과 구분됨(색을 하드코딩한 속성 없음) ④ alt(읽어 주는 이름)와 캡션("직접 그린 그림"으로 끝)이 보임
// ⑤ 그림이 없는 용어는 레이아웃 그대로. 대상 용어는 content/terms의 figures에서 자동으로 늘어난다
import { expect, test, type Page } from "@playwright/test";
import { terms } from "./terms.ts";

type Rect = { l: number; t: number; r: number; b: number };
const withFigures = terms.filter((t) => t.figures.length > 0);
/** 그림이 없고 설명이 틀로 쓰인 용어(초안 자리 표시 "(설명 준비 중)" 용어는 설명 틀 자체가 없다) */
const without = terms.filter((t) => t.figures.length === 0 && typeof t.description !== "string");
const tag = (id: string) => ({ tag: ["@figures", `@${id}`] });

const rects = (page: Page) =>
  page.evaluate(() => {
    const r = (el: Element): Rect => {
      const b = el.getBoundingClientRect();
      return { l: b.left, t: b.top + scrollY, r: b.right, b: b.bottom + scrollY };
    };
    return {
      parts: [...document.querySelectorAll(".la-explain-part.has-figure")].map((part) => ({
        part: r(part),
        text: r(part.querySelector(".la-explain-text")!),
        fig: r(part.querySelector(".la-tfig")!),
        svg: r(part.querySelector(".la-tfig-svg")!),
        // 문단(글줄) 폭: 줄 길이 상한이 지켜지는지
        maxParagraph: Math.max(...[...part.querySelectorAll(".la-explain-text p")].map((p) => p.getBoundingClientRect().width)),
      })),
      scrollOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
    };
  });

/** WCAG 대비(상대 휘도). rgb(r, g, b) / rgba(...) 문자열 */
const lum = (c: string) => {
  const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => {
    const s = v! / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

for (const term of withFigures) {
  test(`${term.id} · 그림(1440px): 그 부분 글 오른쪽에 있고, 글 줄 길이 상한을 지키며, alt·캡션이 보이고 SVG가 그려진다`, { ...tag(term.id) }, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/terms/${term.id}`);
    await expect(page.locator(".la-tfig-svg svg").first()).toBeVisible();
    const m = await rects(page);
    expect(m.parts).toHaveLength(term.figures.length);
    for (const p of m.parts) {
      // 그림은 글 오른쪽 여백, 같은 부분의 높이 안에서 시작한다
      expect(p.fig.l).toBeGreaterThanOrEqual(p.text.r - 1);
      expect(p.fig.t).toBeGreaterThanOrEqual(p.part.t - 1);
      expect(p.fig.t).toBeLessThanOrEqual(p.part.b);
      expect(p.svg.r - p.svg.l).toBeGreaterThanOrEqual(200); // 사거리처럼 자세한 그림도 읽힐 크기
      // 글 줄 길이 상한(--measure-ko = 48.4rem)을 넘지 않는다
      expect(p.maxParagraph / m.rem).toBeLessThanOrEqual(48.4 + 0.1);
    }
    expect(m.scrollOver).toBeLessThanOrEqual(0);
    // alt(읽어 주는 이름)와 캡션
    for (const f of term.figures) {
      const fig = page.locator(`.la-tfig[data-figure="${f.id}"]`);
      await expect(fig.getByRole("img", { name: f.alt })).toBeVisible();
      await expect(fig.locator("figcaption")).toHaveText(f.caption);
      await expect(fig.locator("figcaption")).toContainText(/직접 그린 그림$/);
      // 이 그림의 부분(part) 안에 있다
      await expect(page.locator(`.la-explain-part.is-${f.part} .la-tfig[data-figure="${f.id}"]`)).toHaveCount(1);
      // SVG는 걸러 낸 인라인 요소: 스크립트·스타일·링크가 없다
      await expect(fig.locator("script, style, a, image, foreignObject")).toHaveCount(0);
    }
  });

  test(`${term.id} · 그림(390px): 그 부분 글 바로 아래에 한 열로 쌓이고 가로 스크롤이 없다`, { ...tag(term.id) }, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/terms/${term.id}`);
    await expect(page.locator(".la-tfig-svg svg").first()).toBeVisible();
    const m = await rects(page);
    for (const p of m.parts) {
      expect(p.fig.t).toBeGreaterThanOrEqual(p.text.b - 1); // 글 아래
      expect(Math.abs(p.fig.l - p.text.l)).toBeLessThanOrEqual(1); // 같은 왼쪽(한 열)
      expect(p.fig.r).toBeLessThanOrEqual(p.part.r + 1);
      expect(p.part.b).toBeGreaterThanOrEqual(p.fig.b - 1); // 다음 부분과 겹치지 않는다
    }
    expect(m.scrollOver).toBeLessThanOrEqual(0);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`${term.id} · 그림 색(${scheme}): 사이트 색 토큰을 따르고 카드 바탕과 구분된다(색 속성을 직접 쓰지 않음)`, { ...tag(term.id) }, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto(`/terms/${term.id}`);
      await expect(page.locator(".la-tfig-svg svg").first()).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
      const info = await page.evaluate(() => {
        // 토큰 값을 같은 방식(computed rgb)으로 읽는다
        const resolve = (token: string) => {
          const probe = document.createElement("span");
          probe.style.color = `var(${token})`;
          document.body.append(probe);
          const c = getComputedStyle(probe).color;
          probe.remove();
          return c;
        };
        const card = getComputedStyle(document.querySelector(".la-tfig-svg")!).backgroundColor;
        const els = [...document.querySelectorAll(".la-tfig-svg svg *")].map((el) => {
          const s = getComputedStyle(el);
          return {
            tag: el.tagName.toLowerCase(),
            cls: el.getAttribute("class") ?? "",
            fillAttr: el.getAttribute("fill"),
            strokeAttr: el.getAttribute("stroke"),
            fill: s.fill,
            stroke: s.stroke,
            strokeWidth: parseFloat(s.strokeWidth),
          };
        });
        return { card, els, tokens: { ink: resolve("--la-ink"), sub: resolve("--la-ink-sub"), attack: resolve("--la-attack"), defense: resolve("--la-defense") } };
      });
      const norm = (c: string) => c.replace(/\s+/g, "");
      for (const e of info.els) {
        // 색 속성을 직접 쓰지 않는다(fill="none"만)
        expect([null, "none"], `${e.tag}.${e.cls} fill 속성`).toContain(e.fillAttr);
        expect([null, "none"], `${e.tag}.${e.cls} stroke 속성`).toContain(e.strokeAttr);
        if (e.tag === "text") {
          expect(contrast(e.fill, info.card), `${e.tag} 글자`).toBeGreaterThanOrEqual(4.5);
          expect(norm(e.fill)).toBe(norm(info.tokens.ink));
          continue;
        }
        const hasStroke = e.stroke !== "none" && e.strokeWidth > 0;
        if (hasStroke) {
          expect(contrast(e.stroke, info.card), `${e.tag}.${e.cls} 선 ${e.stroke} / 바탕 ${info.card}`).toBeGreaterThanOrEqual(3);
          expect([info.tokens.ink, info.tokens.sub, info.tokens.attack, info.tokens.defense].map(norm), `${e.cls} 선 색은 토큰`).toContain(norm(e.stroke));
        } else if (e.fill !== "none") {
          // 선 없이 채우기만 하는 것(화살촉·방향 표시·자물쇠)
          expect(contrast(e.fill, info.card), `${e.tag}.${e.cls} 채움 ${e.fill} / 바탕 ${info.card}`).toBeGreaterThanOrEqual(3);
          expect([info.tokens.ink, info.tokens.attack, info.tokens.defense].map(norm), `${e.cls} 채움 색은 토큰`).toContain(norm(e.fill));
        }
      }
    });
  }
}

for (const term of without) {
  test(`${term.id} · 그림이 없는 용어는 본문만(레이아웃 그대로)`, { ...tag(term.id) }, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/terms/${term.id}`);
    await expect(page.locator(".la-explain")).toBeVisible();
    await expect(page.locator(".la-tfig")).toHaveCount(0);
    await expect(page.locator(".la-explain-part.has-figure")).toHaveCount(0);
    await expect(page.locator(".la-explain.has-figs")).toHaveCount(0);
    // 부분의 구조는 예전과 같다: 이름표(h2)와 문단이 부분의 바로 아래 자식
    await expect(page.locator(".la-explain-part > .la-explain-label")).toHaveCount(4);
    await expect(page.locator(".la-explain-text")).toHaveCount(0);
    const w = await page.locator(".la-explain").evaluate((el) => el.getBoundingClientRect().width / parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(w).toBeLessThanOrEqual(48.4 + 0.1);
  });
}

test("그림 파일이 정적 파일로 제공된다(/content/figures/<id>.svg)", { tag: "@figures" }, async ({ request }) => {
  for (const f of withFigures.flatMap((t) => t.figures)) {
    const res = await request.get(`/content/figures/${f.id}.svg`);
    expect(res.status(), f.id).toBe(200);
    expect((await res.text()).trimStart().startsWith("<svg"), f.id).toBe(true);
  }
});
