# 테스트 계획·결과 보고서

기준 시점: 2026-11-21, 커밋 `55d7297`(개인정보처리방침 정비까지 배포). 요구사항별 테스트 연결은 `09-traceability.md`, 테스트가 잡은 결함의 자세한 내용은 `08-defect-log.md`에 있다.

## 1. 테스트 계획(언제 무엇을 돌리나)

CLAUDE.md "작업 방식"의 테스트 실행 규칙을 따른다.

| 시점 | 실행 | 비고 |
| --- | --- | --- |
| 코드를 고칠 때마다 | `npm run verify` | 콘텐츠 검증 → 단위·인프라 테스트 → 타입 검사·빌드 → 홈 묶음 검사(`check:bundle`) |
| 특정 용어·플레이어·화면을 고칠 때 | 태그 E2E(`npm run test:e2e -- --grep @<id>` 등) | 태그: 용어 ID, `@auth`, `@progress`, `@activity`, `@google` |
| push·배포 직전 | 전체 E2E(`npm run test:e2e`, draft가 있으면 `test:e2e:drafts`) | 실제 속도 테스트 2개 포함 |
| 배포 뒤 | `smoke:prod`, `smoke:auth`, `smoke:progress`, `check:aws` | 인증 코드를 바꿨을 때만 `smoke:auth:signup`(인증 메일 1통) |
| main push마다(CI) | verify → E2E(실제 속도 제외) → 보안 관문 → 변경 관문 → 배포 → smoke:prod → check:aws | CI가 실제 배포하면 로컬에서 smoke:auth·smoke:progress |
| 구글 로그인 관련 변경 뒤 | 사람 확인 체크리스트 6단계(docs/03 2.4) | 구글은 자동화된 로그인을 막는다 |

## 2. 수준별 요약

| 수준 | 대상과 목적 | 테스트 수 | 최근 결과 | 실행 시간 |
| --- | --- | --- | --- | --- |
| 단위(Vitest) | 재생 엔진, 콘텐츠 스키마·장면 검증, 모든 용어×모드 시뮬레이션, 인증·진행률 로직, API 핸들러(가짜 저장소), 고아 정리, CI 관문 판단, 스크립트 인자 | 176(파일 17개) | 통과 176 / 실패 0 (11-21) | verify 전체 약 30~46초(빌드 포함) |
| 인프라(CDK assertions) | S3·CloudFront·헤더·캐시, Cognito·OAuth, API·Lambda 권한·일정, CI 역할 신뢰·권한, 템플릿 비ASCII·메일 해시 | 32(파일 4개) | 통과 32 / 실패 0 (11-21) | verify에 포함 |
| E2E(Playwright, 데스크톱 1440×900) | 화면 흐름(가짜 인증·가짜 API), 장면 기록(연출이 실제로 일어나는지), 겹침·화면 안, axe 접근성(라이트·다크) | 124(main 122 + 실제 속도 2) | 통과 124 / 실패 0 (11-21, 로컬) | 로컬 4.3~4.9분(workers 4), CI 약 9~14분(workers 2, 122개) |
| smoke:prod | 운영 보안 헤더·CSP, SPA 라우팅·404, published 용어 상세·JSON, `/config.json`, 캐시 헤더 | 35 | 통과 35 / 실패 0 (11-21) | 2~3초 |
| smoke:auth | 실제 Cognito: 로그인·새로고침 유지·로그아웃, CSP 위반 없음 | 8 | 통과 8 / 실패 0 (11-21) | 약 9초 |
| smoke:progress | 실제 API: 토큰 검증(없음·변조·만료), 사용자 격리, 다른 브라우저 진행률, API 경로 전수 호출, 화면 탈퇴·정리, 오래된 토큰 탈퇴 거부, 고아 정리 | 41 | 통과 41 / 실패 0 (11-21) | 약 5분 45초(5분 넘은 토큰을 만들기 위한 대기 포함) |
| smoke:auth:signup | 운영 화면 가입 → UNCONFIRMED 확인 → 삭제 | 근거 없음(개수 기록 없음) | 근거 없음 | 인증 메일 1통 |
| check:aws | 배포된 리소스 설정을 읽기 전용으로 기대값과 비교(API·테이블·큐·경보·Lambda 권한·로그·CloudFront·Cognito·OAuth·CI 역할·고아 정리 일정) | 67(로컬), CI에서는 Scheduler·CI 역할 검사를 건너뜀 | 통과 67 / 실패 0 (11-21) | 약 60~90초 |
| CI 관문 | 보안 관문(`cdk diff --security-only`에 IAM·보안 그룹 변경), 변경 관문(변경 세트의 삭제·교체) | 판단 단위 테스트 2(`ci-gate-rules.test.ts`) + CI 실행 16회 | 아래 4절 | 관문 각 약 1분 |
| 사람 확인 | 자막 검수, 3D 화면 확인, 실제 메일, 구글 로그인 체크리스트 | 구글 체크리스트 6항목 + 같은 이메일 가입 확인 | 1~6 통과(11-20) | — |

