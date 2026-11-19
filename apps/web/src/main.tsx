import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/500.css";
import "@fontsource/noto-sans-kr/700.css";
import "@fontsource/noto-sans-kr/800.css";
import "@fontsource/sora/500.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "./styles/tokens.css";
import "./styles/global.css";
import Layout from "./Layout.tsx";
import NotFoundPage from "./NotFoundPage.tsx";
import HomePage from "./features/explore/HomePage.tsx";
import TermPage from "./features/term/TermPage.tsx";
import { installStaleChunkReload } from "./reloadOnStaleChunk.ts";
import { applyTheme, initialTheme } from "./theme.ts";

// 첫 렌더 전에 테마를 정한다 (CSP가 인라인 스크립트를 막으므로 index.html에서 할 수 없다)
applyTheme(initialTheme());
installStaleChunkReload();

const router = createBrowserRouter([
  {
    Component: Layout,
    // 계정 화면(lazy)으로 바로 들어올 때 받는 동안은 비워 둔다(잠깐이라 자리 표시 없음)
    HydrateFallback: () => null,
    children: [
      { index: true, Component: HomePage },
      { path: "terms/:id", Component: TermPage },
      // 계정 화면은 따로 받는다(홈 묶음을 가볍게). 인증 구현(Amplify)은 store가 따로 받는다
      { path: "auth/login", lazy: { Component: async () => (await import("./features/auth/LoginPage.tsx")).default } },
      { path: "auth/signup", lazy: { Component: async () => (await import("./features/auth/SignupPage.tsx")).default } },
      { path: "auth/confirm", lazy: { Component: async () => (await import("./features/auth/ConfirmPage.tsx")).default } },
      { path: "auth/reset", lazy: { Component: async () => (await import("./features/auth/ResetPage.tsx")).default } },
      { path: "me", lazy: { Component: async () => (await import("./features/progress/MePage.tsx")).default } },
      { path: "*", Component: NotFoundPage },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
