// 탐색·상세 E2E(@explore): 홈 카드 구성(FR-EXP-01), 비회원 카테고리 필터(FR-EXP-02), 검색(FR-EXP-03), 결과 없음(FR-EXP-04),
// 상세 구성 순서(FR-DTL-01), 참고 자료(FR-DTL-03), 없는 용어(FR-DTL-04). 대상 용어는 content/terms에서 자동으로 늘어난다
import { expect, test, type Page } from "@playwright/test";
import { CATEGORY_LABELS } from "../../packages/content-schema/src/labels.ts";
import { terms } from "./terms.ts";

const tag = { tag: "@explore" };
const list = (page: Page) => page.getByRole("region", { name: "용어 목록" });
const cardNames = (page: Page) => list(page).locator(".term-card-name");
const names = (ts: typeof terms) => ts.map((t) => t.name).sort();
const search = (page: Page) => page.getByRole("searchbox", { name: "용어 검색" });

/** 요구사항 FR-EXP-03의 검색 대상: 이름·영문명·별칭·요약, 대소문자 무시 */
const expectedFor = (q: string) =>
  terms.filter((t) => [t.name, t.englishName ?? "", t.summary, ...t.aliases].some((s) => s.toLowerCase().includes(q.toLowerCase())));

async function shownNames(page: Page) {
  return (await cardNames(page).allTextContents()).sort();
}

test("홈: 모든 용어가 카드로 보이고, 카드마다 이름·한 줄 요약·카테고리 배지가 있다", tag, async ({ page }) => {
  await page.goto("/terms");
  await expect(cardNames(page)).toHaveCount(terms.length);
  for (const t of terms) {
    const card = list(page).locator(".term-card", { has: page.locator(".term-card-name", { hasText: new RegExp(`^${t.name}$`) }) });
    await expect(card.locator(".term-card-desc")).toHaveText(t.summary);
    await expect(card.locator(`.tag-${t.category}`)).toHaveText(CATEGORY_LABELS[t.category]);
  }
});

test("비회원 카테고리 필터: 기본은 전체, 고르면 그 카테고리 용어만", tag, async ({ page }) => {
  await page.goto("/terms");
  const chips = page.getByRole("group", { name: "카테고리" });
  await expect(chips.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
  for (const [category, label] of Object.entries(CATEGORY_LABELS)) {
    const expected = terms.filter((t) => t.category === category);
    await chips.getByRole("button", { name: label }).click();
    await expect(chips.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
    if (expected.length) await expect.poll(() => shownNames(page)).toEqual(names(expected));
    else await expect(list(page)).toContainText("찾는 용어가 없어요");
  }
  await chips.getByRole("button", { name: "전체" }).click();
  await expect(cardNames(page)).toHaveCount(terms.length);
});

// 별칭(대문자로 입력), 영문명(소문자로 입력), 한글 별칭, 요약 일부
const QUERIES = ["SQLI", "deadlock", "교착", "forgery", terms[0]!.summary.slice(0, 6)];
for (const q of QUERIES) {
  test(`검색 "${q}": 이름·영문명·별칭·요약에서 대소문자 없이 찾는다`, tag, async ({ page }) => {
    const expected = expectedFor(q);
    expect(expected.length, "검색어가 적어도 한 용어와 맞아야 의미 있는 테스트").toBeGreaterThan(0);
    await page.goto("/terms");
    await search(page).fill(q);
    await expect.poll(() => shownNames(page)).toEqual(names(expected));
  });
}

test("검색은 카테고리 필터와 함께 적용되고, 결과가 없으면 안내와 '전체 목록 보기'로 처음 상태로 돌아간다", tag, async ({ page }) => {
  await page.goto("/terms");
  await search(page).fill("forgery");
  await expect.poll(() => shownNames(page)).toEqual(names(expectedFor("forgery")));
  // 같은 검색어에 다른 카테고리: 결과 없음
  await page.getByRole("group", { name: "카테고리" }).getByRole("button", { name: CATEGORY_LABELS.network }).click();
  await expect(list(page)).toContainText("찾는 용어가 없어요 · ‘forgery’");
  await list(page).getByRole("button", { name: "전체 목록 보기" }).click();
  await expect(search(page)).toHaveValue("");
  await expect(page.getByRole("group", { name: "카테고리" }).getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
  await expect(cardNames(page)).toHaveCount(terms.length);
});

test("검색 결과 없음: 안내 문구와 '전체 목록 보기' 버튼", tag, async ({ page }) => {
  await page.goto("/terms");
  await search(page).fill("없는용어zz");
  await expect(cardNames(page)).toHaveCount(0);
  await expect(list(page)).toContainText("찾는 용어가 없어요 · ‘없는용어zz’");
  await list(page).getByRole("button", { name: "전체 목록 보기" }).click();
  await expect(cardNames(page)).toHaveCount(terms.length);
});

for (const term of terms) {
  test(`${term.id} · 상세 구성 순서(이름 → 설명 → 애니메이션·자막 → ${term.defenses.length ? "방어·해결 방법 → " : ""}참고 자료)와 참고 자료 링크`, { tag: ["@explore", `@${term.id}`] }, async ({ page }) => {
    await page.goto(`/terms/${term.id}`);
    const parts = [
      page.getByRole("heading", { level: 1, name: term.name }),
      page.locator(".term-desc"),
      page.getByRole("region", { name: "애니메이션 플레이어" }).locator(".caption"),
      ...(term.defenses.length ? [page.locator(".defense-title").first()] : []),
      page.getByRole("heading", { name: "참고 자료" }),
    ];
    for (const p of parts) await expect(p).toBeVisible();
    await expect(page.locator(".term-desc")).toHaveText(term.description);
    // 문서 순서(앞 요소 다음에 뒤 요소가 온다)
    const handles = await Promise.all(parts.map((p) => p.elementHandle()));
    const inOrder = await page.evaluate(
      (els) => els.every((el, i) => i === 0 || Boolean(els[i - 1]!.compareDocumentPosition(el!) & Node.DOCUMENT_POSITION_FOLLOWING)),
      handles,
    );
    expect(inOrder).toBe(true);

    const links = page.locator(".link-list a");
    await expect(links).toHaveText(term.references.map((r) => r.title));
    for (const [i, r] of term.references.entries()) await expect(links.nth(i)).toHaveAttribute("href", r.url);
  });
}

test("없는 용어 주소: 안내 문구와 목록으로 가는 버튼", tag, async ({ page }) => {
  await page.goto("/terms/no-such-term");
  await expect(page.getByRole("heading", { level: 1, name: "찾는 용어가 없습니다." })).toBeVisible();
  await page.getByRole("link", { name: "용어 목록으로" }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(cardNames(page)).toHaveCount(terms.length);
});

test("없는 화면 주소: 안내 문구와 목록으로 가는 버튼", tag, async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { level: 1, name: "찾는 페이지가 없습니다." })).toBeVisible();
  await expect(page.getByRole("link", { name: "용어 목록으로" })).toHaveAttribute("href", "/terms");
});