### 단위·인프라 테스트 파일별 개수

| 영역 | 파일(테스트 수) |
| --- | --- |
| 화면·플레이어 | `auth.test.ts`(17), `recent.test.ts`(2), `summary.test.ts`(3), `engine.test.ts`(18), `simulate.test.ts`(28), `speedStore.test.ts`(2), `lockState.test.ts`(3), `three/pure.test.ts`(13), `stackState.test.ts`(3), `reloadOnStaleChunk.test.ts`(2), `theme.test.ts`(2) |
| 콘텐츠 스키마 | `index.test.ts`(15), `scene.test.ts`(24) |
| 스크립트 | `validate-content.test.ts`(7), `ci-gate-rules.test.ts`(2), `changeset-prepare.test.ts`(3) |
| API | `api.test.ts`(32) |
| 인프라 | `web-stack.test.ts`(9), `auth-stack.test.ts`(7), `api-stack.test.ts`(8), `ci-stack.test.ts`(8) |

### E2E 파일별 개수

| 파일 | 수 | 태그 | 확인하는 것 |
| --- | --- | --- | --- |
| `player.e2e.ts` | 43 + 실제 속도 2 | 용어 ID, `@csrf` | 재생 시작·모드 전환, 방어 모드 차단, 2D 대체, 모든 용어×모드 장면 기록과 단계별 자막·번호, 2× 속도 |
| `scene-layout.e2e.ts` | 19 | 용어 ID | 단계마다 등장 행위자가 화면 안, 겹침 20% 이하, 라벨·도장 겹침 |
| `a11y.e2e.ts` | 30 | 용어 ID, `@auth`, `@google` | 홈·상세 8개·계정 화면 4개·콜백·/privacy × 라이트·다크 axe(serious·critical 0) |
| `auth.e2e.ts` | 10 | `@auth` | 가입·인증 코드·로그인·재설정, 존재 노출 방지, next 차단 5가지, 끝까지 본 뒤 로그인 안내 |
| `progress.e2e.ts` | 7 | `@progress`, `@activity` | 읽음 저장·유지·되돌림, API 실패해도 재생, 홈 표시·필터·진행률, /me, 탈퇴, 최근 본 용어 |
| `google.e2e.ts` | 5 | `@google` | 구글 로그인 흐름(가짜), 콜백 실패·코드 없음·사이트 밖 next, 구글 사용자 탈퇴 재확인, 푸터·/privacy |
| `related.e2e.ts` | 8 | 용어 ID | 관련 용어 카드 순서·이동 |

## 3. 테스트가 잡은 결함(docs/08 연결)

