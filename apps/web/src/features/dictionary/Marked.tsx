// 본문 표시(==형광펜==·`코드`)를 React 요소로 그린다. HTML을 넣지 않고 파서(content-schema parseMarks)가 나눈 조각만 쓴다(XSS 없음).
// 형광펜은 화면에 들어올 때 한 번 그어진다. 동작 줄이기면 처음부터 그어져 있다(dictionary.css .la-hl-text)
import { useEffect, useRef, useState } from "react";
import { parseMarks } from "@app/content-schema/marks";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Marked({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(reduced);
  const { segments } = parseMarks(text); // 검증을 통과한 콘텐츠라 오류는 없다. 있어도 나뉜 데까지 그린다
  const hasMark = segments.some((s) => s.kind === "mark");
  useEffect(() => {
    const el = ref.current;
    if (!el || seen || !hasMark) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setSeen(true), { rootMargin: "0px 0px -20% 0px" }); // 비율 기준이면 화면보다 긴 문단은 끝내 안 그어진다
    io.observe(el);
    return () => io.disconnect();
  }, [seen, hasMark]);
  return (
    <span ref={ref}>
      {segments.map((s, i) =>
        s.kind === "mark" ? (
          <span key={i} className={seen ? "la-hl la-hl-text is-on" : "la-hl la-hl-text"}>
            {s.text}
          </span>
        ) : s.kind === "code" ? (
          <code key={i} className="la-code">
            {s.text}
          </code>
        ) : (
          s.text
        ),
      )}
    </span>
  );
}
