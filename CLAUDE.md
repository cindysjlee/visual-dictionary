모든 답변·보고·계획은 한국어로 작성한다(코드·명령어·고유명사 제외).

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
| `docs/06-3d-player.md` | 3D 플레이어 설계: 공간·카메라·효과 어휘·대체 화면 (**플레이어 작업 전 필독**) |
| `docs/examples/*.json` | CSRF(흐름형), 콜 스택(스택형), 데드락(점유형) 예시 데이터 |

## 반드시 지킬 설계 원칙

1. **용어 = JSON 파일 하나.** 용어별로 애니메이션 코드를 따로 작성하지 않는다. 새 용어는 `content/terms/<id>.json`만 추가해서 재생되어야 한다 (DC-03).
2. **플레이어는 유형별 3개.** `flow`(메시지 흐름형), `stack`(스택형), `lock`(자원 점유형). 플레이어가 시나리오 JSON을 읽어 화면을 그린다. 기존 3개로 표현할 수 없는 개념이 나올 때만 플레이어를 추가한다.
3. **스키마는 하나만.** 용어 JSON의 Zod 스키마를 한 곳에 두고, 빌드 검증기와 프론트엔드 타입이 같은 스키마를 공유한다. 형식이 틀린 데이터는 빌드를 실패시킨다 (FR-CNT-02).
4. **콘텐츠는 정적 파일.** 빌드할 때 `/content/index.json`(목록·검색용)과 `/content/terms/<id>.json`(상세용)을 만들어 S3/CloudFront로 제공한다. 탐색·상세·애니메이션은 백엔드 없이 동작해야 한다 (NFR-02).
5. **백엔드는 인증과 학습 기록에만.** Cognito(인증), API Gateway + Lambda(account, progress, activity), DynamoDB. 진행률은 저장하지 않고 브라우저에서 `index.json`과 학습 기록으로 계산한다.
6. **API는 토큰의 사용자 ID로만 대상을 정한다.** 요청 본문이나 경로의 userId를 믿지 않는다 (NFR-01).
7. **용어 ID는 한 번 배포하면 바꾸지 않는다.** 학습 기록의 키이기 때문이다 (FR-CNT-05).
8. **단계 진행은 순수 PlaybackEngine이 정한다.** 3D 장면은 three.js + React Three Fiber로 그리고, 단계 안의 움직임(날아가기·카메라 이동·뒤집기)은 `useFrame` 기반 타임라인으로 만든다. 버튼·탭·자막 같은 일반 UI의 움직임은 Framer Motion(`motion/react`)을 쓴다. CSS 애니메이션은 장식 효과에만 쓴다. 3D 장면도 용어별 코드를 쓰지 않고, 용어 JSON의 행위자 종류(kind)·구역(zone)·효과(effects)를 읽어 만든다 (DC-01, DC-03, `docs/06`).
9. **동작 줄이기(`prefers-reduced-motion`)를 존중**하고, 자막만 읽어도 개념이 이해되게 쓴다. 재생 컨트롤은 키보드로 조작 가능해야 한다 (NFR-03).
10. **디자인 토큰은 한 곳에서만 관리한다.** 현재 디자인은 `docs/05-ui-design.md`의 Bento Glass(라이트/다크, 토큰 파일 `apps/web/src/styles/tokens.css`)이고, 이것도 출발점일 뿐이며 더 나은 디자인이 있으면 바꿔도 된다. 단, 화면마다 따로 색·글꼴을 정하지 않는다. 바꿀 때는 먼저 사용자에게 제안하고, 승인되면 `docs/05`와 코드의 토큰 파일을 함께 고쳐 전체 화면에 한 번에 적용한다. 공격(위험)과 방어(차단)는 색만이 아니라 명도로도 구분되게 유지한다 (빨강·초록 조합 금지).
11. **위 구조는 의도한 설계다.** Zod 스키마 공유, 플레이어 3종 분리, 콘텐츠 빌드 파이프라인을 "불필요한 추상화"로 보고 합치거나 없애지 않는다. 코드 최소화 지침(ponytail, karpathy)은 이 구조 안에서 적용한다.

## 기술 스택

