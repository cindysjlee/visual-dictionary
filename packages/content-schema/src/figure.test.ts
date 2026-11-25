// 용어 옆 그림(figures) 단위 테스트: SVG 규칙(직접 그린 것만, 색은 클래스로만, 표식 글자만)과 캡션 표기
import { describe, expect, it } from "vitest";
import { FIGURE_VIEWBOX, captionHasCredit, checkFigureSvg } from "./figure.ts";

const svg = (inner: string, attrs = `xmlns="http://www.w3.org/2000/svg" viewBox="${FIGURE_VIEWBOX}"`) => `<svg ${attrs}>${inner}</svg>`;
const OK = svg('<rect class="k-box" x="1" y="1" width="10" height="10" rx="2"/><path class="k-acc" d="M0 0L5 5"/><text x="5" y="5">A</text>');

describe("checkFigureSvg", () => {
  it("직접 그린 평면 도식(클래스 k-*, 표식 글자)은 통과한다", () => {
    expect(checkFigureSvg(OK)).toEqual([]);
    expect(checkFigureSvg(svg('<path class="k-soft" fill="none" d="M0 0L5 5"/>'))).toEqual([]);
  });

  it.each([
    ["스크립트", svg("<script>alert(1)</script>"), "쓸 수 없는 요소: <script>"],
    ["스타일 요소", svg("<style>rect{fill:red}</style>"), "쓸 수 없는 요소: <style>"],
    ["외부 이미지", svg('<image width="9" height="9"/>'), "쓸 수 없는 요소: <image>"],
    ["foreignObject", svg("<foreignObject/>"), "쓸 수 없는 요소: <foreignObject>"],
    ["링크", svg('<a><rect class="k-box"/></a>'), "쓸 수 없는 요소: <a>"],
    ["이벤트 속성", svg('<rect class="k-box" onclick="x()"/>'), "이벤트 속성"],
    ["style 속성", svg('<rect class="k-box" style="fill:red"/>'), "style 속성"],
    ["href", svg('<rect class="k-box" href="https://x.example"/>'), "링크·외부 주소"],
    ["색 속성", svg('<rect class="k-box" fill="red"/>'), 'fill="red"'],
    ["16진 색", svg('<rect class="k-box" data-x="#fff"/>'), "색 값"],
    ["그림 전용이 아닌 클래스", svg('<rect class="box"/>'), 'k-로 시작하는'],
    ["긴 글자", svg('<text x="1" y="1">설명이길다</text>'), "표식"],
    ["빈 글자", svg('<text x="1" y="1"> </text>'), "표식"],
    ["viewBox 없음", `<svg xmlns="http://www.w3.org/2000/svg"><rect class="k-box"/></svg>`, "viewBox"],
    ["xmlns 없음", `<svg viewBox="${FIGURE_VIEWBOX}"><rect class="k-box"/></svg>`, "xmlns"],
    ["svg가 아님", "<div/>", "<svg>로 시작"],
  ])("%s → 거부", (_, text, message) => {
    expect(checkFigureSvg(text).join("\n")).toContain(message);
  });

  it("실제 파일처럼 fill=\"none\"과 stroke=\"none\"만 색 속성으로 허용한다", () => {
    expect(checkFigureSvg(svg('<path class="k-ink" fill="none" stroke="none" d="M0 0"/>'))).toEqual([]);
    expect(checkFigureSvg(svg('<path class="k-ink" stroke="currentColor" d="M0 0"/>'))).not.toEqual([]);
  });
});

describe("captionHasCredit", () => {
  it('"직접 그린 그림"으로 끝나야 한다(끝의 마침표·괄호는 봐준다)', () => {
    expect(captionHasCredit("설명이다. 직접 그린 그림")).toBe(true);
    expect(captionHasCredit("설명이다. (직접 그린 그림)")).toBe(true);
    expect(captionHasCredit("직접 그린 그림. ")).toBe(true);
    expect(captionHasCredit("직접 그린 그림이 아니다")).toBe(false);
    expect(captionHasCredit("설명만 있다")).toBe(false);
  });
});
