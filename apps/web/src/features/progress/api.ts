// 학습 기록 API의 경계. 배포 빌드는 /api/*(http.ts), 테스트·개발 빌드는 가짜 구현(fake.ts, 배포 묶음에 없음: check:bundle)

export type ReadSource = "completed" | "manual";
export type ProgressRecord = { termId: string; read: boolean; source: ReadSource; updatedAt: string };

export interface ProgressApi {
  list(): Promise<ProgressRecord[]>;
  put(termId: string, read: boolean, source: ReadSource): Promise<void>;
  /** 회원 탈퇴(계정과 기록 삭제, FR-AUTH-06) */
  withdraw(): Promise<void>;
}

/** 기록 API 오류. name: NotSignedIn(토큰 없음), Withdrawn(탈퇴한 계정, 403), ProgressFailed(그 밖) */
export class ProgressError extends Error {
  override readonly name: "NotSignedIn" | "Withdrawn" | "ProgressFailed";
  readonly status: number;
  constructor(name: ProgressError["name"], status = 0) {
    super(name);
    this.name = name;
    this.status = status;
  }
}

let impl: Promise<ProgressApi> | undefined;
export function progressApi(): Promise<ProgressApi> {
  // MODE를 이 파일에서 직접 비교한다: 다른 파일의 상수(FAKE_AUTH)로 나누면 번들러가 가짜 청크를 배포 묶음에 만든다(check:bundle이 잡음)
  impl ??=
    import.meta.env.MODE !== "production" ? import("./fake.ts").then((m) => m.fakeProgressApi) : import("./http.ts").then((m) => m.httpProgressApi);
  return impl;
}
