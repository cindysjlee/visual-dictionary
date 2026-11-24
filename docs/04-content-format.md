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
  "description": { "definition": "...", "analogy": ["..."], "how": ["...", "..."], "why": ["..."] },  // 설명 틀(아래 "설명 틀과 각주")
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
| `name`, `summary`, `description` | O | 빈 문자열 금지. `description`은 설명 틀 객체(문자열 한 문단의 이전 형식은 없앴다. 초안 자리 표시 `"(설명 준비 중)"`만 draft에서 문자열로 허용) |
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

### 본문 표시 (`description`, `defenses[].description`)

뜻풀이와 방어(해결) 설명에만 가벼운 표시 문법을 쓴다. 화면은 HTML로 넣지 않고 파서(`packages/content-schema/src/marks.ts`의 `parseMarks`)가 나눈 조각을 React 요소로 그린다(XSS 없음).

| 표시 | 뜻 | 화면 |
| --- | --- | --- |
| `==문장==` | 핵심 문장 | 형광펜 밑줄. 화면에 들어오면 한 번 그어진다(동작 줄이기면 처음부터 그어짐) |
| `` `코드` `` | 명령·헤더·주소·함수·설정 이름 | 고정폭 코드 표기. 긴 영문·주소는 이 안에서만 끊긴다 |

- 형광펜은 문단(필드 하나)마다 **최대 한 군데**, 핵심 문장에만. 형광펜 안에 코드 표기는 넣지 않는다.
- 코드 표기 안의 글자는 그대로다(`a==b`도 형광펜으로 읽지 않는다).
- 검증 실패: 짝이 안 맞는 `==`·`` ` ``, 빈 표시(`====`, ``` `` ```), HTML 태그(`<b>`, `<script>` 등), `**`·`__`·`[..](..)` 같은 다른 문법, 한 문단에 형광펜 두 군데 이상.
- 비교·검색은 표시를 뺀 글자(`plainText`)로 한다.

### 설명 틀과 각주 (`description` 객체, 2026-11-24)

처음 온 사람이 한 문단만으로 개념을 잡기는 어렵고, 낯선 단어를 풀 곳도 없어서 `description`을 부분으로 나눈다. 부분 이름이 고정이라 화면 제목이 같고, 필드가 나뉘어 있어 검증과 다른 곳(퀴즈 등)에서 다시 쓸 수 있다. 모든 용어(21개)가 이 틀이다. 문자열 한 문단(이전 형식)은 12개를 모두 옮긴 뒤 없앴고(CH-62), 초안 자리 표시만 draft에서 문자열로 허용한다.

```jsonc
"description": {
  "definition": "공격자가 서버를 시켜 [[내부 주소]]로 대신 요청을 보내게 하는 공격이다.",  // 한 줄 정의
  "analogy": ["쉬운 비유 문단 1~3개"],
  "how": ["어떻게 일어나나 문단 2~4개"],
  "why": ["왜 위험한가(CS 용어는 왜 중요한가) 문단 1~3개"]
}
```

| 규칙 | 내용 | 어기면 |
| --- | --- | --- |
| 구조 | 네 필드가 모두 있고 다른 필드는 없다. 문단 수는 위 범위 | 오류 |
| 한 줄 정의 | 한 문장, 표시를 뺀 글자 90자 이하(`DEFINITION_MAX`) | 오류 |
| 문장 길이 | 70자(`SENTENCE_WARN`)를 넘는 문장은 나눈다 | 경고 |
| 표시 | `==형광펜==`·`` `코드` ``는 본문 표시 문법과 같다. 형광펜은 문단당 최대 한 곳 | 오류 |
| 각주 `[[단어]]` | 설명 틀 안에서만 쓴다(방어 설명·이전 형식 문자열에는 못 쓴다). 용어 하나에 서로 다른 단어 4개까지(`NOTES_MAX`), 같은 단어를 두 번 쓰지 않는다 | 오류 |
| 부분 이름 | 한 줄 정의 · 쉬운 비유 · 어떻게 일어나나 · 왜 위험한가. 웹 보안 분야이거나 방어(`kind: defense`)가 있으면 "왜 위험한가", 아니면 "왜 중요한가"(`partLabel()`) | 자동 |
| 초안 자리 | `"(설명 준비 중)"`(`DRAFT_DESCRIPTION`) 문자열은 `status: draft`에서만. 다른 문자열(이전 형식)은 draft에서도 쓸 수 없다 | 오류 |
| 비유의 한계(관례) | 쉬운 비유의 마지막 문단에 "비유와 실제가 다른 점"을 쓴다(모든 용어). 검증기는 보지 않는다 | 검수 |

**풀이 사전 `content/glossary.json`.** 각주 단어의 풀이를 한 곳에 둔다: `[{ "word", "gloss", "term"? }]`. `word`는 20자 이하(`[ ] ` =`와 줄바꿈 금지), `gloss`는 120자 이하·두 문장 이하, 본문 표시는 `` `코드` ``만 쓴다. `term`은 이 단어가 공개된 용어와 같은 말일 때 그 용어의 `id`를 적는다(화면은 풀이 상자 대신 그 용어로 가는 링크).
- 오류: 본문에 있는데 사전에 없는 단어, 어떤 용어에도 쓰이지 않는 항목, 없는 용어 `id`를 가리키는 `term`, 용어가 자기 자신을 가리키는 `term`, 같은 `word` 중복.
- 빌드(`build-index.ts` `withFootnotes()`)는 각 `terms/<id>.json`에 `footnotes: [{ word, gloss, link? }]`를 본문에 나온 순서대로 풀어 넣는다. 화면은 사전 파일을 따로 받지 않는다. `link`는 가리키는 용어가 그 빌드의 결과물(개발용은 draft 포함, 배포용은 published만)에 있을 때만 붙는다.

