// docs/05 토큰을 런타임에 읽는다. 장면 코드에 색 값을 직접 쓰지 않는다 (docs/06 2절)
import { useEffect, useState } from "react";

export const TOKEN_NAMES = {
  bg: "--bg",
  text: "--text",
  textMuted: "--text-muted",
  attack: "--attack",
  defense: "--defense",
  neutral: "--neutral",
  onColor: "--on-color",
  object: "--scene-object",
  objectDim: "--scene-object-dim",
  objectAttack: "--scene-object-attack",
  villain: "--scene-villain",
  grid: "--scene-grid",
  paper: "--scene-paper",
  gold: "--scene-gold",
  island: "--scene-island",
  ink: "--scene-ink",
  inkMuted: "--scene-ink-muted",
  inkAttack: "--scene-ink-attack",
  inkDefense: "--scene-ink-defense",
  inkSymbol: "--scene-ink-symbol",
  paperDim: "--scene-paper-dim",
  outline: "--scene-outline",
  /** 판 글자 글꼴(지면 본문과 같게) */
  font: "--font-body",
} as const;

export type Palette = Record<keyof typeof TOKEN_NAMES, string>;

export function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(TOKEN_NAMES).map(([key, name]) => [key, style.getPropertyValue(name).trim() || "#888888"]),
  ) as Palette;
}

/** 테마(data-theme)·글꼴 조합(data-font)이 바뀌거나 글꼴 조각을 다 받으면 다시 읽는다(판 글자를 새 글꼴로 다시 칠하게) */
export function usePalette(): Palette {
  const [palette, setPalette] = useState(readPalette);
  useEffect(() => {
    const reread = () => setPalette(readPalette());
    const observer = new MutationObserver(reread);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-font"] });
    document.fonts.addEventListener("loadingdone", reread);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", reread);
    };
  }, []);
  return palette;
}
