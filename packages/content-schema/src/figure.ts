// 용어 옆 그림(figures, docs/04 "그림"): 직접 그린 SVG 파일만 쓴다(외부 이미지·사진·교재 그림 금지, 저작권·CSP).
// 색은 사이트 색 토큰을 따라가야 하므로 SVG 안에 색을 쓰지 않고 클래스(k-*)로만 칠한다(스타일은 dictionary.css의 .la-fig-svg).
// 이 파일은 DOM 없이 글자만 검사하는 순수 함수라, 빌드 검증기(scripts)와 단위 테스트가 쓴다. 화면은 읽은 SVG를 한 번 더 걸러서 넣는다(features/term/Figure.tsx)

/** 그림이 붙을 수 있는 설명의 부분(한 줄 정의 옆에는 두지 않는다) */
export const FIGURE_PARTS = ["analogy", "how", "why"] as const;
export type FigurePart = (typeof FIGURE_PARTS)[number];
/** 캡션 끝에 반드시 붙이는 표기 */
export const FIGURE_CREDIT = "직접 그린 그림";
/** 모든 그림은 같은 정사각 캔버스(자리를 미리 잡아 불러오는 동안 밀림이 없다) */
export const FIGURE_VIEWBOX = "0 0 240 240";
/** 그림 안 글자는 A, B, 1, 2 같은 표식만 */
export const FIGURE_TEXT_MAX = 3;
export const FIGURE_SIZE_MAX = 12 * 1024;
/** 그려도 되는 요소. 스크립트·스타일·이미지·링크·애니메이션·그라디언트는 없다 */
export const FIGURE_ELEMENTS = ["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text"] as const;

/** SVG 글자를 검사해 문제 목록을 돌려준다(없으면 빈 배열) */
export function checkFigureSvg(svg: string): string[] {
  const issues: string[] = [];
  const text = svg.replace(/^/, "").trim();
  if (!text.startsWith("<svg")) return ["<svg>로 시작하지 않습니다"];
  if (text.length > FIGURE_SIZE_MAX) issues.push(`파일이 ${FIGURE_SIZE_MAX}바이트(글자)를 넘습니다`);
  if (!new RegExp(`<svg[^>]*\\sviewBox="${FIGURE_VIEWBOX}"`).test(text)) issues.push(`viewBox="${FIGURE_VIEWBOX}"가 필요합니다(모든 그림은 같은 정사각 캔버스)`);
  if (!/<svg[^>]*\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(text)) issues.push('xmlns="http://www.w3.org/2000/svg"가 필요합니다');
  if (/<!DOCTYPE|<!ENTITY|<\?xml/i.test(text)) issues.push("DOCTYPE·ENTITY·XML 선언은 쓸 수 없습니다");
  const tags = new Set([...text.matchAll(/<([a-zA-Z][\w:-]*)/g)].map((m) => m[1]!));
  for (const tag of tags) {
    if (!(FIGURE_ELEMENTS as readonly string[]).includes(tag)) issues.push(`쓸 수 없는 요소: <${tag}>`);
  }
  if (/\son[a-z]+\s*=/i.test(text)) issues.push("이벤트 속성(on…)은 쓸 수 없습니다");
  if (/\sstyle\s*=/i.test(text)) issues.push("style 속성은 쓸 수 없습니다(클래스 k-*로 칠합니다)");
  if (/(?:xlink:)?href\s*=|javascript:|url\(\s*["']?(?:https?:|data:)/i.test(text)) issues.push("링크·외부 주소는 쓸 수 없습니다");
  // 색을 하드코딩하지 않는다: 사이트 색 토큰을 따라가야 라이트·다크 모두에서 읽힌다
  for (const m of text.matchAll(/\s(fill|stroke|color|stop-color|opacity|fill-opacity|stroke-opacity)\s*=\s*"([^"]*)"/g)) {
    const [, attr, value] = m;
    if (!((attr === "fill" || attr === "stroke") && value === "none")) issues.push(`${attr}="${value}": 색은 속성으로 쓰지 말고 클래스 k-*로 칠합니다(fill="none"만 허용)`);
  }
  if (/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/.test(text)) issues.push("색 값(#…, rgb(), hsl())을 쓸 수 없습니다");
  for (const m of text.matchAll(/\sclass\s*=\s*"([^"]*)"/g)) {
    for (const cls of m[1]!.split(/\s+/).filter(Boolean)) if (!/^k-[a-z0-9-]+$/.test(cls)) issues.push(`클래스 "${cls}": k-로 시작하는 그림 전용 클래스만 씁니다`);
  }
  for (const m of text.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)) {
    const label = m[1]!.trim();
    if (/</.test(label) || [...label].length > FIGURE_TEXT_MAX || label.length === 0) issues.push(`글자 "${label.slice(0, 10)}": 그림 안 글자는 ${FIGURE_TEXT_MAX}자 이하 표식(A, B, 1, 2)만 씁니다`);
  }
  return issues;
}

/** 캡션이 "직접 그린 그림"으로 끝나는지(끝의 마침표·괄호는 봐준다) */
export const captionHasCredit = (caption: string) => caption.trim().replace(/[.)\]」』]+$/, "").endsWith(FIGURE_CREDIT);