### 새 어휘가 필요해 데이터로 나타내지 못한 것 (2차 초안 7개를 쓰며 확인)

새 어휘는 사용자와 먼저 상의한다. 아래는 지금 어휘로는 화면에서 표현하지 못해 자막과 화면판 글자로 대신한 것이다.

| 필요한 표현 | 걸린 용어 | 지금의 대체 |
| --- | --- | --- |
| 우선순위·선점, 준비/대기 상태 | 우선순위 역전, 컨텍스트 스위칭, 페이지 폴트 | 화면판 글자("준비 (CPU 차례 기다림)", "잠듦(디스크 대기)")와 자막 |
| 프로세스 상태 배지, CPU 토큰 | 컨텍스트 스위칭, 페이지 폴트 | 화면판 글자 |
| 암호화 표시, 공유 키 표시 | TLS 핸드셰이크 | 라벨의 `[암호화]` 글자. `store` 효과는 화면판 라벨이 같은 자리를 덮어 키가 보이지 않아 쓰지 않음 |
| 목적지가 아닌 쪽의 검사(브라우저가 인증서를 확인) | TLS 핸드셰이크 | 클라이언트 화면판 글자 |
| 브로드캐스트(모두에게 퍼뜨림) | ARP 스푸핑 1단계 | 게이트웨이로 가는 화살표 하나. 자막이 "모두에게"라고 설명 |
| 유선 스위치 모양 | ARP 스푸핑 | `kind: server`, `look: web`(검문소 `gate: true`) |
| 다른 결말로 갈라지는 분기(SIGSEGV) | 페이지 폴트 | 자막 한 문장 |
| 되감기 중 반환 주소 태그 숨기기 | 예외 전파 | 자막 |

페이지 폴트는 RAM과 디스크를 `internal` 구역 한 줄에 둔다(RAM을 서버·사이·클라이언트 구역에 두면 디스크와 34% 겹치거나 MMU를 가렸다). 그래도 몇 단계에서 RAM 이름표가 커널 모형 위에 놓인다.
## 플레이어 유형별 action

| playerType | 허용 action | from → to의 뜻 | 화면 표현 |
| --- | --- | --- | --- |
| `flow` | `send` | 보내는 쪽 → 받는 쪽 | 행위자 사이를 메시지가 화살표를 따라 이동 |
| `stack` | `push`, `pop`, `run` | push: 호출한 함수 → 호출된 함수(첫 push는 `from` = `to`로 진입점) / pop: 끝난 함수 → 돌아갈 함수 / run: 맨 위 함수가 제자리에서 실행(`from` = `to`) | 스택에 프레임이 쌓이고 빠짐, `label`은 호출식·반환값 |
| `lock` | `acquire`, `wait`, `release`, `access` | 스레드 → 자원 | acquire: 손에 듦·자물쇠 잠김 / wait: 대기선에 섬 / release: 내려놓음 / access: 락 없이 자원의 값을 읽거나 씀(자물쇠는 그대로, 공유 값 `read`·`write`와 함께) |

권장 `role` 값: `user`, `attacker`, `server`, `database`(flow) / `function`(stack) / `process`, `resource`(lock). `kind`가 없으면 `role`로 정한다(`process` → `thread`, `resource` → `resource`).

