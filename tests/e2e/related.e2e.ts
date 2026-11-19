// 관련 용어(FR-DTL-05): 상세 페이지의 "관련 용어" 카드가 그 용어의 related 중 published 용어만 링크하고, 누르면 그 상세로 간다.
// related가 없으면 카드가 없다. 대상은 content/terms에서 자동으로 늘어난다
import { expect, test } from "@playwright/test";
import { terms } from "./terms.ts";

const shown = new Map(terms.map((t) => [t.id, t]));

for (const term of terms) {
  const expected = term.related.filter((id) => shown.has(id)).map((id) => shown.get(id)!);
  test(`${term.id} · 관련 용어 카드: ${expected.map((t) => t.id).join(", ") || "없음"}`, { tag: `@${term.id}` }, async ({ page }) => {
    await page.goto(`/terms/${term.id}`);
    await expect(page.getByRole("heading", { level: 1, name: term.name })).toBeVisible();
    const card = page.locator(".related");
    if (!expected.length) {
      await expect(card).toHaveCount(0);
      return;
    }
    await expect(card.getByRole("link")).toHaveText(expected.map((t) => t.name));
    await card.getByRole("link", { name: expected[0]!.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/terms/${expected[0]!.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: expected[0]!.name })).toBeVisible();
  });
}
