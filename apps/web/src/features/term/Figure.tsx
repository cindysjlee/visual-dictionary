// 용어 옆 그림(docs/04 "그림"): /content/figures/<id>.svg를 읽어 걸러 낸 뒤 페이지에 직접 넣는다(인라인이라 색 토큰·테마를 따라간다).
// 파일은 빌드 때 검증기(checkFigureSvg)가 이미 막았고, 여기서 한 번 더 요소·속성 허용 목록으로 걸러 낸다. 그림 안에는 스크립트·스타일·링크가 없다.
// 이 파일은 용어 쪽(지연 로드)에만 들어간다: 홈 묶음에 그림 코드·SVG가 들어가지 않는다
import { useEffect, useRef, useState } from "react";
import type { Figure as FigureData } from "@app/content-schema";
import { FIGURE_ELEMENTS } from "@app/content-schema/figure";

const SVG_NS = "http://www.w3.org/2000/svg";
const ATTRS = new Set(["viewBox", "class", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "points", "fill", "stroke", "transform"]);

/** 읽은 SVG 글자를 걸러 낸 요소로. 허용하지 않는 요소는 통째로, 허용하지 않는 속성은 떼어 낸다. 읽을 수 없으면 null */
export function parseFigureSvg(text: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (root.localName !== "svg" || root.namespaceURI !== SVG_NS || doc.querySelector("parsererror")) return null;
  const allowed = new Set<string>(FIGURE_ELEMENTS);
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      if (!allowed.has(child.localName) || child.namespaceURI !== SVG_NS) child.remove();
      else walk(child);
    }
    for (const attr of [...el.attributes]) if (!ATTRS.has(attr.name)) el.removeAttribute(attr.name);
  };
  walk(root);
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("focusable", "false");
  return document.importNode(root, true) as unknown as SVGSVGElement;
}

/** 이 탭에서 이미 읽은 그림(뒤로 가기 때 바로 보이게) */
const cache = new Map<string, string>();

function useFigureText(id: string): string | null {
  const [text, setText] = useState<string | null>(cache.get(id) ?? null);
  useEffect(() => {
    if (cache.has(id)) return;
    let alive = true;
    fetch(`/content/figures/${id}.svg`)
      .then(async (res) => {
        // 없는 파일에 index.html(200)을 주는 개발 서버를 걸러 낸다: 형식으로 판단
        const body = res.ok ? await res.text() : "";
        return body.trimStart().startsWith("<svg") ? body : null;
      })
      .catch(() => null)
      .then((body) => {
        if (!body) return;
        cache.set(id, body);
        if (alive) setText(body);
      });
    return () => {
      alive = false;
    };
  }, [id]);
  return text;
}

/** 설명의 한 부분 옆에 놓는 그림 하나. 캡션은 늘 보이고, 그림은 화면 읽기에 alt로만 읽힌다 */
export function Figure({ figure }: { figure: FigureData }) {
  const text = useFigureText(figure.id);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el || !text) return;
    const svg = parseFigureSvg(text);
    if (svg) el.replaceChildren(svg);
  }, [text]);
  return (
    <figure className="la-tfig" data-figure={figure.id}>
      <div ref={host} className="la-tfig-svg" role="img" aria-label={figure.alt} />
      <figcaption>{figure.caption}</figcaption>
    </figure>
  );
}
