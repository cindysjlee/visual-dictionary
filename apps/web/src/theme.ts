// 테마: 저장된 선택이 있으면 그것, 없으면 OS 설정(prefers-color-scheme)을 따른다
export type Theme = "light" | "dark";

const KEY = "theme";

export function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null; // 사생활 보호 모드 등에서 저장소 접근이 막히면 OS 설정을 따른다
  }
}

export function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // 저장하지 못해도 이번 화면에는 적용되어 있으므로 무시한다
  }
}

export const systemDarkQuery = () => matchMedia("(prefers-color-scheme: dark)");

export const initialTheme = (): Theme => readStoredTheme() ?? (systemDarkQuery().matches ? "dark" : "light");

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}
