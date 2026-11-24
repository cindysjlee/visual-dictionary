import { useEffect, useState } from "react";

export type Load<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "notfound" } | { state: "error" };

/**
 * 이 탭에서 이미 읽은 JSON(성공한 것만). 화면을 다시 열 때 첫 그리기부터 내용이 있어야 뒤로 가기가 떠난 스크롤 위치로 돌아온다
 * ("불러오는 중…"만 있는 짧은 화면에서는 복원할 위치가 잘린다). 다시 읽어 내용이 달라졌을 때만 바꾼다
 */
const cache = new Map<string, { text: string; data: unknown }>();
const cached = <T>(url: string | null): Load<T> | undefined => {
  const hit = url ? cache.get(url) : undefined;
  return hit && { state: "ok", data: hit.data as T };
};

/** /content/*.json을 읽는다. url이 null이면 읽지 않는다. 읽은 적이 있으면 바로 그 내용을 주고 뒤에서 다시 읽는다 */
export function useJson<T>(url: string | null): Load<T> {
  const [result, setResult] = useState<{ url: string | null; load: Load<T> }>(() => ({ url, load: cached<T>(url) ?? { state: "loading" } }));

  useEffect(() => {
    if (!url) return;
    let alive = true;
    fetch(url)
      .then(async (res): Promise<Load<T> | "same"> => {
        // CloudFront·Vite는 없는 파일에 index.html(200)을 주므로 상태 코드가 아니라 형식으로 판단한다
        if (res.status === 404 || !res.headers.get("content-type")?.includes("application/json")) {
          return { state: "notfound" };
        }
        if (!res.ok) return { state: "error" };
        // shortcut: 형식은 빌드 때 스키마로 검증했으므로 다시 검증하지 않는다. 외부 데이터를 읽게 되면 termSchema로 검증할 것
        const text = await res.text();
        if (cache.get(url)?.text === text) return "same"; // 같은 내용이면 같은 객체를 그대로 둔다(플레이어가 다시 시작되지 않게)
        const data = JSON.parse(text) as T;
        cache.set(url, { text, data });
        return { state: "ok", data };
      })
      .catch((): Load<T> => ({ state: "error" }))
      .then((load) => {
        if (!alive) return;
        if (load === "same") {
          // 같은 내용이다. 지금 이 화면이 이미 그 내용을 보이고 있으면 객체를 그대로 두고(플레이어가 다시 시작되지 않게),
          // 아직 loading이면 캐시의 내용으로 바꾼다. 응답이 오기 전에 화면을 나갔다 돌아오거나(첫 응답은 이 화면이 없어 캐시만 채움),
          // 개발 모드(StrictMode)가 효과를 두 번 실행하면 두 번째 응답이 여기로 오는데, 이때 loading을 그대로 두면 영원히 멈춘다
          setResult((r) => (r.url === url && r.load.state === "ok" ? r : { url, load: cached<T>(url)! }));
          return;
        }
        // 읽은 적이 있는데 이번에만 실패하면 화면에 있는 내용을 지우지 않는다
        if (load.state !== "ok" && cache.has(url)) return;
        setResult({ url, load });
      });
    return () => {
      alive = false;
    };
  }, [url]);

  return result.url === url ? result.load : (cached<T>(url) ?? { state: "loading" });
}
