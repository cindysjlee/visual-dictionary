# 요구사항 추적 매트릭스

`01-requirements.md`의 요구사항(FR 47개, NFR 3개, DC 3개)을 설계 문서 위치, 코드 위치, 테스트와 잇는다. 기준 시점은 2026-11-24(디자인 개편: 랜딩·용어 색인·사전 지면·로고·完 도장 뒤, 용어 14개)이다. 테스트 이름·개수와 최근 결과는 `10-test-report.md`에 있다.

**상태**
- **완료**: 구현됐고, 요구사항의 핵심 동작을 자동 테스트(단위·E2E·smoke 중 하나 이상)가 확인한다.
- **부분 테스트**: 구현됐지만 자동 테스트가 요구사항 일부만 확인한다(빠진 부분은 비고).
- **테스트 없음**: 구현됐지만 이 요구사항을 직접 확인하는 자동 테스트가 없다.
- **문서와 다름**: 구현이 요구사항 문장과 다르다(`07-change-log.md` 3절).
- **미구현**: 구현하지 않았다.
- **계획**: 요구사항으로 정했지만 아직 만들지 않았다(설계 전).

**테스트 종류 약어**: 단(Vitest 단위), 인(infra CDK 테스트), E(Playwright E2E, 태그), S(배포 후 smoke), C(check:aws), 사(사람 확인)

## 1. 탐색(FR-EXP)

| ID | 설계 | 코드 | 테스트 | 상태 | 비고 |
| --- | --- | --- | --- | --- | --- |
| FR-EXP-01 용어 목록 | docs/05 화면 구조·사전 지면, docs/03 1.1 S3 | `features/explore/HomePage.tsx`, `features/dictionary/Dictionary.tsx` `IndexColumns` | E `explore.e2e.ts` @explore(모든 용어 줄의 이름·요약·분야 표지), E `a11y.e2e.ts` | 완료 | 화면 이름 "용어 색인"(`/terms`), 예전 "홈 카드 목록"(CH-56·57) |
| FR-EXP-02 카테고리 필터 | docs/05 | `HomePage.tsx` | E `explore.e2e.ts`(비회원, 기본 "전체", 카테고리마다 그 용어만), E `progress.e2e.ts`(읽음 필터와 함께) | 완료 | |
| FR-EXP-03 키워드 검색 | docs/05 | `HomePage.tsx`(이름·영문명·요약·별칭, 소문자 비교) | E `explore.e2e.ts`(별칭 대문자 입력·영문명 소문자·한글 별칭·요약 일부, 카테고리와 함께) | 완료 | |
| FR-EXP-04 결과 없음 안내 | docs/05 | `HomePage.tsx`("전체 목록 보기") | E `explore.e2e.ts`(안내 문구·버튼, 누르면 검색어·카테고리 초기화) | 완료 | |
| FR-EXP-05 상세 진입·고유 URL | docs/03 1.1 | `main.tsx` 라우트, `features/term/TermPage.tsx` | E `player.e2e.ts`(모든 용어 `/terms/<id>` 직접 열기), S smoke:prod(published 전부 200) | 완료 | |
| FR-EXP-06 첫 화면(랜딩) | docs/05 랜딩, docs/03 1.5 | `features/landing/LandingPage.tsx`·`DictionaryPage.tsx`·`SketchFigure.tsx` | 단 `sketchScene.test.ts`·`josa.test.ts`, E `a11y.e2e.ts`(`/` 라이트·다크), E `perf.e2e.ts`(랜딩 LCP·CLS), E `viewport.e2e.ts`(360·1920) | 완료 | CH-56 |
| FR-EXP-07 로그인 분기 | docs/03 1.5 | `features/auth/session.ts` `hasStoredSession()`, `main.tsx` index `loader` | 단 `auth.test.ts`(저장된 로그인 판정 5가지), E `auth.e2e.ts`(로그인 뒤 `/` → 색인) | 완료 | CH-56. 토큰이 만료됐으면 색인이 비로그인으로 보인다 |

## 2. 상세(FR-DTL)

