// 로고(¶ 문단 기호 + "시각화 사전"): 글꼴 없이 윤곽선(logoPaths.ts·logoSub.ts, scripts/build-logo.ts가 만든다)으로 그린다.
// 색은 CSS(global.css .brand-*)가 테마 토큰으로 칠한다. 낮 = 글자 아래 절반을 덮는 비스듬한 형광펜, 밤 = 글자 아래로 내린 굵은 호박색 밑줄
// 장식이므로 aria-hidden. 접근성 이름은 감싸는 링크가 준다
import { useEffect, useState } from "react";
import { COMPACT_W, ICON, LOCKUP_W, WORD } from "./logoPaths.ts";

const Marked = ({ p }: { p: { hl: string; ul: string } }) => (
  <>
    <path className="brand-hl" d={p.hl} />
    <path className="brand-ul" d={p.ul} />
  </>
);

/** 원어 표기(視覺化辭典 · visual dictionary): 한자 윤곽선이 무거워 홈 묶음에서 빼고 따로 받는다. viewBox가 고정이라 늦게 그려져도 자리가 밀리지 않는다 */
function Sub() {
  const [d, setD] = useState<string>();
  useEffect(() => {
    let live = true;
    import("./logoSub.ts").then((m) => live && setD(m.SUB)).catch(() => {}); // 못 받으면 원어 표기 없이(장식)
    return () => {
      live = false;
    };
  }, []);
  return d ? <path className="brand-sub" d={d} /> : null;
}

/** 상단바 로고. full = 아이콘 + 글자 로고 + 원어 표기, compact = 원어 표기를 뺀 축약형, icon = ¶만(아주 좁은 화면) */
export function Logo({ variant }: { variant: "full" | "compact" | "icon" }) {
  const box = { full: `0 0 ${LOCKUP_W} 112`, compact: `0 0 ${COMPACT_W} 108`, icon: "0 0 104 108" }[variant];
  return (
    <svg className={`brand brand-${variant}`} viewBox={box} aria-hidden="true" focusable="false">
      <g transform="translate(4 4) scale(.96)">
        <Marked p={ICON} />
        <path className="brand-ink" d={ICON.pil} />
      </g>
      {variant !== "icon" && (
        <g transform="translate(104 0)">
          <Marked p={WORD} />
          <path className="brand-ink" d={WORD.text} />
          {variant === "full" && <Sub />}
        </g>
      )}
    </svg>
  );
}
