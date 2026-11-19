// 접근성: 홈·모든 용어 상세 × 라이트·다크. axe의 serious·critical 위반이 있으면 실패
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { terms } from "./terms.ts";

// 용어 상세는 @<id> 태그(npm run test:e2e -- --grep @csrf 로 그 용어 테스트만)
const pages = [
  { path: "/", ready: ".term-card", tag: [] as string[] },
  ...terms.map((t) => ({ path: `/terms/${t.id}`, ready: ".play-btn", tag: [`@${t.id}`] })),
  ...["login", "signup", "confirm", "reset"].map((p) => ({ path: `/auth/${p}`, ready: ".auth-form", tag: ["@auth"] })),
];

for (const colorScheme of ["light", "dark"] as const) {
  for (const { path, ready, tag } of pages) {
    test(`접근성 ${path} (${colorScheme})`, { tag }, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" }); // 연출 없이 안정된 화면에서 검사
      await page.goto(path);
      await expect(page.locator(ready).first()).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
      const { violations } = await new AxeBuilder({ page }).analyze();
      const severe = violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
      expect(severe).toEqual([]);
    });
  }
}
