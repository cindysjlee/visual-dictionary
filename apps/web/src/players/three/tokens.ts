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
} as const;

export type Palette = Record<keyof typeof TOKEN_NAMES, string>;

export function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(TOKEN_NAMES).map(([key, name]) => [key, style.getPropertyValue(name).trim() || "#888888"]),
  ) as Palette;
}

/** 테마(data-theme)가 바뀌면 다시 읽는다 */
export function usePalette(): Palette {
  const [palette, setPalette] = useState(readPalette);
  useEffect(() => {
    const observer = new MutationObserver(() => setPalette(readPalette()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return palette;
}
