// 색인(/terms) 첫소리 머리글 E2E(@index-columns): 머리글(예: "A ——")과 그 묶음의 첫 표제어는 늘 같은 칸에 붙어 있다.
// 다단(CSS columns)에서 머리글만 칸 끝에 남고 표제어가 다음 칸으로 넘어가던 문제의 회귀 테스트(원인: 머리글의 break-after: avoid에만 기댄 것)
import { expect, test, type Page } from "@playwright/test";

const tag = { tag: "@index-columns" };

/** 모든 첫소리 묶음에서 머리글과 첫 표제어가 같은 칸(가로 위치)·머리글 바로 아래에 있는지 본다. 어긋난 묶음의 설명을 돌려준다 */
const orphans = (page: Page) =>
  page.evaluate(() => {
    const bad: string[] = [];
    for (const letter of document.querySelectorAll(".la-letter")) {
      const head = letter.querySelector(".la-letter-head")!.getBoundingClientRect();
      const first = letter.querySelector("li")!.getBoundingClientRect();
      const sameColumn = Math.abs(head.left - first.left) < 40;
      const below = first.top >= head.bottom - 2 && first.top - head.bottom < 40;
      if (!sameColumn || !below) bad.push(`${letter.querySelector(".la-letter-head")!.textContent!.trim()}: 머리글 x=${Math.round(head.left)} y=${Math.round(head.bottom)}, 첫 표제어 x=${Math.round(first.left)} y=${Math.round(first.top)}`);
    }
    return bad;
  });

const widthsScan = Array.from({ length: 67 }, (_, i) => 380 + i * 20); // 380~1700px(다단 칸 수가 바뀌는 구간을 모두 지난다)
const VIEWS = ["/terms", "/terms?field=web-security", "/terms?field=network", "/terms?field=os", "/terms?field=runtime", "/terms?q=s", "/terms?q=e", "/terms?q=서버"];

test("머리글만 칸 끝에 남는 경우가 없다: 전체·분야별·검색 결과 × 380~1700px", tag, async ({ page }) => {
  for (const view of VIEWS) {
    await page.goto(view);
    await expect(page.locator(".la-letter, .la-empty").first()).toBeVisible();
    if ((await page.locator(".la-letter").count()) === 0) continue;
    for (const width of widthsScan) {
      await page.setViewportSize({ width, height: 900 });
      expect(await orphans(page), `${view} · ${width}px`).toEqual([]);
    }
  }
});

/** 칸 높이를 직접 정해 머리글이 칸 끝에 걸리는 모든 경우를 만든다(글꼴·화면 높이와 상관없이 같은 결과). column-fill: auto = 칸을 위에서부터 채우고 높이에서 끊는다 */
async function orphansAtColumnHeights(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addStyleTag({ content: ".la-columns { column-fill: auto !important; }" });
  const bad: string[] = [];
  for (let height = 300; height <= 900; height += 7) {
    await page.evaluate((h) => document.querySelector<HTMLElement>(".la-columns")!.style.setProperty("height", `${h}px`, "important"), height);
    bad.push(...(await orphans(page)).map((b) => `칸 높이 ${height}px · ${b}`));
  }
  return bad;
}

test("칸 높이를 바꿔 머리글이 칸 끝에 걸리는 모든 경우에도 머리글이 홀로 남지 않는다", tag, async ({ page }) => {
  await page.goto("/terms");
  await expect(page.locator(".la-letter").first()).toBeVisible();
  expect(await orphansAtColumnHeights(page)).toEqual([]);
});

test("머리글의 break-after: avoid가 없어도(묶음이 통째로 한 칸에 있으므로) 머리글이 홀로 남지 않는다", tag, async ({ page }) => {
  await page.goto("/terms");
  await expect(page.locator(".la-letter").first()).toBeVisible();
  await page.addStyleTag({ content: ".la-letter-head { break-after: auto !important; }" });
  expect(await orphansAtColumnHeights(page)).toEqual([]);
});