- 전부 TypeScript
- Frontend: React 19, Vite 8, React Router 8 (data mode), three.js + React Three Fiber 9 + drei 10(3D 플레이어, 상세 페이지에서만 동적 import), Framer Motion(`motion` 패키지, 일반 UI), Zod 4, TypeScript 6, Amplify Auth(Cognito, 동적 import), 학습 기록은 작은 store(`useSyncExternalStore`, TanStack Query 대신), Vitest
- Backend: Node.js 22 on AWS Lambda, API Gateway HTTP API(JWT 인가), EventBridge + SQS DLQ(회원 탈퇴 이벤트)
- Database: DynamoDB (`LearningRecord`: PK userId, SK termId / `RecentView`: 같은 키 + TTL)
- Infra: AWS CDK(TypeScript, 1단계부터), GitHub Actions. 배포는 `npm run deploy` (빌드 → `cdk deploy --profile vd`)
- AWS 접속: 프로필 `vd`(`aws login` 임시 자격 증명). 만료되면 직접 해결하지 말고 사용자에게 `aws login --profile vd`를 요청한다. 계정 ID·사용자 이름·자격 증명은 어떤 파일에도 적지 않는다
- AWS 리전: **서울 `ap-northeast-2`**. 단, CloudFront용 ACM 인증서만 `us-east-1`

## 권장 폴더 구조

```
apps/web/                 React 앱
  src/players/            PlaybackEngine(순수 로직), PlayerShell(컨트롤·자막), 2D 대체 화면
  src/players/three/      3D 장면: 공통(배치·결과 상태·타임라인·카메라·가림) + FlowScene / StackScene / LockScene
  src/features/           explore(목록·검색), term(상세), auth, progress
packages/content-schema/  Zod 스키마와 타입 (web, scripts가 함께 사용)
content/terms/            용어 JSON 원본
scripts/                  validate-content, build-index
services/api/             Lambda 핸들러 (account, progress, activity) — 5단계부터
infra/                    CDK 스택 — 1단계: S3+CloudFront(WebStack), 5단계부터 Cognito·API 추가
docs/                     설계 문서
```

## 구현 단계 (순서대로 진행)

| 단계 | 범위 | 완료 기준 |
| --- | --- | --- |
| 1 | 프로젝트 생성, 화면 틀, 콘텐츠 스키마·검증기·인덱스 생성, CSRF 데이터 1개, S3+CloudFront 첫 배포 | 배포 주소에 화면이 뜨고, 형식이 틀린 JSON은 빌드에서 거부된다 |
| 2 | PlaybackEngine, 장면 스키마, 3D FlowPlayer, 재생 컨트롤·자막, 방어 모드, 2D 대체 화면 | CSRF가 3D로 끝까지 재생되고, 방어 모드에서 5단계에서 차단된다 |
| 3 | 목록, 카테고리 필터, 검색 + 보안 용어 4개 추가 | 플레이어 코드 수정 없이 데이터만 추가해 새 용어가 재생된다 |
| 4 | 3D StackPlayer, LockPlayer(스택형·점유형 효과 어휘) + CS 용어 3개 | 초기 용어 8개 모두 재생. 비회원 기능 완성 |
| 5 | Cognito, 회원가입·이메일 인증·로그인·비밀번호 재설정 | 가입~로그인, 새로고침 후에도 로그인 유지 |
| 6 | Progress API, 읽음 기록·진행률·읽음 필터, Account API(탈퇴 시 기록 삭제) | 다른 브라우저에서도 같은 진행률, 탈퇴 후 기록 없음 |
| 7 | 선택 기능: 최근 본 용어, 관련 용어, ~~재생 속도~~(완료, 0.75~2×), 자동 배포 | 요구사항의 "선택" 항목 |

