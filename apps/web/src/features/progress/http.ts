// 실제 기록 API(배포 빌드). 같은 출처의 /api/*(CloudFront → API Gateway)라 CSP connect-src는 'self'로 충분하다
import { auth } from "../auth/store.ts";
import { ProgressError, type ProgressApi, type ProgressRecord } from "./api.ts";

async function call(method: "GET" | "PUT" | "DELETE", path: string, body?: unknown): Promise<unknown> {
  const token = await auth.accessToken();
  if (!token) throw new ProgressError("NotSignedIn", 401);
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      cache: "no-store",
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ProgressError("ProgressFailed");
  }
  if (res.status === 403) throw new ProgressError("Withdrawn", 403);
  if (!res.ok) throw new ProgressError(res.status === 401 ? "NotSignedIn" : "ProgressFailed", res.status);
  return res.status === 204 ? undefined : res.json();
}

export const httpProgressApi: ProgressApi = {
  async list() {
    return ((await call("GET", "/api/progress")) as { records: ProgressRecord[] }).records;
  },
  async put(termId, read, source) {
    await call("PUT", `/api/progress/${encodeURIComponent(termId)}`, { read, source });
  },
  async withdraw() {
    await call("DELETE", "/api/account");
  },
};
