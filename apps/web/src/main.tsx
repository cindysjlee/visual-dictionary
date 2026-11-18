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
    children: [
      { index: true, Component: HomePage },
      { path: "terms/:id", Component: TermPage },
      { path: "*", Component: NotFoundPage },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
