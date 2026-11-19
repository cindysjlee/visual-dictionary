// 가짜 기록 API(테스트·개발 빌드 전용, 배포 묶음에 없음). 가짜 인증의 토큰("fake-token:<이메일>")으로 사용자를 나눠 localStorage에 둔다.
// localStorage "fake-progress-fail"이 "1"이면 모든 요청이 실패한다(API 장애에도 재생은 그대로인지 E2E로 확인, NFR-02)
import { auth } from "../auth/store.ts";
import { ProgressError, type ProgressApi, type ProgressRecord } from "./api.ts";

const KEY = "fake-progress";
type Store = Record<string, Record<string, ProgressRecord>>;
const read = (): Store => JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
const write = (s: Store) => localStorage.setItem(KEY, JSON.stringify(s));

async function user(): Promise<string> {
  if (localStorage.getItem("fake-progress-fail") === "1") throw new ProgressError("ProgressFailed", 503);
  const token = await auth.accessToken();
  if (!token?.startsWith("fake-token:")) throw new ProgressError("NotSignedIn", 401);
  return token.slice("fake-token:".length);
}

export const fakeProgressApi: ProgressApi = {
  async list() {
    return Object.values(read()[await user()] ?? {});
  },
  async put(termId, read_, source) {
    const email = await user();
    const s = read();
    write({ ...s, [email]: { ...s[email], [termId]: { termId, read: read_, source, updatedAt: new Date().toISOString() } } });
  },
  async withdraw() {
    const email = await user();
    const s = read();
    delete s[email];
    write(s);
    const users = JSON.parse(localStorage.getItem("fake-auth-users") ?? "{}") as Record<string, unknown>;
    delete users[email];
    localStorage.setItem("fake-auth-users", JSON.stringify(users));
  },
};
