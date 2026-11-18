# 보안·CS 개념 시각화 사전

XSS, CSRF 같은 보안 공격과 콜 스택, 데드락 같은 CS 개념을 단계별 애니메이션으로 보여주는 학습용 웹서비스.
공격이 어떻게 진행되는지, 방어 모드에서는 어느 단계에서 막히는지를 보여주는 것이 핵심 가치다.
로그인 없이 모든 용어를 볼 수 있고, 로그인하면 읽은 용어와 진행률이 저장된다.

자세한 설계는 `docs/`에 있다. 작업 전에 관련 문서를 먼저 읽을 것.

| 문서 | 내용 |
| --- | --- |
| `docs/01-requirements.md` | 기능·비기능 요구사항, 제약사항 (FR-*, NFR-*, DC-* ID) |
| `docs/02-domain-model.md` | 도메인 클래스와 관계 |
| `docs/03-architecture.md` | 서브시스템, 계층 구조, 기술 스택, AWS 배치, 구현 단계 |
| `docs/04-content-format.md` | 용어 JSON 형식과 검증 규칙 (**콘텐츠 작업 전 필독**) |
| `docs/05-ui-design.md` | 화면 구조(IA), 디자인 컨셉, 색·글꼴 |
| `docs/examples/*.json` | CSRF(흐름형), 콜 스택(스택형), 데드락(점유형) 예시 데이터 |

## 반드시 지킬 설계 원칙

1. **용어 = JSON 파일 하나.** 용어별로 애니메이션 코드를 따로 작성하지 않는다. 새 용어는 `content/terms/<id>.json`만 추가해서 재생되어야 한다 (DC-03).
2. **플레이어는 유형별 3개.** `flow`(메시지 흐름형), `stack`(스택형), `lock`(자원 점유형). 플레이어가 시나리오 JSON을 읽어 화면을 그린다. 기존 3개로 표현할 수 없는 개념이 나올 때만 플레이어를 추가한다.
3. **스키마는 하나만.** 용어 JSON의 Zod 스키마를 한 곳에 두고, 빌드 검증기와 프론트엔드 타입이 같은 스키마를 공유한다. 형식이 틀린 데이터는 빌드를 실패시킨다 (FR-CNT-02).
4. **콘텐츠는 정적 파일.** 빌드할 때 `/content/index.json`(목록·검색용)과 `/content/terms/<id>.json`(상세용)을 만들어 S3/CloudFront로 제공한다. 탐색·상세·애니메이션은 백엔드 없이 동작해야 한다 (NFR-02).
5. **백엔드는 인증과 학습 기록에만.** Cognito(인증), API Gateway + Lambda(account, progress, activity), DynamoDB. 진행률은 저장하지 않고 브라우저에서 `index.json`과 학습 기록으로 계산한다.
6. **API는 토큰의 사용자 ID로만 대상을 정한다.** 요청 본문이나 경로의 userId를 믿지 않는다 (NFR-01).
7. **용어 ID는 한 번 배포하면 바꾸지 않는다.** 학습 기록의 키이기 때문이다 (FR-CNT-05).
8. **단계 순서 제어는 Framer Motion(`motion` 패키지, `motion/react`)으로만.** CSS 애니메이션은 장식 효과에만 쓴다 (DC-01).
9. **동작 줄이기(`prefers-reduced-motion`)를 존중**하고, 자막만 읽어도 개념이 이해되게 쓴다. 재생 컨트롤은 키보드로 조작 가능해야 한다 (NFR-03).
10. **디자인 토큰은 한 곳에서만 관리한다.** `docs/05-ui-design.md`의 Packet Lab은 출발점일 뿐이고, 더 나은 디자인이 있으면 바꿔도 된다. 단, 화면마다 따로 색·글꼴을 정하지 않는다. 바꿀 때는 먼저 사용자에게 제안하고, 승인되면 `docs/05`와 코드의 토큰 파일을 함께 고쳐 전체 화면에 한 번에 적용한다. 공격(위험)과 방어(차단)는 색만이 아니라 명도로도 구분되게 유지한다 (빨강·초록 조합 금지).
11. **위 구조는 의도한 설계다.** Zod 스키마 공유, 플레이어 3종 분리, 콘텐츠 빌드 파이프라인을 "불필요한 추상화"로 보고 합치거나 없애지 않는다. 코드 최소화 지침(ponytail, karpathy)은 이 구조 안에서 적용한다.

## 기술 스택

- 전부 TypeScript
- Frontend: React 19, Vite 8, React Router 8 (data mode), SVG, Framer Motion(`motion` 패키지), Zod 4, TypeScript 6, Amplify Auth(Cognito), TanStack Query, Vitest
- Backend: Node.js 22 on AWS Lambda, API Gateway HTTP API(JWT 인가), EventBridge + SQS DLQ(회원 탈퇴 이벤트)
- Database: DynamoDB (`LearningRecord`: PK userId, SK termId / `RecentView`: 같은 키 + TTL)
- Infra: AWS CDK(TypeScript), GitHub Actions
- AWS 리전: **서울 `ap-northeast-2`**. 단, CloudFront용 ACM 인증서만 `us-east-1`

