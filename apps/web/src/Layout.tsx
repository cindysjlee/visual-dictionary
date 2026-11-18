import { Link, Outlet } from "react-router";

export default function Layout() {
  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="logo">
            보안·CS 개념 시각화 사전
          </Link>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}