| ID | 설계 | 코드 | 테스트 | 상태 | 비고 |
| --- | --- | --- | --- | --- | --- |
| FR-DTL-01 상세 구성 순서 | docs/05 배치 | `TermPage.tsx` | E `explore.e2e.ts`(모든 용어: 이름 → 설명 → 플레이어 자막 → 방어·해결 → 참고 자료의 문서 순서), E `a11y.e2e.ts` | 완료 | |
| FR-DTL-02 방어·해결 방법 | docs/04, docs/06 | `TermPage.tsx`, `content-schema` `modeDefenses` | E `player.e2e.ts`(방어·해결 방법 탭·칩), 단 `scene.test.ts` | 완료 | CS 용어는 "해결 방법"(대체 흐름, CH-21) |
| FR-DTL-03 참고 자료 | docs/04 | `TermPage.tsx`, 스키마의 `references` 필수 | 단 `index.test.ts`(스키마), E `explore.e2e.ts`(모든 용어의 제목·주소가 JSON과 같음) | 완료 | |
| FR-DTL-04 없는 용어 처리 | docs/03 2.4·CLAUDE.md(개발 서버·운영 404 처리) | `TermPage.tsx` → `NotFoundPage.tsx` | E `explore.e2e.ts`(없는 용어·없는 화면 주소: 안내와 목록 버튼), S smoke:prod(응답 코드) | 완료 | |
| FR-DTL-05 관련 용어 | docs/05 | `TermPage.tsx`(JSON 순서), 콘텐츠 `related` | E `related.e2e.ts` @<id>, 단 `index.test.ts`(자기 참조 거부) | 완료 | |

## 3. 애니메이션(FR-ANI)

| ID | 설계 | 코드 | 테스트 | 상태 | 비고 |
| --- | --- | --- | --- | --- | --- |
| FR-ANI-01 재생 시작 | docs/05 대표 흐름 2, docs/06 | `players/engine.ts`, `PlayerShell.tsx` | 단 `engine.test.ts`, E `player.e2e.ts`(1단계 정지·가운데 재생 버튼) | 완료 | CH-10 |
| FR-ANI-02 행위자 표시 | docs/06 배치·look | `three/model.ts`, `layout.ts` | E `scene-layout.e2e.ts`(화면 안·겹침 20% 이하), E 장면 기록 | 완료 | 역할별 모양·색 구분 자체는 사람 확인 |
| FR-ANI-03 단계별 동작 | docs/06 효과 어휘 | `three/director.ts`, `FlowScene.tsx`·`StackScene.tsx`·`LockScene.tsx` | E `player.e2e.ts` 장면 기록(출발·도착·효과·차단), 단 `simulate.test.ts` | 완료 | |
| FR-ANI-04 재생 제어 | docs/05 플레이어 컨트롤 | `engine.ts`, `PlayerShell.tsx` | 단 `engine.test.ts`, E `player.e2e.ts`(재생·스페이스·다음) | 완료 | |
| FR-ANI-05 자막 동기화 | docs/05 | `PlayerShell.tsx`(aria-live), `StepList2D.tsx` | E `player.e2e.ts`(모든 용어·모드 단계별 자막·번호) | 완료 | |
| FR-ANI-06 방어 모드 | docs/04, docs/06 | `engine.ts`, `content-schema/scene.ts` | 단 `engine.test.ts`·`simulate.test.ts`, E `player.e2e.ts` @csrf(5단계 403·401) | 완료 | |
| FR-ANI-07 플레이어 유형 | docs/06 | `players/Player.tsx`(flow·stack·lock) | 단 `simulate.test.ts`, `stackState.test.ts`, `lockState.test.ts`, E 장면 기록 | 완료 | |
| FR-ANI-08 재생 속도 | docs/05 | `engine.ts`, `speedStore.ts` | 단 `engine.test.ts`·`speedStore.test.ts`, E `player.e2e.ts`(2×, 로컬 전체 E2E 전용) | 완료 | docs/01을 구현(0.75·1·1.5·2배)에 맞춤(CH-18, CH-46) |

## 4. 인증(FR-AUTH)

