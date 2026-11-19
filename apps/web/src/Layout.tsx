import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { loginPath } from "./features/auth/safeNext.ts";
import { auth, startAuth, useAuth } from "./features/auth/store.ts";
import { startProgress } from "./features/progress/store.ts";
import { LogoMark, MoonIcon, SunIcon } from "./icons.tsx";
import { applyTheme, readStoredTheme, storeTheme, systemDarkQuery, type Theme } from "./theme.ts";

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"));

  // 직접 고른 적이 없으면 OS 설정이 바뀔 때 따라간다
  useEffect(() => {
    const query = systemDarkQuery();
    const follow = () => {
      if (readStoredTheme()) return;
      const next = query.matches ? "dark" : "light";
      applyTheme(next);
      setTheme(next);
    };
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    storeTheme(next);
    setTheme(next);
  };

  return (
    <button type="button" className="icon-btn" aria-label="다크 모드" aria-pressed={theme === "dark"} onClick={toggle}>
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/** 상단바 계정 영역(FR-AUTH-04): 로그아웃 상태면 로그인 버튼, 로그인 상태면 이메일과 로그아웃. 진행 현황·계정 설정은 6단계(/me) */
function AccountBar() {
  const state = useAuth();
  const { pathname, search } = useLocation();
  const [busy, setBusy] = useState(false);
  if (state.status === "loading") return <span className="account-slot" aria-hidden="true" />;
  if (state.status === "user") {
    const signOut = async () => {
      setBusy(true);
      try {
        await auth.signOut();
      } finally {
        setBusy(false);
      }
    };
    return (
      <div className="account-bar">
        <span className="account-email" title={state.email}>
          {state.email}
        </span>
        <button type="button" className="btn btn-sm" onClick={signOut} disabled={busy}>
          로그아웃
        </button>
      </div>
    );
  }
  // 계정 화면에서는 돌아갈 곳을 다시 붙이지 않는다(로그인 → 로그인 고리 방지)
  const to = pathname.startsWith("/auth/") ? "/auth/login" : loginPath(pathname + search);
  return (
    <Link to={to} className="btn btn-sm">
      로그인
    </Link>
  );
}

export default function Layout() {
  // 첫 화면을 그린 뒤 저장된 로그인 상태를 읽는다(인증 구현은 이때 따로 받는다)
  useEffect(() => {
    startAuth();
    startProgress(); // 로그인 상태를 따라 학습 기록을 불러오고 비운다
  }, []);
  return (
    <>
      <div className="backdrop" aria-hidden="true">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="blob blob-4" />
      </div>
      <div className="page">
        <header className="glass topbar">
          <Link to="/" className="logo">
            <LogoMark />
            시각화 사전
          </Link>
          <nav className="topbar-nav" aria-label="주 메뉴">
            <NavLink to="/" end>
              용어
            </NavLink>
          </nav>
          <div className="spacer" />
          <AccountBar />
          <ThemeToggle />
        </header>
        <main className="stack">
          <Outlet />
        </main>
      </div>
    </>
  );
}
