import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
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

export default function Layout() {
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
          <ThemeToggle />
        </header>
        <main className="stack">
          <Outlet />
        </main>
      </div>
    </>
  );
}