**현재 단계: 7단계 배포 완료(최근 본 용어, 관련 용어 두 쌍, 자동 배포 CI 스택·워크플로). 워크플로 첫 수동 실행과 push 실행 켜기는 사용자 확인 대기.** 단계를 끝내면 이 줄을 갱신할 것.
6단계 결과: 스택 `VisualDictionaryApi`(HTTP API JWT·초당 10/버스트 20, Lambda progress·account·cleanup, `LearningRecord` 삭제 보호·RETAIN, 정리 큐·DLQ·알람), CloudFront `/api/*`와 SPA 라우팅 함수(대체 응답 없음, 없는 파일 404), `services/api/`, `features/progress/`, `/me`, E2E `@progress`, `npm run smoke:progress`. 탈퇴 순서·실패 표·요청 제한·로그는 docs/03 2.5.
7단계 결과: `RecentView` 테이블·ActivityFn(`/api/activity`), 홈 최근 3개·/me 10개, 관련 용어(SQL 인젝션↔XSS, SSRF↔CSRF), 스택 `VisualDictionaryCi`(GitHub OIDC 역할, `-c githubRepo=…`일 때만), `.github/workflows/deploy.yml`(지금은 수동 실행만), `scripts/ci-gate.ts`, check:aws에 CI 역할 검사(로컬에서만). 자세한 것은 docs/03 2.5·2.6.
남은 일:
- 사용자가 GitHub Secret `AWS_DEPLOY_ROLE_ARN`을 넣은 뒤 워크플로 첫 수동 실행 → 걸린 시간 보고(E2E workers 2) → push 실행 켜기는 사용자 확인 후.
- smoke:progress에 최근 본 용어 API 검사(A·B 격리, 탈퇴 후 PUT 403, RecentView 0건)를 아직 넣지 않음. 비회원 기록 이전(FR-PRG-07)은 선택.
- 나중에 별도 용어로: 스택 오버플로(stack), SYN flood(보안·flow).
- 배포에 IAM·보안 그룹 변경이 있으면 `npm run deploy`가 승인을 묻다가 터미널이 없으면 멈춘다. 그때는 아래 "작업 방식"의 배포 승인 규칙을 따른다.
배포 주소: https://d1y3rvak3nd08u.cloudfront.net (`npm run deploy`, 스택 VisualDictionaryWeb). 6단계부터 SPA 라우팅은 CloudFront Function(확장자 없는 화면 주소만 index.html)이라 없는 `/assets/`·`/content/` 파일은 진짜 404이고, `/api/*`는 API Gateway로 간다(개발 서버 Vite는 여전히 없는 파일에 index.html을 주므로 상세 페이지는 404와 JSON 아님을 모두 "없는 용어"로 처리한다). CSP가 `'self'`만 허용하므로 인라인 스크립트·`<style>`·data: 글꼴을 쓰지 말 것(JS로 넣는 스타일, 즉 React `style` prop·Motion은 CSSOM이라 허용됨).

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
- 주 대상은 PC다. 화면 확인과 E2E·axe는 데스크톱(1440×900)을 기본으로 한다(Playwright 설정에도 명시). 375px는 반응형이 깨지지 않는지(가로 스크롤·잘림·겹침)만 보는 보조 확인이다. 확인이 끝나면 chrome-devtools 화면 크기 흉내 설정을 반드시 기본값으로 되돌린다.
- draft 용어도 published로 바꾸기 전에 `npm run test:e2e:drafts`(E2E_INCLUDE_DRAFTS=1, draft가 든 개발 서버 대상)로 같은 E2E·axe를 돌린다.
- ponytail 모드는 `full` 이하로 쓴다. `ultra`는 요구사항으로 정한 기능까지 줄이려 하므로 쓰지 않는다.
- 한 단계를 끝내면 위 "현재 단계" 줄을 갱신하고, 다음 세션이 이어갈 수 있게 남은 일을 한두 줄로 적는다.
- 의미 있는 작업 단위가 끝나면 커밋한다.
- **배포 승인(`--require-approval never`)은 사용자 확인 없이 쓰지 않는다.** 배포가 IAM·보안 그룹 변경 승인 단계에서 멈추면, `cdk diff`의 보안 관련 변경(IAM 문장, 권한)을 사용자에게 보여 주고, 사용자가 "승인"이라고 답한 뒤에만 그 옵션으로 배포한다. "테스트가 통과하면 확인 없이 배포" 같은 지시도 이 승인을 대신하지 않는다.
- **자동 배포(GitHub Actions, docs/03 2.6):** 워크플로의 push 실행은 사용자 확인 뒤에만 켠다. CI가 보안 관문(권한 확장)이나 변경 관문(리소스 삭제·교체)에서 멈추면, 로컬에서 `cdk diff`의 해당 변경을 보여 주고 사용자 "승인"을 받은 뒤 로컬에서 배포한다. CI 역할(`VisualDictionaryCi`)은 `-c githubRepo=…`를 줄 때만 앱에 들어가며, 바꿀 때도 같은 승인 절차를 따른다. 워크플로의 외부 액션은 커밋 해시로 고정하고 `pull_request_target`은 쓰지 않는다.
- **운영 리소스의 데이터를 지우거나 바꾸는 명령은 매번 먼저 묻는다.** DynamoDB 항목 삭제·수정, Cognito 사용자 삭제·수정, S3 객체 삭제, SQS 메시지 삭제·다시 보내기 등이 해당한다. 예외는 smoke 스크립트가 자기가 만든 테스트 데이터(예약 도메인 테스트 사용자와 그 기록)를 지우는 경우뿐이다. 스크립트 밖에서 남은 테스트 데이터를 지우는 것도 먼저 묻는다. 확인용 조회(describe·get·list·query·scan)는 묻지 않아도 된다.
- 커밋 전에는 `ecc:verification-loop`(또는 `ecc:quality-gate`) 수준의 검증을 돌린다. 최소 `npm run verify`(콘텐츠 검증·단위 테스트·빌드·홈 묶음 검사)가 통과해야 한다.
- 테스트 실행 규칙(E2E는 Playwright: 자막·단계·차단 표시, 장면 기록, 겹침, axe 접근성. 대상 용어는 content/terms에서 자동으로 늘어난다):
  - 코드를 고칠 때마다: `npm run verify`만.
  - 특정 용어나 플레이어를 고쳤을 때: 그 용어만 골라서 E2E. 용어별 테스트에는 `@<id>` 태그가 붙어 있다(CSRF 전용 테스트도 `@csrf`). `npm run test:e2e -- --grep @csrf`(여러 개는 `--grep "@csrf|@xss"`, draft가 있으면 `npm run test:e2e:drafts -- --grep @csrf`). grep은 대소문자를 가리지 않는다.
  - push·배포 직전에만: 전체 E2E 한 번. draft가 있으면 `npm run test:e2e:drafts`만 돌린다(published를 포함하므로 `test:e2e`와 중복). draft가 없으면 `npm run test:e2e`.
  - 장면 기록·겹침 검사는 테스트 빌드 전용 장면 배속(`__sceneSpeed` 10×, 타임라인·카메라)으로 돌고, 겹침 검사는 연출 없이 단계 결과 상태(동작 줄이기 경로)에서 잰다. 실제 속도로 끝까지 보는 건 "CSRF 공격 흐름 1×"와 "재생 속도 2×" 두 테스트뿐이다.
