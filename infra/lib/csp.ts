// CSP 한 곳: CloudFront 응답 헤더 정책(web-stack.ts)과 배포 후 확인(scripts/smoke-prod.ts)이 같은 값을 쓴다. CDK를 불러오지 않는다
/** 브라우저가 부르는 Cognito 사용자 풀 엔드포인트(서울). 자격 증명 풀은 쓰지 않으므로 이것 하나뿐이다. 6단계 API 도메인은 그때 정한다 */
export const COGNITO_ORIGIN = "https://cognito-idp.ap-northeast-2.amazonaws.com";
/** 배포 주소(CloudFront 기본 도메인). OAuth 콜백·로그아웃 주소의 기준 */
export const SITE_ORIGIN = "https://d1y3rvak3nd08u.cloudfront.net";
/** Cognito 로그인 도메인(8단계 구글 로그인). 접두어는 리전 안에서 유일해야 한다 */
export const LOGIN_DOMAIN_PREFIX = "visual-dictionary-auth";
export const LOGIN_ORIGIN = `https://${LOGIN_DOMAIN_PREFIX}.auth.ap-northeast-2.amazoncognito.com`;

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  // 로그인 도메인: 구글 로그인 뒤 Amplify가 인가 코드를 토큰으로 바꾸고(/oauth2/token) 로그아웃 때 토큰을 취소한다(/oauth2/revoke). 화면 이동은 CSP 대상이 아니다
  `connect-src 'self' ${COGNITO_ORIGIN} ${LOGIN_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
