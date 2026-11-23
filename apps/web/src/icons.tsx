// 선 형태 아이콘(docs/05). 모두 장식용이라 aria-hidden, 의미는 버튼의 aria-label이나 옆 글자로 전달한다
import type { ReactNode } from "react";

const Icon = ({ size = 18, viewBox = "0 0 16 16", children }: { size?: number; viewBox?: string; children: ReactNode }) => (
  <svg width={size} height={size} viewBox={viewBox} fill="none" aria-hidden="true">
    {children}
  </svg>
);

const stroke = { stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Google "G" 표시(로그인 버튼용, Google 브랜드 가이드의 4색). 버튼 글자가 이름을 알리므로 숨긴다 */
export const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

export const SearchIcon = () => (
  <Icon>
    <circle cx="7" cy="7" r="5" {...stroke} />
    <path d="M11 11l3.5 3.5" {...stroke} />
  </Icon>
);

export const ShieldIcon = ({ size = 14 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M8 1.5l5.5 2v4c0 3.5-2.4 6-5.5 7-3.1-1-5.5-3.5-5.5-7v-4z" {...stroke} />
  </Icon>
);

export const ArrowIcon = () => (
  <Icon size={20}>
    <path d="M4 12L12 4M6 4h6v6" {...stroke} strokeWidth={1.8} />
  </Icon>
);

export const MoonIcon = () => (
  <Icon viewBox="0 0 20 20">
    <path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7z" {...stroke} />
  </Icon>
);

export const SunIcon = () => (
  <Icon viewBox="0 0 20 20">
    <circle cx="10" cy="10" r="3.5" {...stroke} />
    <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" {...stroke} />
  </Icon>
);

export const PrevIcon = () => (
  <Icon viewBox="0 0 18 18">
    <path d="M11 4L6 9l5 5" {...stroke} strokeWidth={2} />
  </Icon>
);

export const NextIcon = () => (
  <Icon viewBox="0 0 18 18">
    <path d="M7 4l5 5-5 5" {...stroke} strokeWidth={2} />
  </Icon>
);

export const PlayIcon = () => (
  <Icon size={16} viewBox="0 0 14 14">
    <path d="M3 1.5v11l9-5.5z" fill="currentColor" />
  </Icon>
);

export const PauseIcon = () => (
  <Icon size={16} viewBox="0 0 14 14">
    <rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" />
    <rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" />
  </Icon>
);

export const OrbitIcon = () => (
  <Icon size={16}>
    <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v2.6h-2.6" {...stroke} />
  </Icon>
);

/** 자유 시점이 켜졌을 때: 잡은 손(끌어서 돌리는 중) */
export const GrabIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 11V6.5a1.5 1.5 0 0 1 3 0V11V5a1.5 1.5 0 0 1 3 0v6V6.5a1.5 1.5 0 0 1 3 0V13a7 7 0 0 1-7 7h-.5A5.5 5.5 0 0 1 4 14.5V11a1.5 1.5 0 0 1 3 0v1h1z" />
  </svg>
);

export const LogoMark = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
    <rect className="logo-mark-bg" width="28" height="28" rx="9" />
    <circle className="logo-mark-attack" cx="9" cy="14" r="3" />
    <path className="logo-mark-line" d="M12 14h4" strokeWidth="2" strokeLinecap="round" />
    <circle className="logo-mark-defense" cx="19" cy="14" r="3" />
  </svg>
);

/** 행위자 역할(docs/04의 권장 role)별 아이콘 */
export function ActorIcon({ role }: { role: string }) {
  const s = { ...stroke, strokeWidth: 2.4 };
  const paths: Record<string, ReactNode> = {
    user: (
      <>
        <rect x="5" y="8" width="30" height="20" rx="4" {...s} />
        <path d="M14 33h12M20 28v5" {...s} />
      </>
    ),
    attacker: (
      <>
        <path d="M8 34c0-8 5-13 12-13s12 5 12 13" {...s} />
        <path d="M11 18c0-7 4-12 9-12s9 5 9 12c-2 2-5 3-9 3s-7-1-9-3z" {...s} />
      </>
    ),
    server: (
      <>
        <path d="M6 15L20 7l14 8" {...s} />
        <path d="M10 17v12M17 17v12M23 17v12M30 17v12M6 33h28" {...s} />
      </>
    ),
    database: (
      <>
        <ellipse cx="20" cy="10" rx="12" ry="4" {...s} />
        <path d="M8 10v20c0 2.2 5.4 4 12 4s12-1.8 12-4V10M8 20c0 2.2 5.4 4 12 4s12-1.8 12-4" {...s} />
      </>
    ),
  };
  return (
    <Icon size={28} viewBox="0 0 40 40">
      {paths[role] ?? <rect x="7" y="7" width="26" height="26" rx="6" {...s} />}
    </Icon>
  );
}
