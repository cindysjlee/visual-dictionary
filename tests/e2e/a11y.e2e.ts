// 접근성: 홈·상세 × 라이트·다크. axe의 serious·critical 위반이 있으면 실패
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  { path: "/", ready: ".term-card" },
  { path: "/terms/csrf", ready: ".play-btn" },
];

for (const colorScheme of ["light", "dark"] as const) {
  for (const { path, ready } of pages) {
    test(`접근성 ${path} (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" }); // 자동 재생 없이 안정된 화면에서 검사
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