- 테스트 진행이 사용자에게 보이게 한다. verify·test:e2e·test:e2e:drafts 같은 테스트는 백그라운드가 아니라 앞에서 실행해 진행 출력이 대화창에 보이게 하고, Playwright는 테스트마다 결과가 찍히는 list 리포터를 쓴다. 시작할 때 "무엇을 돌리는지, 테스트 몇 개, 예상 시간"을 한 줄로, 끝나면 "통과 n / 실패 n / 걸린 시간"을 한 줄로 알린다. 실패하면 실패한 테스트 이름과 이유를 먼저 보인다. 꼭 백그라운드로 돌려야 하면 이유를 말하고, 끝날 때까지 다른 작업을 시작하지 않는다.
- 배포 후에는 `npm run smoke:prod`(보안 헤더·SPA 대체 응답·robots.txt·상세 페이지·`/config.json`)와 `npm run smoke:auth`(실제 Cognito: 메일 없는 테스트 사용자로 로그인·새로고침 유지·로그아웃, 끝나면 사용자 삭제), `npm run smoke:progress`(사용자 A·B로 API 권한·다른 브라우저 진행률·화면 탈퇴와 그 뒤 예전 토큰 거부·테이블 0건, 끝나면 사용자 삭제)를 돌린다.
- 배포 후에는 smoke와 함께 `npm run check:aws`(읽기 전용 명령만으로 배포된 리소스 설정을 기대값과 비교: API 라우트·JWT 인가·요청 제한, 테이블, 정리 큐·DLQ·경보, Lambda 권한·로그 보존, CloudFront 동작·함수·오류 페이지·CSP, Cognito 설정)도 돌린다. 콘솔 확인 대신 이것을 쓴다.
- 인증 관련 코드(`apps/web/src/features/auth/`, `infra/lib/auth-stack.ts`, CSP)를 바꿔 배포했을 때만 `npm run smoke:auth:signup`(운영 화면에서 실제 가입 → 관리자 API로 UNCONFIRMED 확인 → 삭제)을 돌린다. 인증 메일을 1통 쓰므로(계정 전체 하루 50통) 배포마다 돌리지 않는다. 개발 서버(localhost)는 가짜 인증이라 거기서 가입하면 Cognito에 아무것도 생기지 않는다(화면에 "개발용 가짜 인증" 안내가 뜬다).
- skill은 ecc 플러그인 이름(`ecc:e2e-testing`, `ecc:tdd-workflow`, `ecc:verification-loop`, `ecc:security-review` 등)으로 부른다.
- 단계가 끝나면 CLAUDE.md의 현재 단계를 갱신하고, 커밋한 뒤 push한다.
- 여러 파일에 걸친 변경, 영향 범위 확인, "이건 어디서 쓰이나" 같은 구조 질문은 `graphify-out/GRAPH_REPORT.md`를 먼저 읽고, 필요하면 `graphify query`/`path`/`explain`(영향 범위는 `affected`)을 터미널에서 실행해서 답한다.
- 그래프는 참고용이고 설계 기준은 `docs/`다. 둘이 다르면 docs를 따르고, 그래프가 오래됐으면 갱신한다. 범위는 `.graphifyignore`(apps/web/src, packages, scripts, docs). 커밋 훅은 코드만 AST로 갱신(LLM 사용 없음)하므로, 문서가 바뀌면 사용자가 필요할 때 `/graphify . --update`로 갱신한다.
- 질문은 코드 이름(함수·파일명)으로 하거나 `--seed`로 시작점을 지정한다. 문서 개념 이름은 `docs/03` 1.5절 대응표로 코드 이름을 찾는다.
- INFERRED·AMBIGUOUS로 표시된 연결은 실제 코드를 열어 확인한 뒤에 믿는다.