## 스택형 필드와 효과 (`playerType: "stack"`)

- `scenario.code: { title?, lines[] }`: 코드 판(C·Java 문법에 가까운 의사코드 하나로 통일. 예외: 예외 전파(`exception-propagation`)는 파이썬 traceback을 설명하므로 제목에 "Python"을 적은 파이썬 코드 판을 쓴다). `steps[].line`: 이 단계 뒤 맨 위 프레임이 실행 중인 줄(1부터). push할 때 호출한 쪽의 줄이 새 프레임의 **반환 주소**(돌아갈 곳)가 된다.
- 효과: `locals { target?, vars: [{ name, value }] }`(맨 위 프레임, 또는 `target` 함수의 맨 위 프레임 서랍의 지역 변수 칸을 정하거나 바꿈), `returnValue { value, into? }`(pop 단계에서 반환값이 호출한 프레임의 칸 `into`로 전달됨).
- `scenario.stackLimit`(1~12): 유리 기둥 그 높이에 "스택 한도" 선을 긋는다(프레임 칸 수). 효과 `overflow`: 한도를 넘는 push에 붙이면 그 프레임이 선 위로 솟아 공격색이 되고 선이 깜빡인다. `stamp { label, tone }`(도장)도 스택형에서 쓸 수 있다(예: `StackOverflowError`).
- `defenses[].code`(해결 방법만): 이 모드에서는 처음부터 코드 판이 이 코드(고친 코드)다. 고친 프로그램을 처음부터 실행하는 것이므로, 갈림 단계 앞 단계의 자막이 원래 코드를 설명하면 `overrides`로 자막을 따로 쓴다. 모든 `line`이 두 코드에서 같은 줄을 가리키도록 줄 번호를 맞춰 두는 것이 좋다. 판 높이는 가장 긴 코드에 맞춘다.
- 검증: push는 맨 위 함수가 부르고, pop은 맨 위 함수가 바로 아래 함수로 돌아가며, run은 맨 위 함수만. `returnValue`는 pop 단계에만. `line`은 그 단계에 보이는 코드 판 줄 수 이하. 한도를 넘는 push에는 `overflow`가 있어야 하고, `overflow`는 한도를 넘는 push에만, 그 모드의 마지막 단계에만(프로그램이 멈춤) 쓴다. `stackLimit`은 스택형에만, `defenses[].code`는 스택형 해결 방법(대체 흐름 있음)에만.

## 점유형 필드와 효과 (`playerType: "lock"`)

- 행위자: 스레드(`kind: "thread"`), 자원(`kind: "resource"`, look `printer`·`scanner`·`memory`). 자원에 `value`(공유 값, 예: `"100"`)를 두면 값판에 보인다.
- 공유 값 효과(access 단계에만): `read { value }`(자원의 값을 읽어 스레드 손의 메모 카드에 적음), `write { value, note? }`(카드의 값을 자원에 씀, `note`는 계산식 예: `100 + 50`). 내려놓으면(release) 메모를 치운다.
- 효과: `condition { name, broken? }`(데드락 네 조건 `mutual-exclusion`·`hold-and-wait`·`no-preemption`·`circular-wait` 중 하나를 "교착 조건" 패널에 "성립"으로 켬. 해결 방법이 그 조건을 깨면 `broken: true`로 "깨짐"), `take { from, refused?, reason? }`(다른 스레드가 쥔 자원을 빼앗으려 함. 비선점이면 `refused`), `cycle`(대기 관계가 고리를 이룸: 바닥 고리, 위에서 보는 샷), `timeout`(기다리다 포기: 모래시계가 다 됨. 보통 `release`와 함께), `stamp { label, tone }`(도장. 예: 교착).
- 검증: acquire는 아무도 안 쥔 자원, wait는 다른 스레드가 쥔 자원, release는 자기가 쥔 자원, access는 아무도 안 쥐었거나 자기가 쥔 자원(남이 쥐었으면 wait). `read`·`write`는 access 단계에만, `value`가 있는 자원에만. `value`는 자원에만. 기본 흐름·해결 방법마다 단계를 따라가며 확인한다.
- "교착 조건" 패널은 `condition` 효과를 쓰는 용어에만 보인다.

## 방어 모드 동작