| ID | 설계 | 코드 | 테스트 | 상태 | 비고 |
| --- | --- | --- | --- | --- | --- |
| FR-AUTH-01 비회원 이용 | docs/03 1.3 | 전체(로그인 없이 동작), `TermPage.tsx` 로그인 안내 | E `auth.e2e.ts` @auth(끝까지 보면 로그인 안내) | 완료 | |
| FR-AUTH-02 회원가입 | docs/03 2.4 | `SignupPage.tsx`, `password.ts`, `cognito.ts`, `infra/lib/auth-stack.ts` | 단 `auth.test.ts`, E `auth.e2e.ts`, 인 `auth-stack.test.ts`, S smoke:auth:signup | 완료 | 실제 인증 메일 수신은 사람 확인 |
| FR-AUTH-03 로그인·로그아웃 | docs/03 2.4 | `LoginPage.tsx`, `auth/store.ts` | E `auth.e2e.ts`, S smoke:auth(실제 Cognito, 새로고침 유지) | 완료 | |
| FR-AUTH-04 상태 표시 | docs/05 | `Layout.tsx` AccountBar | E `auth.e2e.ts`, `google.e2e.ts` | 완료 | |
| FR-AUTH-05 비밀번호 재설정 | docs/03 2.4 | `ResetPage.tsx` | E `auth.e2e.ts`(성공, 틀린 코드면 예전 비밀번호 유지, 확인 불일치, 가입하지 않은 이메일도 같은 안내), 단 `auth.test.ts` | 완료 | 실제 메일 경로는 사람 확인(인증 메일 하루 50통 한도) |
| FR-AUTH-06 회원 탈퇴 | docs/03 2.5 | `MePage.tsx`, `services/api/src/account.ts`·`cleanup.ts`·`orphans.ts` | 단 `api.test.ts`, E `progress.e2e.ts`, S smoke:progress(탈퇴·정리 후 0건), C check:aws | 완료 | |
| FR-AUTH-07 Google 로그인 | docs/03 2.4 | `cognito.ts`, `CallbackPage.tsx`, `AuthForm.tsx`, `auth-stack.ts` | E `google.e2e.ts` @google(가짜 구글), 인 `auth-stack.test.ts`, C check:aws, 사 구글 체크리스트(docs/03) | 완료 | 실제 구글 로그인은 자동화 불가(사람 확인) |
| FR-AUTH-08 탈퇴 재확인 | docs/03 2.5 | `account.ts` `reauthFresh()`, `cognito.ts` `verifyPassword`·`reauthWithGoogle` | 단 `api.test.ts`, E `google.e2e.ts`, S smoke:progress(5분 넘은 토큰 → 403) | 완료 | |
| FR-AUTH-09 개인정보처리방침 | docs/03 2.4 | `features/PrivacyPage.tsx`, `Layout.tsx` 푸터 | E `google.e2e.ts`(링크·문의처), E `a11y.e2e.ts`(/privacy) | 완료 | 내용과 실제 시스템의 일치는 사람 확인 |

## 5. 학습 진행(FR-PRG)

| ID | 설계 | 코드 | 테스트 | 상태 | 비고 |
| --- | --- | --- | --- | --- | --- |
| FR-PRG-01 완료 자동 기록 | docs/03 2.5, docs/05 완독 표시 | `TermPage.tsx`, `progress/store.ts`(`readAt()`), `StudyCard.tsx`·`Seal.tsx`(完 도장·날짜), `progress.ts` | 단 `api.test.ts`, E `progress.e2e.ts`(끝까지 보면 도장·날짜·화면 읽기 이름·찍히는 움직임), S smoke:progress | 완료 | "읽음" → "완독"(CH-53·54) |
| FR-PRG-02 완독 직접 변경 | docs/02 규칙, docs/05 완독 표시 | `StudyCard.tsx`([완독으로 표시]/[완독 취소]) | E `progress.e2e.ts`(read:false로 남김, aria-pressed 없음), E `auth.e2e.ts` | 완료 | CH-55 |
| FR-PRG-03 목록 상태 표시 | docs/05 완독 표시 | `Dictionary.tsx` `IndexColumns`(줄 끝 完 도장), `HomePage.tsx` | E `progress.e2e.ts`(도장·title·화면 읽기 "완독, 날짜") | 완료 | |
| FR-PRG-04 읽음 필터 | docs/05 | `summary.ts`, `HomePage.tsx` | 단 `summary.test.ts`, E `progress.e2e.ts` | 완료 | |
| FR-PRG-05 진행률 | docs/02 규칙, docs/05 완독 표시 | `summary.ts`, `Dictionary.tsx` `Ledger`("n / m 완독", 분야별 "n/m 완독") | 단 `summary.test.ts`, E `progress.e2e.ts`, S smoke:progress(다른 브라우저 같은 진행률 "1 / 14 완독") | 완료 | |
| FR-PRG-06 이어서 보기 | docs/03 2.5, docs/05 책갈피 | `activity.ts`, `progress/recent.ts`, `progress/bookmarks.ts` `bookmarkIds()`, `HomePage.tsx`, `MePage.tsx`, `DictionaryPage.tsx` | 단 `api.test.ts`·`recent.test.ts`·`bookmarks.test.ts`(완독 → 없음, 취소 → 없음, 다시 열기 → 책갈피), E `progress.e2e.ts` @activity(책갈피 규칙: 색인·내 단어장), S smoke:progress | 완료 | 책갈피 규칙 CH-54 |
| FR-PRG-07 비회원 기록 이전 | 없음 | 없음 | 없음 | **미구현(범위 제외)** | 이번 과제 범위에서 구현하지 않는 선택 기능. 이유는 9절 |
| FR-PRG-08 퀴즈 | 없음(설계 전) | 없음 | 없음 | **계획** | 단계 순서·막히는 단계·방어 고르기를 용어 JSON에서 자동 생성할 예정. 방어 이름이 용어끼리 구분되는지는 2차 용어 계획 때 함께 본다 |

