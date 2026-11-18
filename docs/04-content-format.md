# 용어 데이터 형식

용어 하나는 `content/terms/<id>.json` 파일 하나다. 플레이어는 이 파일의 `scenario`를 읽어 애니메이션을 그린다.
용어를 추가할 때 화면 코드는 고치지 않는다. 형식은 `packages/content-schema`의 Zod 스키마 하나로 정의하고, 빌드 검증기와 프론트엔드가 같은 스키마를 쓴다.

## 전체 구조

```jsonc
{
  "id": "csrf",                          // 소문자·숫자·하이픈. 파일명과 같아야 함. 배포 후 변경 금지
  "name": "CSRF",                        // 화면 표시 이름
  "englishName": "Cross-Site Request Forgery",
  "aliases": ["사이트 간 요청 위조"],     // 검색 대상
  "category": "web-security",            // 아래 카테고리 표 참고
  "summary": "한 줄 요약",                // 카드·검색 대상
  "description": "개념 설명 (2~4문장)",
  "status": "published",                 // draft | published | retired
  "scenario": {
    "playerType": "flow",                // flow | stack | lock
    "actors": [ { "id": "user", "name": "사용자", "role": "user" } ],
    "steps": [
      { "action": "send", "from": "user", "to": "bank", "label": "POST /login",
        "caption": "자막 한두 문장", "danger": false }
    ]
  },
  "defenses": [
    { "name": "CSRF 토큰", "kind": "defense", "description": "설명",
      "blockedAtStep": 5, "blockedLabel": "토큰 없음 → 거부", "blockedCaption": "방어 모드 자막" }
  ],
  "references": [ { "title": "OWASP CSRF Prevention Cheat Sheet", "url": "https://..." } ],
  "related": ["xss", "session-hijacking"]
}
```

## 필드 규칙

| 필드 | 필수 | 규칙 |
| --- | --- | --- |
| `id` | O | `^[a-z0-9]+(-[a-z0-9]+)*$`, 파일명과 일치, 전체에서 유일 |
| `name`, `summary`, `description` | O | 빈 문자열 금지 |
| `englishName`, `aliases` | | 검색 대상. `aliases` 기본값 `[]` |
| `category` | O | 카테고리 표의 값 |
| `status` | O | `draft`는 빌드에서 제외, `published`만 배포, `retired`는 배포 제외하되 ID 재사용 방지용으로 파일 유지 |
| `scenario.playerType` | O | `flow`, `stack`, `lock` |
| `scenario.actors` | O | 1개 이상. `id`는 시나리오 안에서 유일 |
| `scenario.steps` | O | 2~10개 권장. 순서대로 재생 |
| `steps[].action` | O | `playerType`별 허용 값만 (아래 표) |
| `steps[].from`, `steps[].to` | O | `actors`에 있는 `id`만 |
| `steps[].label` | O | 화살표 위에 표시되는 짧은 문구 |
| `steps[].caption` | O | 자막. 애니메이션을 안 봐도 이해되게 쓴다 |
| `steps[].danger` | | 위험 단계 강조. 기본값 `false` |
| `defenses` | | 보안 용어는 1개 이상 권장. CS 용어는 `kind: "solution"` 또는 빈 배열 |
| `defenses[].kind` | O | `defense`(보안 방어 기법) 또는 `solution`(CS 해결 방법) |
| `defenses[].blockedAtStep` | | 1부터 시작하는 단계 번호. `steps` 길이 이하. 없으면 방어 모드 연출 없이 설명만 표시 |
| `defenses[].blockedLabel`, `blockedCaption` | | `blockedAtStep`이 있으면 필수 |
| `references` | O | 1개 이상 |
| `related` | | 다른 용어의 `id`. 존재하지 않는 id면 빌드 경고 |

## 플레이어 유형별 action

| playerType | 허용 action | from → to의 뜻 | 화면 표현 |
| --- | --- | --- | --- |
| `flow` | `send` | 보내는 쪽 → 받는 쪽 | 행위자 사이를 메시지가 화살표를 따라 이동 |
| `stack` | `push`, `pop` | push: 호출한 함수 → 호출된 함수 / pop: 끝난 함수 → 돌아갈 함수 | 스택에 블록이 쌓이고 빠짐, `label`은 호출식·반환값 |
| `lock` | `acquire`, `wait`, `release` | 프로세스 → 자원 | acquire: 자원에 소유 표시 / wait: 대기선 / release: 소유 해제 |

권장 `role` 값: `user`, `attacker`, `server`, `database`(flow) / `function`(stack) / `process`, `resource`(lock). 플레이어는 `role`로 아이콘과 색을 고른다.

## 방어 모드 동작

1. `blockedAtStep` 이전 단계는 그대로 재생한다.
2. `blockedAtStep` 단계에서 원래 `label` 대신 `blockedLabel`을, 원래 `caption` 대신 `blockedCaption`을 보여주고 차단 연출을 한다.
3. 그 뒤 단계는 재생하지 않는다. 공격이 거기서 끝났다는 뜻이다.
4. 방어가 여러 개면 화면에서 하나를 골라 켠다. 기본값은 첫 번째.

## 카테고리

| 값 | 표시 이름 |
| --- | --- |
| `web-security` | 웹 보안 |
| `network` | 네트워크 |
| `os` | 운영체제 |
| `runtime` | 자료구조·런타임 |

## 빌드 산출물

`scripts/build-index`가 `status: "published"`인 파일만 모아 `apps/web/generated/build/content/`에 만든다. 배포 주소에서는 `/content/...`로 제공된다. 화면 경로 `/terms/:id`와 겹치지 않게 하려고 `/content/` 아래에 둔다.

- `/content/index.json`: 목록·검색·진행률 계산용. 용어마다 `id`, `name`, `englishName`, `aliases`, `category`, `summary`, `playerType`만 담는다.
- `/content/terms/<id>.json`: 상세 페이지용. 스키마 검증을 거쳐 기본값(`aliases: []`, `danger: false` 등)을 채운 결과.

개발 서버(`npm run dev`)용은 `draft`까지 포함해 `apps/web/generated/dev/content/`에 따로 만든다. `vite.config.ts`는 `vite build`일 때 `generated/build`만 publicDir로 쓰므로, `npx vite build`를 직접 실행해도 draft가 배포 결과물에 들어갈 수 없다. `retired`는 어느 쪽에도 포함하지 않는다.

권장 규칙(단계 수 2~10개, 보안 용어는 `defenses` 1개 이상, `related`의 id 존재)은 어겨도 빌드를 멈추지 않고 경고만 출력한다.

## 검증기가 잡아야 하는 오류

- 스키마 위반(필수 필드 누락, 허용되지 않은 값)
- 파일명과 `id` 불일치, 중복 `id`
- `actors`에 없는 `from`/`to`
- `playerType`에 맞지 않는 `action` (예: flow인데 push)
- `blockedAtStep`이 단계 수를 넘음, `blockedAtStep`이 있는데 `blockedLabel`/`blockedCaption` 없음

오류가 있으면 파일명과 위치(예: `csrf.json: scenario.steps[4].to`)를 출력하고 빌드를 실패시킨다.

## AI로 용어 데이터를 만들 때

이 문서와 `docs/examples/`의 예시 하나를 함께 주고 "이 형식으로 SQL 인젝션 JSON을 써줘"처럼 요청한다. 결과는 `status: "draft"`로 넣고, 사람이 흐름·자막·출처를 검수한 뒤 `published`로 바꾼다.
