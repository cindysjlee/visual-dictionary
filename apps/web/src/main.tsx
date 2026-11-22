import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, redirect } from "react-router";
import { RouterProvider } from "react-router/dom";
import "@fontsource/noto-serif-kr/700.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/dictionary.css";
import Layout from "./Layout.tsx";
import NotFoundPage from "./NotFoundPage.tsx";
import HomePage from "./features/explore/HomePage.tsx";
import { hasStoredSession } from "./features/auth/session.ts";
import LandingPage from "./features/landing/LandingPage.tsx";
import TermPage from "./features/term/TermPage.tsx";
import { installStaleChunkReload } from "./reloadOnStaleChunk.ts";
import { applyTheme, initialTheme } from "./theme.ts";

const hasHandedNotice = () => {
  try {
    return sessionStorage.getItem("vd-notice") !== null;
  } catch {
    return false;
  }
};

// 첫 렌더 전에 테마를 정한다 (CSP가 인라인 스크립트를 막으므로 index.html에서 할 수 없다)
applyTheme(initialTheme());
// 3D 장면 모양 비교(미리보기): ?scene=plain(초기 3D + 도판 틀) | paper(종이 장면, 기본). html[data-scene]에 두고 이 탭 동안 기억한다. 고르면 이 코드는 지운다
{
  const pick = new URLSearchParams(location.search).get("scene");
  let scene = pick === "plain" || pick === "paper" ? pick : null;
  try {
    if (scene) sessionStorage.setItem("vd-scene", scene);
    else scene = sessionStorage.getItem("vd-scene");
  } catch {
    // 저장소를 못 쓰면 주소에 있을 때만
  }
  document.documentElement.dataset.scene = scene ?? "paper";
}
installStaleChunkReload();

const router = createBrowserRouter([
  {
    Component: Layout,
    // 계정 화면(lazy)으로 바로 들어올 때 받는 동안은 비워 둔다(잠깐이라 자리 표시 없음)
    HydrateFallback: () => null,
    children: [
      // 랜딩: 저장된 로그인이 있으면 목록으로(replace라 뒤로 가기 고리 없음). 토큰이 유효한지는 /terms에서 확인한다.
      // 다른 화면이 넘긴 안내(구글 사용자 탈퇴 뒤 로그인 도메인을 거쳐 돌아옴)도 목록이 보여 주므로 목록으로 보낸다
      { index: true, loader: () => (hasStoredSession() || hasHandedNotice() ? redirect("/terms") : null), Component: LandingPage },
      { path: "about", Component: LandingPage }, // 소개: 로그인해도 늘 랜딩
      { path: "terms", Component: HomePage },
      { path: "terms/:id", Component: TermPage },
      // 계정 화면은 따로 받는다(홈 묶음을 가볍게). 인증 구현(Amplify)은 store가 따로 받는다
      { path: "auth/login", lazy: { Component: async () => (await import("./features/auth/LoginPage.tsx")).default } },
      { path: "auth/signup", lazy: { Component: async () => (await import("./features/auth/SignupPage.tsx")).default } },
      { path: "auth/confirm", lazy: { Component: async () => (await import("./features/auth/ConfirmPage.tsx")).default } },
      { path: "auth/reset", lazy: { Component: async () => (await import("./features/auth/ResetPage.tsx")).default } },
      { path: "auth/callback", lazy: { Component: async () => (await import("./features/auth/CallbackPage.tsx")).default } },
      { path: "me", lazy: { Component: async () => (await import("./features/progress/MePage.tsx")).default } },
      { path: "privacy", lazy: { Component: async () => (await import("./features/PrivacyPage.tsx")).default } },
      { path: "*", Component: NotFoundPage },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