## 6. 콘텐츠(FR-CNT)

| ID | 설계 | 코드 | 테스트 | 상태 | 비고 |
| --- | --- | --- | --- | --- | --- |
| FR-CNT-01 용어 = JSON 하나 | docs/04 | `content/terms/*.json`, `packages/content-schema/src/index.ts` | 단 `index.test.ts`, `validate-content.test.ts` | 완료 | |
| FR-CNT-02 스키마 검증 | docs/04 검증 규칙 | `index.ts` superRefine, `scene.ts` `checkScene`, `scripts/validate-content.ts` | 단 `index.test.ts`·`scene.test.ts`·`validate-content.test.ts`, verify(빌드 실패) | 완료 | |
| FR-CNT-03 인덱스 자동 생성 | docs/04 | `scripts/build-index.ts` | 단 `validate-content.test.ts`, S smoke:prod(index.json = published 목록) | 완료 | |
| FR-CNT-04 검수 상태 | docs/04 | `build-index.ts`(개발·배포 폴더 분리), Vite 설정 | S smoke:prod(published만), E `test:e2e:drafts` | 완료 | |
| FR-CNT-05 용어 ID 불변 | CLAUDE.md 원칙 7, docs/02 규칙, docs/04 검증 | `validate-content.ts` + `content/published-ids.json`, `summary.ts`(목록에 없는 용어 기록 제외) | 단 `validate-content.test.ts`(공개한 id의 파일이 없으면 오류, retired는 통과, 목록에 없는 published 오류), 단 `summary.test.ts` | 완료 | CH-45 |

## 7. 배포(FR-DEP)

| ID | 설계 | 코드 | 테스트 | 상태 | 비고 |
| --- | --- | --- | --- | --- | --- |
| FR-DEP-01 프론트엔드 호스팅 | docs/03 2.3 | `infra/lib/web-stack.ts` | 인 `web-stack.test.ts`, S smoke:prod, C check:aws | 완료 | |
| FR-DEP-02 SPA 라우팅 | docs/03 2.5(6단계) | `web-stack.ts` SPA 라우팅 함수 | 인 `web-stack.test.ts`, S smoke:prod, C check:aws | 완료 | docs/01을 구현(CloudFront Function, 없는 파일 404)에 맞춤(CH-26, CH-46) |
| FR-DEP-03 학습 진행 API | docs/03 2.5 | `infra/lib/api-stack.ts`, `services/api/src/handlers.ts` | 단 `api.test.ts`, 인 `api-stack.test.ts`, S smoke:progress(경로 전수), C check:aws | 완료 | |
| FR-DEP-04 보안 응답 헤더 | docs/03 2.4 | `web-stack.ts`, `infra/lib/csp.ts` | 인 `web-stack.test.ts`, S smoke:prod·smoke:auth(CSP 위반 없음), C check:aws | 완료 | |
| FR-DEP-05 자동 배포 | docs/03 2.6 | `.github/workflows/deploy.yml`, `scripts/ci-gate.ts`·`ci-gate-rules.ts`, `infra/lib/ci-stack.ts` | 단 `ci-gate-rules.test.ts`, 인 `ci-stack.test.ts`, CI 실행, C check:aws(CI 역할) | 완료 | docs/01을 관문 방식에 맞춤(CH-31, CH-46). CI의 첫 실제 배포는 DF-51로 실패한 뒤 CI 44896046840에서 성공(docs/10 4절) |

## 8. 비기능·설계 제약(NFR, DC)

