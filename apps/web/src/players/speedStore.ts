// 고른 재생 속도를 이 브라우저에 기억한다(뷰어별 편의 설정). 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 1×로 시작하고 저장하지 않는다
import { isSpeed, type Speed } from "./engine.ts";

const KEY = "playback-speed";

export function readSpeed(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): Speed {
  try {
    const v = Number(storage?.getItem(KEY));
    return isSpeed(v) ? v : 1;
  } catch {
    return 1;
  }
}

export function writeSpeed(speed: Speed, storage: Pick<Storage, "setItem"> | undefined = safeStorage()) {
  try {
    storage?.setItem(KEY, String(speed));
  } catch {
    // 저장하지 못해도 이번 페이지에서는 고른 속도로 재생된다
  }
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
