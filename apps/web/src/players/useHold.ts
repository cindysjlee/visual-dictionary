import { useEffect, useRef } from "react";

/** active인 동안 ms만큼 지나면 onDone. resetKey가 바뀌면 처음부터 센다. requestAnimationFrame이라 탭이 숨겨지면 멈춘다 */
export function useHold(ms: number, active: boolean, resetKey: string, onDone: () => void) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!active) return;
    // shortcut: 일시정지하면 남은 시간이 아니라 처음부터 다시 센다. 2D 대체 화면 전용이라 충분
    let elapsed = 0;
    let last = performance.now();
    let id = 0;
    const tick = (now: number) => {
      elapsed += Math.min(now - last, 100); // 탭이 숨겨졌다 돌아올 때 한 번에 건너뛰지 않게
      last = now;
      if (elapsed >= ms) done.current();
      else id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [ms, active, resetKey]);
}