## 권장 폴더 구조

```
apps/web/                 React 앱
  src/players/            FlowPlayer, StackPlayer, LockPlayer, 공통 PlaybackEngine
  src/features/           explore(목록·검색), term(상세), auth, progress
packages/content-schema/  Zod 스키마와 타입 (web, scripts가 함께 사용)
content/terms/            용어 JSON 원본
scripts/                  validate-content, build-index
services/api/             Lambda 핸들러 (account, progress, activity) — 5단계부터
infra/                    CDK 스택 — 5단계부터 (1~4단계는 S3+CloudFront만)
docs/                     설계 문서
```

## 구현 단계 (순서대로 진행)

| 단계 | 범위 | 완료 기준 |
| --- | --- | --- |
| 1 | 프로젝트 생성, 화면 틀, 콘텐츠 스키마·검증기·인덱스 생성, CSRF 데이터 1개, S3+CloudFront 첫 배포 | 배포 주소에 화면이 뜨고, 형식이 틀린 JSON은 빌드에서 거부된다 |
| 2 | 상세 페이지, PlaybackEngine, FlowPlayer, 재생 컨트롤·자막, 방어 모드 | CSRF가 끝까지 재생되고, 방어 모드에서 5단계에서 차단된다 |
| 3 | 목록, 카테고리 필터, 검색 + 보안 용어 4개 추가 | 플레이어 코드 수정 없이 데이터만 추가해 새 용어가 재생된다 |
| 4 | StackPlayer, LockPlayer + CS 용어 3개 | 초기 용어 8개 모두 재생. 비회원 기능 완성 |
| 5 | Cognito, 회원가입·이메일 인증·로그인·비밀번호 재설정 | 가입~로그인, 새로고침 후에도 로그인 유지 |
| 6 | Progress API, 읽음 기록·진행률·읽음 필터, Account API(탈퇴 시 기록 삭제) | 다른 브라우저에서도 같은 진행률, 탈퇴 후 기록 없음 |
| 7 | 선택 기능: 최근 본 용어, 관련 용어, 재생 속도, 자동 배포 | 요구사항의 "선택" 항목 |

**현재 단계: 1단계 진행 중 — 로컬 작업 완료, S3+CloudFront 첫 배포만 남음.** 단계를 끝내면 이 줄을 갱신할 것.
남은 일: 콘솔에서 S3(비공개)+CloudFront(OAC, 403/404→/index.html 200, 응답 헤더 정책) 만들고 `npm run build` 결과 `apps/web/dist`를 업로드. 403/404→index.html 때문에 없는 `/content/terms/<id>.json`도 HTML 200이 오므로, 2단계 상세 페이지는 JSON 파싱 실패를 "없는 용어"로 처리할 것.

초기 용어 8개: XSS, CSRF, SQL 인젝션, 세션 하이재킹, SSRF (flow) / TCP 3-way 핸드셰이크 (flow) / 콜 스택 (stack) / 데드락 (lock)

## 작업 방식

- 사용자와는 한국어로 대화한다.
- 사용자 개발 환경은 **데스크톱 Windows 11** (Node 24, npm). 설치 명령은 Windows 기준(winget, npm)으로 안내한다. 패키지 관리자는 npm workspaces.
- Node로 바로 실행하는 스크립트(`scripts/`, 그리고 스크립트가 import하는 `packages/`)는 Node의 타입 지우기로 실행되므로 `enum`, `namespace`, 생성자 매개변수 속성처럼 JS로 바꿔야 하는 TS 문법을 쓰지 않는다. import 경로에는 `.ts` 확장자를 붙인다.
- AWS 설정을 안내할 때는 콘솔 경로(메뉴 → 탭 → 버튼)를 함께 적는다.
- 보안 설정을 제안할 때는 추가되는 AWS 비용(소규모 기준 실제 예상 비용)도 함께 적는다.
- 용어 JSON을 새로 쓸 때는 `docs/04-content-format.md`와 예시를 따르고, 개념이 맞는지 출처(OWASP 등)를 `references`에 남긴다. 사람이 검수하기 전에는 `status`를 `draft`로 둔다.
- 설계 원칙을 바꿔야 할 것 같으면 바로 바꾸지 말고 먼저 사용자에게 이유를 설명하고 확인받는다.
- 라이브러리 API(React, Motion, Zod, React Router, Amplify, AWS CDK)는 기억에 의존하지 말고 context7로 최신 문서를 확인한 뒤 쓴다.
- 화면이나 애니메이션을 만들었으면 chrome-devtools로 실제 페이지를 열어 재생·방어 모드·콘솔 오류를 확인하고 나서 완료라고 말한다.
- ponytail 모드는 `full` 이하로 쓴다. `ultra`는 요구사항으로 정한 기능까지 줄이려 하므로 쓰지 않는다.
- 한 단계를 끝내면 위 "현재 단계" 줄을 갱신하고, 다음 세션이 이어갈 수 있게 남은 일을 한두 줄로 적는다.
