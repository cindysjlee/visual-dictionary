// 용어 옆 그림 만들기(한 번 돌려 결과를 커밋한다. 빌드 때마다 돌지 않는다): scripts/figures/designs.ts의 구성 + shapes.ts의 공통 도형 → content/figures/<id>.svg
// 도형이나 구성을 고친 뒤에는 이것을 다시 돌린다: node scripts/build-figures.ts. 파일이 구성과 어긋나면 build-figures.test.ts가 실패한다
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FIGURES, renderSvg } from "./figures/designs.ts";

const dir = fileURLToPath(new URL("../content/figures/", import.meta.url));
for (const design of FIGURES) writeFileSync(join(dir, `${design.id}.svg`), renderSvg(design));
console.log(`그림 ${FIGURES.length}개 생성: content/figures/ (deadlock-intersection.svg는 손으로 그린 파일이라 건드리지 않는다)`);
