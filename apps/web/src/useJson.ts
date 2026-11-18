import { useEffect, useState } from "react";

export type Load<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "notfound" } | { state: "error" };

/** /content/*.json을 읽는다. url이 null이면 읽지 않는다 */
export function useJson<T>(url: string | null): Load<T> {
  const [result, setResult] = useState<{ url: string | null; load: Load<T> }>({ url, load: { state: "loading" } });

  useEffect(() => {
    if (!url) return;
    let alive = true;
    fetch(url)
      .then(async (res): Promise<Load<T>> => {
        // CloudFront·Vite는 없는 파일에 index.html(200)을 주므로 상태 코드가 아니라 형식으로 판단한다
        if (res.status === 404 || !res.headers.get("content-type")?.includes("application/json")) {
          return { state: "notfound" };
        }
        if (!res.ok) return { state: "error" };
        // shortcut: 형식은 빌드 때 스키마로 검증했으므로 다시 검증하지 않는다. 외부 데이터를 읽게 되면 termSchema로 검증할 것
        return { state: "ok", data: (await res.json()) as T };
      })
      .catch((): Load<T> => ({ state: "error" }))
      .then((load) => {
        if (alive) setResult({ url, load });
      });
    return () => {
      alive = false;
    };
  }, [url]);

  return result.url === url ? result.load : { state: "loading" };
}
