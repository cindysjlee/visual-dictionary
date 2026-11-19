// CSP 한 곳: CloudFront 응답 헤더 정책(web-stack.ts)과 배포 후 확인(scripts/smoke-prod.ts)이 같은 값을 쓴다. CDK를 불러오지 않는다
/** 브라우저가 부르는 Cognito 사용자 풀 엔드포인트(서울). 자격 증명 풀은 쓰지 않으므로 이것 하나뿐이다. 6단계 API 도메인은 그때 정한다 */
export const COGNITO_ORIGIN = "https://cognito-idp.ap-northeast-2.amazonaws.com";

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  `connect-src 'self' ${COGNITO_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
