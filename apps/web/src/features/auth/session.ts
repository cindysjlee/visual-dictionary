// 랜딩(/)에서 인증 구현(Amplify)을 받지 않고 "저장된 로그인이 있는지"만 본다. 토큰이 유효한지는 /terms에서 평소처럼 확인한다(만료면 로그아웃 상태)
import { FAKE_AUTH } from "./client.ts";

/** Amplify(Cognito)가 localStorage에 남기는 마지막 사용자 키: CognitoIdentityServiceProvider.<앱 클라이언트 ID>.LastAuthUser */
const COGNITO_LAST_USER = /^CognitoIdentityServiceProvider\.[^.]+\.LastAuthUser$/;

export function hasStoredSession(storage: Pick<Storage, "length" | "key" | "getItem"> = localStorage): boolean {
  try {
    // 가짜 인증(테스트·개발 빌드)의 세션 키. 배포 빌드에서는 FAKE_AUTH가 false라 이 줄이 빠진다
    if (FAKE_AUTH && storage.getItem("fake-auth-session")) return true;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && COGNITO_LAST_USER.test(key) && storage.getItem(key)) return true;
    }
  } catch {
    // 저장소를 못 쓰면(사생활 보호 모드 등) 로그인하지 않은 것으로 본다
  }
  return false;
}