| 수준 | 잡은 결함 | 그 뒤 추가한 검사 |
| --- | --- | --- |
| 단위·타입 검사 | DF-10(생성자 매개변수 속성) | CLAUDE.md 문법 규칙 |
| E2E | DF-20(LockScene 2D로 떨어짐), DF-21·DF-22(겹침·화면 밖), DF-26(E2E 멈춤), DF-31(관련 용어 순서) | 장면 기록·겹침 검사, 멈춤 진단 리포터 |
| 번들 검사(`check:bundle`) | DF-08(홈 묶음에 motion), DF-28(가짜 구현 청크가 운영 묶음에) | 가짜 구현 표시 검사 |
| smoke | DF-33(최근 본 용어 GET 500, IAM 권한 누락), DF-36(탈퇴 정리 경쟁) | API 경로 전수 실제 호출, PR-07 |
| check:aws | DF-39(조건 비교 키 순서) | 정렬 비교 |
| CI | DF-38(GPU 없는 러너), DF-40(OIDC sub), DF-41(CDK 메타데이터) | CI E2E `--project=main`, 승인 체크리스트, 관문 판단 단위 테스트 |
| 배포(CloudFormation) | DF-43(Scheduler 그룹 변경 실패·롤백) | `changeset:prepare`, PR-10 |
| 사람 | DF-02·03·04·12·13·14·15·16·17·18·19·24·25(화면·자막·배포 직후 2D 등), DF-34(탈퇴 재확인 우회), DF-27(결함 아님 판정) | 장면 기록 E2E, 겹침 E2E, 서버 재인증 검사 등 |
| 검토 | DF-35(OAuth 기본값), DF-37(RecentView 정리 규칙), DF-42(파일 배포 관문) | infra 테스트, `deletable` 단위 테스트, 관문 판단 단위 테스트 |

자동 테스트가 처음부터 잡지 못하고 사람이나 운영 smoke가 먼저 찾은 결함(DF-12·13, DF-33, DF-34)은 모두 그 뒤 같은 종류를 잡는 자동 검사를 추가했다(장면 기록 E2E, API 경로 전수 호출, 오래된 토큰 탈퇴 거부).

## 4. CI 실행 기록

GitHub Actions `deploy` 워크플로, 2026-11-20 ~ 21(UTC 기준 시작 시각).

| 결과 | 횟수 | 내용 |
| --- | --- | --- |
| 성공 | 11 | 이 중 배포까지 실행한 경우는 없음(로컬에서 먼저 배포해 관문이 "바뀐 것 없음"으로 판단) |
| 실패 | 4 | 첫 수동 실행(DF-38), 두 번째 수동 실행(DF-40), 세 번째 수동 실행(DF-41), push 1회는 보안 관문이 의도대로 멈춤(Scheduler 신뢰 정책 변경, 실패한 배포 뒤 커밋 `921d33d`) |
| 진행 중 | 1 | 기준 시점의 마지막 push |

실행 시간은 12~22분(대기 포함 최대 30분)이고 대부분이 E2E(9~14분)다. Chrome 설치가 한 번 7분 걸린 적이 있다(원인 확인하지 않음).

## 5. 확인하지 못한 것

- **CI가 실제로 배포하는 경로**: 지금까지 모든 배포를 로컬에서 먼저 해서, CI의 "변경 세트 실행" 단계는 한 번도 실제로 돌지 않았다.
- **smoke:auth:signup**: 8단계(구글 로그인, 인증 코드 변경) 뒤에는 다시 돌리지 않았다. CLAUDE.md는 인증 코드를 바꿔 배포했을 때 돌리게 되어 있다.
- **성능 수치(NFR-02)**: 첫 화면 3초·기록 1초를 자동으로 재는 테스트가 없다. 측정은 11-18 Lighthouse·성능 기록 한 번(LCP 230ms, CLS 0.00)뿐이다.
- **360px(NFR-03)**: 375px 사람 확인만 했다.
- **탐색 일부**: 검색 결과 없음 안내(FR-EXP-04), 없는 용어 페이지(FR-DTL-04)는 자동 테스트가 없다.
- **실제 메일·구글 경로**: 가입·재설정 메일과 구글 로그인은 사람이 직접 확인했고 자동 테스트는 가짜 구현 위에서만 돈다.
- **고아 정리 일정의 실제 실행**: 매일 03:00 Scheduler 실행은 아직 결과를 확인하지 않았다(smoke는 함수를 직접 실행해 확인).
- **실제 속도 E2E 2개**: GPU가 없는 CI에서는 돌지 않고 로컬 전체 E2E에서만 돈다.