1. `blockedAtStep` 이전 단계는 그대로 재생한다.
2. `blockedAtStep` 단계에서 원래 `label` 대신 `blockedLabel`을, 원래 `caption` 대신 `blockedCaption`을 보여주고 차단 연출을 한다.
3. 그 뒤 단계는 재생하지 않는다. 공격이 거기서 끝났다는 뜻이다.
   - 차단 도장 위치(3D): 차단 단계에 `inspect`가 있으면 검문소에서 봉투를 열어 검사하고 실패하면 거기서 도장을 찍고 봉투가 튕겨 나간다. `inspect`가 없으면 단계를 끝까지 보여 준 뒤, 거부된 효과(`refused: true`)의 대상(`run` → 실행하려던 탭, `attach` → 꺼내려던 곳, `give` → 받으려던 쪽, `occupy` → 칸이 찬 행위자)에, 그것도 없으면 목적지에 도장을 찍는다. "도착은 했지만 실행·읽기·엿보기가 막혔다"를 이렇게 표현한다.
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
| `kind` | `browser` `tab` `frame` `cookieJar` `server` `database` `network` `attacker` `person` | 모양. `frame`은 탭 안에 겹친 다른 사이트 화면(iframe)으로, `parent`가 tab이어야 하고 탭 바로 앞에 조금 작은 판으로 선다. 없으면 `role`에서 정함(user→person, server→server, database→database, attacker→attacker) |
| `look` | `bank` `web` `shop` `community` `cloud-metadata`(server) / `database`(server·database) / `wifi`(network) | 생김새. 없으면 `kind`의 기본 모양. kind에 맞지 않으면 빌드 실패. 건물형(`bank` `web` `shop` `community`)의 간판과 `cloud-metadata`의 주소판에는 `site`가 글자로 들어간다. 모양 설명은 `docs/06` 2절 "생김새" |
| `zone` | `client`(앞, 사용자 쪽) `between`(사용자와 서버 사이 길목: 공용 와이파이·라우터) `server`(인터넷 너머 뒤) `internal`(서버 뒤 사내망) `outside`(옆, 공격자 쪽) | 자동 배치 구역. 없으면 `parent`를 따르고, 그것도 없으면 `role`에서 정함. `between`이 있으면 서버·사내망 줄이 그만큼 뒤로 물러난다. 서버·사내망·길목 줄에 하나뿐이면 겹치지 않게 좌우로 비켜 선다(서버 왼쪽, 사내망 오른쪽, 길목은 공격자 쪽). 인터넷 점선은 사용자 쪽 → 길목 → 서버, 사용자 쪽 → 공격자로 긋고, 사내망은 서버 구역에서만 이어진다(밖에서 바로 닿지 않음) |
| `parent` | 행위자 id | 그 안에 들어감(예: 탭·쿠키 보관함 → 브라우저) |
| `site` | 문자열 | 이름 옆에 작게 쓰는 주소(예: `bank.example`) |
| `tone` | `attack` `neutral` | 공격 쪽 물체 표시 |
| `gate` | `true` | 서버 앞(사용자 쪽) 검문소. 더 깊은 구역(사내망 등)에서 오는 봉투는 검문소를 지나지 않는다 |
| `balance` | 정수 | 잔액 라벨. `transfer`(coin)로 바뀜 |
| `screen` / `back` | `{ title?, lines[] }` | 화면판의 앞면 / 뒤집으면 보이는 뒷면 글자. 탭은 항상 화면판이 있고, `server`·`database`는 `screen`이 있을 때 옆에 화면판이 선다(만들어진 쿼리, 미리보기 결과처럼 서버 안에서 일어나는 일) |
| `slots` | `{ label, size(1~8) }` | server·database 섬 왼쪽 옆에 놓인 칸 선반(작은 상자 `size`개)과 라벨(`label 찬 수/size`). `occupy`·`vacate`로 채우고 비운다. 예: SYN-RECEIVED 대기열 |
| `mirrorScreen` | boolean, 기본 false | 켜면 화면판 내용을 늘 HTML 라벨로도 보여 준다(첫 줄이 제목, 나머지 줄은 부제). 판 글씨는 멀리서 작아 읽기 어려우므로, 상태가 개념의 핵심인 판(예: TCP 상태)에 켠다. 화면판이 있는 행위자에만 쓸 수 있다 |

