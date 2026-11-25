// 생성한 그림 파일이 구성과 어긋나지 않았는지, 그림 규칙(checkFigureSvg)과 색 역할(중립·강조·방어, 최대 3가지)을 지키는지 본다
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkFigureSvg } from "../packages/content-schema/src/figure.ts";
import { FIGURES, renderSvg } from "./figures/designs.ts";

const FAMILIES = {
  중립: ["k-ink", "k-soft", "k-box", "k-flow", "k-fill", "k-t"],
  강조: ["k-acc", "k-accd", "k-accf", "k-boxa"],
  방어: ["k-defl", "k-deff"],
};
const familyOf = (cls: string) => Object.entries(FAMILIES).find(([, list]) => list.includes(cls))?.[0];

describe("build-figures", () => {
  for (const design of FIGURES) {
    const svg = renderSvg(design);
    it(`${design.id}: 파일이 구성과 같고 그림 규칙을 지킨다`, () => {
      expect(readFileSync(new URL(`../content/figures/${design.id}.svg`, import.meta.url), "utf8")).toBe(svg);
      expect(checkFigureSvg(svg)).toEqual([]);
      const classes = [...svg.matchAll(/class="([^"]+)"/g)].flatMap((m) => (m[1] ?? "").split(/\s+/));
      const unknown = classes.filter((c) => !familyOf(c));
      expect(unknown).toEqual([]);
      expect(new Set(classes.map(familyOf)).size).toBeLessThanOrEqual(3);
    });
  }
});
