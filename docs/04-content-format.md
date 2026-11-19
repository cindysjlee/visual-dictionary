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
      { "action": "send", "from": "user", "to": "bank", "title": "정상 로그인", "label": "POST /login",
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
| `steps[].title` | O | 단계 이름(예: "위조된 송금 요청"). 자막 위 제목, 홈의 단계 목록에 쓴다 |
| `steps[].label` | O | 화살표 위에 표시되는 짧은 문구 |
| `steps[].caption` | O | 자막. 애니메이션을 안 봐도 이해되게 쓴다 |
| `steps[].danger` | | 위험 단계 강조. 기본값 `false` |
| `defenses` | | 보안 용어는 1개 이상 권장. CS 용어는 `kind: "solution"` 또는 빈 배열 |
| `defenses[].kind` | O | `defense`(보안 방어 기법: 차단 단계에서 **멈춘다**) 또는 `solution`(CS 해결 방법: 갈림 단계부터 **대체 흐름으로 끝까지** 재생한다). 아래 "방어 모드 동작"·"해결 방법 동작" |
| `defenses[].blockedAtStep` | | `defense`만. 1부터 시작하는 단계 번호. `steps` 길이 이하. 없으면 보조 방어: 모드 선택에는 나오지 않고 방어 방법 카드에만 설명이 보이며, 목록 카드에서는 "방어 1 · 보조 1"처럼 따로 센다 |
| `defenses[].blockedLabel`, `blockedCaption` | | `blockedAtStep`이 있으면 필수 |
| `defenses[].branchAtStep`, `steps` | | `solution`만, 둘은 함께 쓴다. `branchAtStep`(1부터, 기본 `steps` 길이 이하)부터 원래 단계 대신 이 `steps`(대체 흐름, `scenario.steps`와 같은 형식)를 끝까지 재생한다. 없으면 설명만 있는 보조 해결 방법 |
| `references` | O | 1개 이상 |
| `related` | | 다른 용어의 `id`. 존재하지 않는 id면 빌드 경고 |

## 플레이어 유형별 action

| playerType | 허용 action | from → to의 뜻 | 화면 표현 |
| --- | --- | --- | --- |
| `flow` | `send` | 보내는 쪽 → 받는 쪽 | 행위자 사이를 메시지가 화살표를 따라 이동 |
| `stack` | `push`, `pop`, `run` | push: 호출한 함수 → 호출된 함수(첫 push는 `from` = `to`로 진입점) / pop: 끝난 함수 → 돌아갈 함수 / run: 맨 위 함수가 제자리에서 실행(`from` = `to`) | 스택에 프레임이 쌓이고 빠짐, `label`은 호출식·반환값 |
| `lock` | `acquire`, `wait`, `release` | 스레드 → 자원 | acquire: 손에 듦·자물쇠 잠김 / wait: 대기선에 섬 / release: 내려놓음 |

권장 `role` 값: `user`, `attacker`, `server`, `database`(flow) / `function`(stack) / `process`, `resource`(lock). `kind`가 없으면 `role`로 정한다(`process` → `thread`, `resource` → `resource`).

## 스택형 필드와 효과 (`playerType: "stack"`)

- `scenario.code: { title?, lines[] }`: 코드 판(C·Java 문법에 가까운 의사코드 하나로 통일). `steps[].line`: 이 단계 뒤 맨 위 프레임이 실행 중인 줄(1부터). push할 때 호출한 쪽의 줄이 새 프레임의 **반환 주소**(돌아갈 곳)가 된다.
- 효과: `locals { target?, vars: [{ name, value }] }`(맨 위 프레임, 또는 `target` 함수의 맨 위 프레임 서랍의 지역 변수 칸을 정하거나 바꿈), `returnValue { value, into? }`(pop 단계에서 반환값이 호출한 프레임의 칸 `into`로 전달됨).
- 검증: push는 맨 위 함수가 부르고, pop은 맨 위 함수가 바로 아래 함수로 돌아가며, run은 맨 위 함수만. `returnValue`는 pop 단계에만. `line`은 코드 판 줄 수 이하.

## 점유형 필드와 효과 (`playerType: "lock"`)

- 행위자: 스레드(`kind: "thread"`), 자원(`kind: "resource"`, look `printer`·`scanner`).
- 효과: `condition { name }`(데드락 네 조건 `mutual-exclusion`·`hold-and-wait`·`no-preemption`·`circular-wait` 중 하나를 "교착 조건" 패널에 켬), `take { from, refused?, reason? }`(다른 스레드가 쥔 자원을 빼앗으려 함. 비선점이면 `refused`), `cycle`(대기 관계가 고리를 이룸: 바닥 고리, 위에서 보는 샷), `timeout`(기다리다 포기: 모래시계가 다 됨. 보통 `release`와 함께), `stamp { label, tone }`(도장. 예: 교착).
- 검증: acquire는 아무도 안 쥔 자원, wait는 다른 스레드가 쥔 자원, release는 자기가 쥔 자원. 기본 흐름·해결 방법마다 단계를 따라가며 확인한다.

## 방어 모드 동작

1. `blockedAtStep` 이전 단계는 그대로 재생한다.
2. `blockedAtStep` 단계에서 원래 `label` 대신 `blockedLabel`을, 원래 `caption` 대신 `blockedCaption`을 보여주고 차단 연출을 한다.
3. 그 뒤 단계는 재생하지 않는다. 공격이 거기서 끝났다는 뜻이다.
   - 차단 도장 위치(3D): 차단 단계에 `inspect`가 있으면 검문소에서 봉투를 열어 검사하고 실패하면 거기서 도장을 찍고 봉투가 튕겨 나간다. `inspect`가 없으면 단계를 끝까지 보여 준 뒤, 거부된 효과(`refused: true`)의 대상(`run` → 실행하려던 탭, `attach` → 꺼내려던 곳, `give` → 받으려던 쪽)에, 그것도 없으면 목적지에 도장을 찍는다. "도착은 했지만 실행·읽기·엿보기가 막혔다"를 이렇게 표현한다.
4. 방어가 여러 개면 화면에서 하나를 골라 켠다. 기본값은 첫 번째.

## 해결 방법 동작 (`kind: "solution"`, CS 용어)

1. `branchAtStep` 이전 단계는 기본 흐름 그대로 재생한다(`overrides`로 제목·자막을 바꿀 수 있고, 갈림 단계 앞까지만).
2. `branchAtStep` 단계부터는 원래 단계 대신 `steps`(대체 흐름)를 끝까지 재생한다. 멈추지 않는다. 예: 자원 획득 순서 고정이면 "B가 빈손으로 대기 → A가 작업 후 반납 → B 진행 → 둘 다 완료".
3. 진행 막대·단계 수는 대체 흐름 길이를 따른다(갈림 단계 앞 단계 수 + `steps` 길이). "끝까지 봄"(읽음 처리)은 보안 용어와 같이 기본 흐름을 끝까지 봤을 때만 센다.
4. 탭 이름: 모드가 모두 해결 방법이면 "기본 흐름 / 해결 방법", 아니면 "공격 흐름 / 방어 모드". 고를 모드(차단 단계나 대체 흐름이 있는 방어·해결 방법)가 없으면 탭을 숨긴다.

## 3D 장면 필드 (흐름형, 모두 선택)

3D 플레이어(`docs/06`)는 아래 필드를 읽어 장면을 만든다. 좌표는 쓰지 않는다. 필드가 없으면 기본값으로 그리고, 2D 대체 화면은 기존 필드만 쓴다. 전체 예시는 `content/terms/csrf.json`.

**행위자 (`scenario.actors[]`)**

| 필드 | 값 | 뜻 |
| --- | --- | --- |
| `kind` | `browser` `tab` `cookieJar` `server` `database` `network` `attacker` `person` | 모양. 없으면 `role`에서 정함(user→person, server→server, database→database, attacker→attacker) |
| `look` | `bank` `web` `shop` `community` `cloud-metadata`(server) / `database`(server·database) / `wifi`(network) | 생김새. 없으면 `kind`의 기본 모양. kind에 맞지 않으면 빌드 실패. 건물형(`bank` `web` `shop` `community`)의 간판과 `cloud-metadata`의 주소판에는 `site`가 글자로 들어간다. 모양 설명은 `docs/06` 2절 "생김새" |
| `zone` | `client`(앞, 사용자 쪽) `between`(사용자와 서버 사이 길목: 공용 와이파이·라우터) `server`(인터넷 너머 뒤) `internal`(서버 뒤 사내망) `outside`(옆, 공격자 쪽) | 자동 배치 구역. 없으면 `parent`를 따르고, 그것도 없으면 `role`에서 정함. `between`이 있으면 서버·사내망 줄이 그만큼 뒤로 물러난다. 서버·사내망·길목 줄에 하나뿐이면 겹치지 않게 좌우로 비켜 선다(서버 왼쪽, 사내망 오른쪽, 길목은 공격자 쪽). 인터넷 점선은 사용자 쪽 → 길목 → 서버, 사용자 쪽 → 공격자로 긋고, 사내망은 서버 구역에서만 이어진다(밖에서 바로 닿지 않음) |
| `parent` | 행위자 id | 그 안에 들어감(예: 탭·쿠키 보관함 → 브라우저) |
| `site` | 문자열 | 이름 옆에 작게 쓰는 주소(예: `bank.example`) |
| `tone` | `attack` `neutral` | 공격 쪽 물체 표시 |
| `gate` | `true` | 서버 앞(사용자 쪽) 검문소. 더 깊은 구역(사내망 등)에서 오는 봉투는 검문소를 지나지 않는다 |
| `balance` | 정수 | 잔액 라벨. `transfer`(coin)로 바뀜 |
| `screen` / `back` | `{ title?, lines[] }` | 화면판의 앞면 / 뒤집으면 보이는 뒷면 글자. 탭은 항상 화면판이 있고, `server`·`database`는 `screen`이 있을 때 옆에 화면판이 선다(만들어진 쿼리, 미리보기 결과처럼 서버 안에서 일어나는 일) |

**단계 (`scenario.steps[]`)**: `effects[]`(아래 어휘), `roundTrip`(왕복), `returnLabel`(돌아올 때 라벨), `via`(거쳐 가는 행위자. 봉투가 먼저 들렀다 가고, `give`(from `"packet"`)은 그 자리에서 빠져나간다), `camera: { focus: 행위자 id | "all", distance?: near|mid|far }`(자동 카메라를 덮어쓸 때만). `from`과 `to`가 같으면 제자리 단계다(예: 탭 안에서 스크립트 실행): 봉투가 날지 않고 그 자리에서 효과만 보여 준다.

**효과 어휘 (`effects[]`)**. 물건(`item`)은 `cookie` `token` `script` `data` `coin`. 보관된 물건은 꺼내도 보관한 곳에 남는다(복사).

| type | 필드 | 뜻 |
| --- | --- | --- |
| `appear` | target | 이 단계에 나타남. 그 전에는 숨김 |
| `flip` | target | 패널을 뒤집어 `back`을 보여 줌 |
| `rewrite` | target, side?(front·back), screen | 화면 글자를 바꿈. 카메라가 그 화면판으로 다가간다 |
| `store` | item, into, label? | 봉투에 실려 온 물건을 보관함·서버 등에 넣음 |
| `attach` | item, from, label?, note?, refused?, reason? | 보관된 물건을 지금 봉투에 붙임. 붙으면 봉투 라벨이 `label + " + " + 붙인 label`이 됨. `note`는 붙일 때 보여 줄 설명(없으면 "목적지 … 자동 첨부", 브라우저가 쿠키를 자동으로 붙이는 경우). `refused`면 붙지 않고 라벨도 그대로 |
| `give` | item, from(행위자 또는 `"packet"`), to, label?, refused?, reason? | 봉투와 따로 물건이 날아감(토큰 발급, 가로채기) |
| `run` | item, target(tab), refused?, reason? | 스크립트 등이 그 탭에서 실행됨 |
| `inspect` | at, contents[], checks[{name, result, status: ok·skip·fail}] | 검문소에서 봉투를 열어 검사. `at`은 이 단계의 목적지이고, 목적지에 `gate: true`가 있어야 한다 |
| `transfer` | item(coin·data), from, to, amount?, label? | 돈·데이터 묶음이 넘어감 |

**방어 (`defenses[]`)**: `blockedTitle`(차단 단계 제목), `blockedLabel`(차단 도장과 2D 대체 화면의 차단 표시 글자, 예: `"403 · 토큰 없음"`), `overrides: [{ step, title?, caption?, effects? }]`(방어 모드에서 그 단계의 제목·자막·효과를 대신함).

**검증기가 추가로 잡는 오류**: 없는 행위자를 가리키는 `parent`·`via`·`camera.focus`·효과 대상, `parent` 순환, `back`이 없는데 `flip`, 화면판이 없는 곳에 `rewrite`·`flip`, `inspect.at`이 목적지가 아니거나 목적지에 검문소가 없음, `run` 대상이 tab이 아님, `override.step`이 범위 밖이거나 중복, 그 시점에 없는 물건을 `attach`하거나 봉투에 없는 물건을 `give`(공격 흐름과 방어별로 각각 단계를 따라가며 확인), 플레이어 유형에 없는 효과(흐름형·스택형·점유형 어휘는 각 절).

## 카테고리

| 값 | 표시 이름 |
| --- | --- |
| `web-security` | 웹 보안 |
| `network` | 네트워크 |
| `os` | 운영체제 |
| `runtime` | 자료구조·런타임 |

## 빌드 산출물

`scripts/build-index`가 `status: "published"`인 파일만 모아 `apps/web/generated/build/content/`에 만든다. 배포 주소에서는 `/content/...`로 제공된다. 화면 경로 `/terms/:id`와 겹치지 않게 하려고 `/content/` 아래에 둔다.

- `/content/index.json`: 목록·검색·진행률 계산용. 용어마다 `id`, `name`, `englishName`, `aliases`, `category`, `summary`, `playerType`, `stepCount`(단계 수), `defenseCount`(차단 단계가 있는 방어 수), `supportCount`(차단 단계 없는 보조 방어 수)만 담는다. 뒤의 셋은 목록 카드의 "흐름형 · 6단계 · 방어 2개"(보조가 있으면 "방어 1 · 보조 1") 표시용이다.
- `/content/terms/<id>.json`: 상세 페이지용. 스키마 검증을 거쳐 기본값(`aliases: []`, `danger: false` 등)을 채운 결과.

개발 서버(`npm run dev`)용은 `draft`까지 포함해 `apps/web/generated/dev/content/`에 따로 만든다. `vite.config.ts`는 `vite build`일 때 `generated/build`만 publicDir로 쓰므로, `npx vite build`를 직접 실행해도 draft가 배포 결과물에 들어갈 수 없다. `retired`는 어느 쪽에도 포함하지 않는다.

권장 규칙(단계 수 2~10개, 보안 용어는 `defenses` 1개 이상, `related`의 id 존재)은 어겨도 빌드를 멈추지 않고 경고만 출력한다.

## 검증기가 잡아야 하는 오류

- 스키마 위반(필수 필드 누락, 허용되지 않은 값)
- 파일명과 `id` 불일치, 중복 `id`
- `actors`에 없는 `from`/`to`
- `playerType`에 맞지 않는 `action` (예: flow인데 push)
- `blockedAtStep`이 단계 수를 넘음, `blockedAtStep`이 있는데 `blockedLabel`/`blockedCaption` 없음
- 방어(`defense`)에 `branchAtStep`·`steps`, 해결 방법(`solution`)에 `blockedAtStep`, `branchAtStep`과 `steps` 중 하나만 있음, 갈림 단계 이후의 `overrides`
- 스택형 push·pop·run 순서, 점유형 acquire·wait·release 상태(위 각 절)

오류가 있으면 파일명과 위치(예: `csrf.json: scenario.steps[4].to`)를 출력하고 빌드를 실패시킨다.

## AI로 용어 데이터를 만들 때

이 문서와 `docs/examples/`의 예시 하나를 함께 주고 "이 형식으로 SQL 인젝션 JSON을 써줘"처럼 요청한다. 결과는 `status: "draft"`로 넣고, 사람이 흐름·자막·출처를 검수한 뒤 `published`로 바꾼다.