**단계 (`scenario.steps[]`)**: `burst`(2~8, 같은 봉투가 본 봉투를 따라 여러 개 연달아 날아감. 보이는 개수이고 실제 개수는 `label`에 적는다. 예: "SYN × 수천". 제자리 단계에는 못 씀), `effects[]`(아래 어휘), `roundTrip`(왕복), `returnLabel`(돌아올 때 라벨), `via`(거쳐 가는 행위자. 봉투가 먼저 들렀다 가고, `give`(from `"packet"`)은 그 자리에서 빠져나간다), `camera: { focus: 행위자 id | "all", distance?: near|mid|far, view?: "side" }`(자동 카메라를 덮어쓸 때만. `view: "side"`면 그 단계만 오른쪽 옆에서 보고, 다음 단계는 기본 방향으로 돌아온다. 예: 앞뒤로 겹친 판이 떨어져 있는 것). `from`과 `to`가 같으면 제자리 단계다(예: 탭 안에서 스크립트 실행): 봉투가 날지 않고 그 자리에서 효과만 보여 준다.

**효과 어휘 (`effects[]`)**. 물건(`item`)은 `cookie` `token` `script` `data` `coin`. 보관된 물건은 꺼내도 보관한 곳에 남는다(복사).

| type | 필드 | 뜻 |
| --- | --- | --- |
| `appear` | target | 이 단계에 나타남. 그 전에는 숨김 |
| `flip` | target | 패널을 뒤집어 `back`을 보여 줌 |
| `rewrite` | target, side?(front·back), screen | 화면 글자를 바꿈. 카메라가 그 화면판으로 다가가고, 바뀐 내용이 라벨로도 떠서 그 판이 다시 바뀌거나 단계가 끝날 때까지(일시정지 중에도) 보인다 |
| `store` | item, into, label? | 봉투에 실려 온 물건을 보관함·서버 등에 넣음 |
| `attach` | item, from, label?, note?, refused?, reason? | 보관된 물건을 지금 봉투에 붙임. 붙으면 봉투 라벨이 `label + " + " + 붙인 label`이 됨. `note`는 붙일 때 보여 줄 설명(없으면 "목적지 … 자동 첨부", 브라우저가 쿠키를 자동으로 붙이는 경우). `refused`면 붙지 않고 라벨도 그대로 |
| `give` | item, from(행위자 또는 `"packet"`), to, label?, refused?, reason? | 봉투와 따로 물건이 날아감(토큰 발급, 가로채기) |
| `run` | item, target(tab), refused?, reason? | 스크립트 등이 그 탭에서 실행됨 |
| `inspect` | at, contents[], checks[{name, result, status: ok·skip·fail}] | 검문소에서 봉투를 열어 검사. `at`은 이 단계의 목적지이고, 목적지에 `gate: true`가 있어야 한다 |
| `transfer` | item(coin·data), from, to, amount?, label? | 돈·데이터 묶음이 넘어감 |
| `occupy` | target, count(기본 1), label?, refused?, reason? | `slots`가 있는 행위자의 칸을 앞에서부터 채움. 칸이 가득 찬 뒤에만 `refused`(거절)를 쓸 수 있고, 거절되면 그 선반 옆에 `reason`이 뜬다. 칸 수를 넘게 채우면 빌드 실패 |
| `vacate` | target, count(기본 1) | 찬 칸을 비움. 찬 칸보다 많이 비우면 빌드 실패 |
| `opacity` | target(frame), value(0~1) | 겹친 화면의 불투명도를 바꿈(0이면 보이지 않음). 겹친 화면은 가림 자동 투명에서 빠지고 이 값만 따른다 |

**방어 (`defenses[]`)**: `blockedTitle`(차단 단계 제목), `blockedLabel`(차단 도장과 2D 대체 화면의 차단 표시 글자, 예: `"403 · 토큰 없음"`), `overrides: [{ step, title?, caption?, effects? }]`(방어 모드에서 그 단계의 제목·자막·효과를 대신함).

**검증기가 추가로 잡는 오류**: 없는 행위자를 가리키는 `parent`·`via`·`camera.focus`·효과 대상, `parent` 순환, `back`이 없는데 `flip`, 화면판이 없는 곳에 `rewrite`·`flip`·`mirrorScreen`, `inspect.at`이 목적지가 아니거나 목적지에 검문소가 없음, `run` 대상이 tab이 아님, `override.step`이 범위 밖이거나 중복, 그 시점에 없는 물건을 `attach`하거나 봉투에 없는 물건을 `give`(공격 흐름과 방어별로 각각 단계를 따라가며 확인), 플레이어 유형에 없는 효과(흐름형·스택형·점유형 어휘는 각 절), `slots`가 server·database가 아님, `frame`의 parent가 tab이 아님, 칸이 없는 곳에 `occupy`·`vacate`, 칸 수를 넘는 `occupy`·빈 칸이 남았는데 거절·찬 칸보다 많은 `vacate`(모드별로 단계를 따라가며), frame이 아닌 곳에 `opacity`, 제자리 단계의 `burst`.