| ID | 설계 | 코드 | 테스트 | 상태 | 비고 |
| --- | --- | --- | --- | --- | --- |
| NFR-01 보안 | docs/03 2.4~2.6 | API(액세스 토큰의 sub로만 대상, `accessSubject()`), Cognito, CSP, OIDC 역할(배포 job에만) | 단 `api.test.ts`, S smoke:progress(토큰 없음·변조·만료·ID 토큰 401, 다른 사용자 격리), C check:aws, 인 IAM 테스트 | 완료 | 알고 있는 한계 5개는 docs/03 2.4(DF-49 남은 위험 포함) |
| NFR-02 성능·가용성 | docs/03 1.2, docs/10 성능 기준 | 정적 콘텐츠, 기록 실패와 무관한 재생 | E `perf.e2e.ts` @perf(랜딩·색인·상세 LCP ≤ 2.5초, CLS ≤ 0.1), 검사 `check:bundle`(홈 묶음 gzip ≤ 120KB), S smoke:progress(기록 GET·PUT 각 10회 최대 ≤ 1초), E `progress.e2e.ts`(API 실패해도 재생 끝까지) | 완료 | LCP·CLS 기준 초과는 로컬 배포 전 전체 E2E에서만 실패(CI는 측정만), LCP는 로컬 빌드 기준(CDN 거리 제외), API 시간은 콜드 스타트 제외(docs/10) |
| NFR-03 사용성·접근성 | docs/05 | 동작 줄이기·자막·키보드, 3D 캔버스 글자 전용 토큰(`--scene-ink` 계열, DF-48) | E `a11y.e2e.ts`(axe 라이트·다크), E `player.e2e.ts`(스페이스·?no3d 2D 대체), E `scene-layout.e2e.ts`(동작 줄이기 결과 상태), E `viewport.e2e.ts` @narrow·@wide(360px·1920px: 랜딩·색인·상세 14개·로그인·가입·재설정·/me·/privacy 가로 스크롤·잘림 없음) | 완료 | 캔버스 글자 대비는 axe가 못 봐 토큰 값으로 계산(ecc:accessibility, 11-21 60개 조합 미달 0) |
| DC-01 프론트엔드 기술 | docs/06, CLAUDE.md 원칙 8 | R3F 장면, PlaybackEngine | S/검사 `check:bundle`(홈 묶음에 three 없음) | 완료 | |
| DC-02 인프라·백엔드 | docs/03 2.2~2.3 | `infra/lib/*.ts` | 인 테스트 4개, C check:aws | 완료 | |
| DC-03 콘텐츠 제작 방식 | docs/04, CLAUDE.md 원칙 1 | 용어 JSON + 플레이어 3종 | 단 `simulate.test.ts`(모든 용어×모드가 데이터만으로 끝까지) | 완료 | 콘텐츠 1차(11-21): 플레이어 3종에 일반 어휘만 더하고 용어 6개를 JSON으로 추가(CH-48) |

## 9. 따로 모은 항목

**계획(아직 구현하지 않음)**
- FR-PRG-08 퀴즈(선택). 용어 2차 묶음 계획과 함께 문제 생성 규칙을 정한 뒤 설계한다.

**미구현(이번 과제 범위 제외)**
- FR-PRG-07 비회원 기록 이전(선택). 구현하지 않는 이유:
  - 전제가 되는 "비회원 읽음 기록의 브라우저 저장"이 지금 없다. 비회원은 끝까지 보면 로그인 안내만 받는다(FR-PRG-01). 이전 기능을 넣으려면 그 저장부터 새로 만들어야 한다.
  - 옮길 때 서버 기록과 부딪히는 경우(서버에는 직접 "안 읽음", 브라우저에는 "읽음")의 규칙과 여러 건을 한 번에 쓰는 API가 더 필요해, 선택 요구사항에 비해 범위가 크다.
  - 핵심 가치(시각화)와 필수 요구사항을 먼저 끝내기로 한 범위 결정(docs/01 7절 "범위 위험")을 따른다.

**테스트 없음**
- 없음(11-21 보강: FR-EXP-04, FR-DTL-04에 E2E 추가)

**부분 테스트**(자동 테스트가 일부만 확인)
- 없음
- 11-21 보강으로 완료가 된 것: FR-EXP-01·02·03, FR-DTL-01·03, FR-AUTH-05(실제 메일은 계속 사람 확인), FR-CNT-05, NFR-02(기록 API 1초는 3차), NFR-03(1920px는 3차)

**문서와 다름**
- 없음(11-21 docs/01을 구현에 맞춤: FR-ANI-08, FR-DEP-02, FR-DEP-05, CH-46)
