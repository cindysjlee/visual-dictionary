// 배포 뒤 옛 index.html·메인 JS가 지워진(또는 바뀐) 청크를 부르면 Vite가 vite:preloadError를 보낸다. 새 index.html을 받도록 한 번만 새로고침한다.
// 한 번 제한은 sessionStorage로 표시한다. 저장소를 못 쓰는 환경에서는 새로고침하지 않는다(무한 새로고침 방지) → 장면 경계가 2D 대체 화면을 보여 준다
const KEY = "reloaded-for-stale-chunk";
const WINDOW_MS = 60_000;

export function shouldReload(storage: Pick<Storage, "getItem" | "setItem"> | undefined, now: number): boolean {
  try {
    if (!storage) return false;
    const last = Number(storage.getItem(KEY) ?? 0);
    if (now - last < WINDOW_MS) return false;
    storage.setItem(KEY, String(now));
    return storage.getItem(KEY) === String(now); // 쓰기가 조용히 무시되는 환경도 걸러 낸다
  } catch {
    return false;
  }
}

export function installStaleChunkReload() {
  window.addEventListener("vite:preloadError", (event) => {
    let storage: Storage | undefined;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = undefined;
    }
    if (!shouldReload(storage, Date.now())) return; // 막지 않으면 오류가 그대로 던져져 장면 경계가 받는다
    event.preventDefault();
    location.reload();
  });
}