## 카테고리

| 값 | 표시 이름 |
| --- | --- |
| `web-security` | 웹 보안 |
| `network` | 네트워크 |
| `os` | 운영체제 |
| `runtime` | 자료구조·런타임 |

## 빌드 산출물

`scripts/build-index`가 `status: "published"`인 파일만 모아 `apps/web/generated/build/content/`에 만든다. 배포 주소에서는 `/content/...`로 제공된다. 화면 경로 `/terms/:id`와 겹치지 않게 하려고 `/content/` 아래에 둔다.

- `/content/index.json`: 목록·검색·진행률 계산용. 용어마다 `id`, `name`, `englishName`, `aliases`, `category`, `summary`, `playerType`, `stepCount`(단계 수), `defenseCount`(차단 단계가 있는 방어 수), `supportCount`(차단 단계 없는 보조 방어 수), `dangerFrom`(처음 `danger: true`인 단계 번호, 없으면 `null`), `blockedAt`(방어들의 `blockedAtStep`을 중복 없이 오름차순)만 담는다. `stepCount`~`supportCount`는 목록 카드의 "흐름형 · 6단계 · 방어 2개"(보조가 있으면 "방어 1 · 보조 1") 표시용이고, `dangerFrom`·`blockedAt`은 랜딩의 단계 막대(공격이 어디서 위험해지고 방어가 어디서 막는지) 표시용이다.
- `/content/terms/<id>.json`: 상세 페이지용. 스키마 검증을 거쳐 기본값(`aliases: []`, `danger: false` 등)을 채우고, 각주 풀이를 `footnotes`로 풀어 넣은 결과(`BuiltTerm`).

개발 서버(`npm run dev`)용은 `draft`까지 포함해 `apps/web/generated/dev/content/`에 따로 만든다. `vite.config.ts`는 `vite build`일 때 `generated/build`만 publicDir로 쓰므로, `npx vite build`를 직접 실행해도 draft가 배포 결과물에 들어갈 수 없다. `retired`는 어느 쪽에도 포함하지 않는다.

권장 규칙(단계 수 2~10개, 보안 용어는 `defenses` 1개 이상, `related`의 id 존재)은 어겨도 빌드를 멈추지 않고 경고만 출력한다.

## 검증기가 잡아야 하는 오류

- 스키마 위반(필수 필드 누락, 허용되지 않은 값)
- 파일명과 `id` 불일치, 중복 `id`
- 한 번 공개한 `id`(`content/published-ids.json`)의 파일이 없음(이름 변경·삭제), `published` 용어가 그 목록에 없음. 처음 공개할 때 목록에 `id`를 추가하고, 내릴 때는 파일을 지우지 말고 `status`를 `retired`로 둔다(FR-CNT-05)
- `actors`에 없는 `from`/`to`
- `playerType`에 맞지 않는 `action` (예: flow인데 push)
- `blockedAtStep`이 단계 수를 넘음, `blockedAtStep`이 있는데 `blockedLabel`/`blockedCaption` 없음
- 방어(`defense`)에 `branchAtStep`·`steps`, 해결 방법(`solution`)에 `blockedAtStep`, `branchAtStep`과 `steps` 중 하나만 있음, 갈림 단계 이후의 `overrides`
- 스택형 push·pop·run 순서, 점유형 acquire·wait·release 상태(위 각 절)
- 설명 틀: 구조·문단 수·한 줄 정의 길이·각주 4개 초과·같은 단어 반복, 초안이 아닌 용어의 "(설명 준비 중)", 문자열 한 문단(이전 형식), 풀이 사전의 누락·미사용·잘못된 `term`·자기 링크(위 "설명 틀과 각주"). 70자 넘는 문장은 경고

오류가 있으면 파일명과 위치(예: `csrf.json: scenario.steps[4].to`)를 출력하고 빌드를 실패시킨다.

## AI로 용어 데이터를 만들 때

이 문서와 `docs/examples/`의 예시 하나를 함께 주고 "이 형식으로 SQL 인젝션 JSON을 써줘"처럼 요청한다. 결과는 `status: "draft"`로 넣고, 사람이 흐름·자막·출처를 검수한 뒤 `published`로 바꾼다.
