// 다 읽음 표시 = 完 인주 도장(docs/05 "다 읽음 표시", 시안 docs/design/readmark.html A): 둥근 낙관(바깥 굵은 원 + 안쪽 가는 원)에 명조 "完",
// 인주색(--la-seal)으로 비스듬히. 인주 질감(얼룩·가장자리 번짐)은 SVG 필터. 장식(aria-hidden)이라 뜻은 곁의 숨긴 글자·title이 준다.
// 3D 플레이어의 차단 도장(파란 네모, 403)과는 모양(둥근 낙관)·색(인주)으로 구분된다
import { useId } from "react";
import { SEAL_WAN } from "../../logo/logoPaths.ts";

const pad = (n: number) => String(n).padStart(2, "0");
/** 다 읽은 날: 도장 아래 "2026.11.24", 화면 읽기 "2026년 11월 24일"(이 기기 시간대) */
export function sealDate(iso: string) {
  const d = new Date(iso);
  return { short: `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`, long: `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일` };
}
/** 숨긴 글자·title에 쓰는 "다 읽음, 2026년 11월 24일"(날짜를 모르면 "다 읽음") */
export const sealLabel = (at?: string) => (at ? `완독, ${sealDate(at).long}` : "완독");

/** 完 도장 그림. light = 작은 크기(색인·목록·장부)용: 잔 얼룩 없이 가장자리 번짐만(작으면 얼룩이 "完"을 뭉갠다) */
export function Seal({ size, light = false }: { size: number; light?: boolean }) {
  const id = `seal${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg className="la-seal" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
        {/* 잔 얼룩: 노이즈가 진한 곳만 인주가 빠진다(큰 도장만) */}
        {!light && <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" result="n" />}
        {!light && <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.1 1.45" result="m" />}
        {!light && <feComposite in="SourceGraphic" in2="m" operator="in" result="c" />}
        {/* 가장자리 번짐: 큰 물결로 조금 밀어낸다 */}
        <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="3" result="w" />
        <feDisplacementMap in={light ? "SourceGraphic" : "c"} in2="w" scale={light ? 2 : 3} />
      </filter>
      <g filter={`url(#${id})`}>
        <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="6" />
        <circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" strokeWidth={light ? 3 : 2} />
        <path d={SEAL_WAN} fill="currentColor" />
      </g>
    </svg>
  );
}
