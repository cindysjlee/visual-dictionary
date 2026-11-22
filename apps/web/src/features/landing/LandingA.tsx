// 시안 A "사전 지면": 종이 사전의 한 쪽을 펼친 것처럼 '시각화 사전'을 표제어로 풀이한다.
// 뜻풀이 ①②③ = 무엇인가·무엇이 들어 있나·왜 가입하나, [그림 1] = 예시 용어의 공격/방어 단계 비교(+ 행위자 등각 그림), 표제어 색인, 책갈피(가입)
import { useState } from "react";
import { Link } from "react-router";
import type { Category, Term } from "@app/content-schema";
import { CATEGORY_LABELS } from "@app/content-schema/labels";
import { lastStepIndex, modeDefenses, stepView, zoneOf, type StepView } from "@app/content-schema/scene";
import "@fontsource/nanum-myeongjo/400.css";
import "@fontsource/nanum-myeongjo/700.css";
import "../../styles/landing-a.css";
import { josa, type LandingData } from "./LandingPage.tsx";

type Props = { data: LandingData | null; failed: boolean };

const steps = (term: Term, mode: number | null) => Array.from({ length: lastStepIndex(term, mode) + 1 }, (_, i) => stepView(term, mode, i));

export default function LandingA({ data, failed }: Props) {
  const [cat, setCat] = useState<Category | "all">("all");
  const total = data?.index.length;
  const fields = data?.groups.map(([c]) => CATEGORY_LABELS[c]) ?? [];
  const demo = data?.demo ?? null;
  const demoEntry = demo ? data?.index.find((t) => t.id === demo.id) : undefined;

  const pick = (c: Category | "all") => {
    setCat(c);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("la-index")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <div className="la">
      <p className="la-runhead">
        <span>시각화 사전</span>
        {data && (
          <span className="la-guide">
            표제어 {data.index.length}개, 분야 {data.groups.length}개
          </span>
        )}
      </p>

      <div className="la-spread">
        <article className="la-entry" aria-labelledby="la-hw">
          <h1 id="la-hw" className="la-headword">
            시각화 사전
            <span className="la-hanja" lang="ko-Hani">
              視覺化辭典
            </span>
          </h1>
          <p className="la-gloss">보안·CS 용어를 3D 장면으로 보는 사전</p>
          <p className="la-pos">「명사」</p>
          <ol className="la-senses">
            <li>
              보안 공격과 컴퓨터 과학 개념을 단계별 3D 장면으로 풀어 쓴 용어 사전.
              {total !== undefined && (
                <>
                  {" "}
                  {fields.join(", ")} 분야의 표제어 <span className="la-num">{total}</span>개를 싣는다.
                </>
              )}
            </li>
            <li>
              공격이 어떻게 진행되는지, 방어를 켜면 어느 단계에서 막히는지를 같은 장면으로 견주어 보인다.
              {demoEntry && demoEntry.blockedAt.length > 0 && (
                <span className="la-example">
                  ¶ {josa(demoEntry.name, "은", "는")} 방어를 켜면 <span className="la-num">{demoEntry.blockedAt[0]}</span>단계에서 막힌다.
                </span>
              )}
            </li>
            <li>로그인하면 읽은 표제어와 분야별 진행률을 적어 두고, 읽다 만 곳에서 이어 보게 해 주는 학습 기록장.</li>
          </ol>
          <p className="la-actions">
            <Link className="la-btn la-btn-ink" to="/terms">
              표제어 둘러보기
            </Link>
            <Link className="la-btn" to="/auth/signup">
              회원가입
            </Link>
          </p>
          <p className="la-signup-note">가입하면 읽음 표시, 분야별 진행률, 이어 보기가 계정에 저장된다.</p>
          {failed && (
            <p className="la-note" role="alert">
              표제어 목록을 불러오지 못했습니다. 새로고침하거나 표제어 둘러보기로 가 주세요.
            </p>
          )}
        </article>

        <FigureOne demo={demo} />
      </div>

      <section id="la-index" className="la-index" aria-labelledby="la-index-title">
        <div className="la-index-head">
          <h2 id="la-index-title">표제어 색인</h2>
          <p>
            {total === undefined ? "표제어를 불러오는 중입니다." : `표제어 ${total}개. 모두 로그인 없이 볼 수 있다.`}
          </p>
        </div>
        {/* 엄지 색인: 넓은 화면에서는 페이지 오른쪽 가장자리에 붙는다 */}
        <nav className="la-thumbs" aria-label="분야별 엄지 색인">
          <button type="button" className="la-thumb" aria-pressed={cat === "all"} onClick={() => pick("all")}>
            전체
          </button>
          {data?.groups.map(([c, list]) => (
            <button key={c} type="button" className={`la-thumb la-thumb-${c}`} aria-pressed={cat === c} onClick={() => pick(c)}>
              {CATEGORY_LABELS[c]}
              <span className="la-thumb-count">{list.length}</span>
            </button>
          ))}
        </nav>
        <div className="la-columns">
          {data?.groups
            .filter(([c]) => cat === "all" || cat === c)
            .map(([c, list]) => (
              <section key={c} className={`la-group la-group-${c}`} aria-labelledby={`la-g-${c}`}>
                <h3 id={`la-g-${c}`}>
                  {CATEGORY_LABELS[c]} <span className="la-num">{list.length}</span>
                </h3>
                <ul>
                  {list.map((t) => (
                    <li key={t.id}>
                      <Link to={`/terms/${t.id}`} className="la-word">
                        {t.name}
                      </Link>
                      {t.englishName && <span className="la-en">{t.englishName}</span>}
                      <span className="la-meta">
                        〔<span className="la-num">{t.stepCount}</span>단계
                        {t.defenseCount > 0 && (
                          <>
                            , 방어 <span className="la-num">{t.defenseCount}</span>
                          </>
                        )}
                        〕
                      </span>
                      <p className="la-def">{t.summary}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      </section>

      <section className="la-bookmark" aria-labelledby="la-bm-title">
        <span className="la-ribbon" aria-hidden="true" />
        <div className="la-bm-text">
          <h2 id="la-bm-title">이 사전에 책갈피를 꽂으려면</h2>
          <p>가입하면 읽은 기록이 계정에 남습니다. 다른 브라우저에서 열어도 같은 곳에서 이어집니다.</p>
          <dl className="la-bm-list">
            <div>
              <dt>읽음 표시</dt>
              <dd>끝까지 본 표제어에 표시가 남는다.</dd>
            </div>
            <div>
              <dt>분야별 진행률</dt>
              <dd>분야마다 몇 개를 읽었는지 보인다.</dd>
            </div>
            <div>
              <dt>이어 보기</dt>
              <dd>최근 본 표제어가 목록 첫머리에 남는다.</dd>
            </div>
          </dl>
          <p className="la-actions">
            <Link className="la-btn la-btn-ink" to="/auth/signup">
              회원가입
            </Link>
            <Link className="la-btn" to="/auth/login">
              로그인
            </Link>
          </p>
        </div>
        {data && (
          <figure className="la-ledger" aria-labelledby="la-ledger-cap">
            <figcaption id="la-ledger-cap">가입하면 여기서 시작한다</figcaption>
            <ul>
              {data.groups.map(([c, list]) => (
                <li key={c} className={`la-group-${c}`}>
                  <span>{CATEGORY_LABELS[c]}</span>
                  <span className="la-ledger-bar" aria-hidden="true" />
                  <span className="la-num">0 / {list.length}</span>
                </li>
              ))}
            </ul>
          </figure>
        )}
      </section>
    </div>
  );
}

/** [그림 1] 예시 용어를 공격만 / 방어를 켰을 때로 나란히 적고, 고른 단계의 출발·도착 행위자를 등각 그림에 표시한다 */
function FigureOne({ demo }: { demo: Term | null }) {
  const [mode, setMode] = useState<number | null>(null);
  const [focus, setFocus] = useState(0);
  if (!demo) return <figure className="la-fig la-fig-wait" aria-busy="true" aria-label="그림을 불러오는 중" />;

  const modes = modeDefenses(demo);
  const defense = mode ?? modes[0] ?? null;
  const attack = steps(demo, null);
  const guarded = defense === null ? [] : steps(demo, defense);
  const blockedAt = guarded.findIndex((v) => v.blocked);
  const active = (focus === blockedAt ? guarded[focus] : attack[focus]) ?? attack[0]!;

  return (
    <figure className="la-fig" aria-labelledby="la-fig-cap">
      <div className="la-fig-head">
        <span>
          <b>그림 1.</b> {demo.name}, {focus + 1}단계
        </span>
        <Link className="la-btn la-btn-ink la-btn-sm" to={`/terms/${demo.id}`}>
          {demo.name} 3D 장면 재생
        </Link>
      </div>
      <IsoPlate term={demo} view={active} />
      {modes.length > 1 && (
        <div className="la-fig-modes" role="group" aria-label="견줄 방어">
          {modes.map((m) => (
            <button key={m} type="button" aria-pressed={defense === m} onClick={() => setMode(m)}>
              {demo.defenses[m]!.name}
            </button>
          ))}
        </div>
      )}
      <table className="la-steps">
        <thead>
          <tr>
            <th scope="col">단계</th>
            <th scope="col">공격만 있을 때</th>
            {defense !== null && <th scope="col">방어: {demo.defenses[defense]!.name}</th>}
          </tr>
        </thead>
        <tbody>
          {attack.map((v, i) => {
            const g = guarded[i];
            return (
              <tr key={i} className={focus === i ? "is-focus" : undefined}>
                <th scope="row">
                  <button type="button" className="la-step-no" aria-pressed={focus === i} onClick={() => setFocus(i)}>
                    {i + 1}
                    <span className="visually-hidden">단계를 그림에 표시</span>
                  </button>
                </th>
                <td className={v.tone === "attack" ? "la-attack" : undefined}>
                  {v.tone === "attack" && <span className="la-mark">위험</span>}
                  {v.title}
                </td>
                {defense !== null && (
                  <td className={g?.blocked ? "la-blocked" : g ? (g.tone === "attack" ? "la-attack" : undefined) : "la-halt"}>
                    {g?.blocked ? (
                      <>
                        <span className="la-mark">차단</span>
                        {g.title}
                        {g.blockedLabel && <span className="la-code">{g.blockedLabel}</span>}
                      </>
                    ) : g ? (
                      <>
                        {g.tone === "attack" && <span className="la-mark">위험</span>}
                        {g.title}
                      </>
                    ) : (
                      "여기까지 오지 않는다"
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <figcaption id="la-fig-cap">
        {demo.name}의 {attack.length}단계.
        {blockedAt >= 0 && ` 방어를 켜면 ${blockedAt + 1}단계에서 막힌다.`} 단계 번호를 누르면 위 그림에 그 단계에서 누가 누구에게 보내는지 표시된다.
      </figcaption>
    </figure>
  );
}

// 등각 그림: 구역(바깥·사용자 쪽·사이·서버·내부)을 가로 칸으로, 같은 구역 행위자를 세로로 쌓는다
const COL: Record<string, number> = { outside: 0, client: 1, between: 2, server: 3, internal: 4 };
const W = 30; // 상자 윗면 반폭
const H = 17; // 상자 윗면 반높이
const D = 20; // 상자 옆면 높이

function IsoPlate({ term, view }: { term: Term; view: StepView }) {
  const actors = term.scenario.actors;
  const rows: Record<number, number> = {};
  const at = new Map(
    actors.map((a) => {
      const col = COL[zoneOf(a, actors)] ?? 1;
      const row = (rows[col] = (rows[col] ?? -1) + 1);
      return [a.id, { x: (col - row) * 84, y: (col + row) * 46, name: a.name }] as const;
    }),
  );
  const pts = [...at.values()];
  const minX = Math.min(...pts.map((p) => p.x)) - 56;
  const maxX = Math.max(...pts.map((p) => p.x)) + 56;
  const minY = Math.min(...pts.map((p) => p.y)) - 44;
  const maxY = Math.max(...pts.map((p) => p.y)) + 56;
  const from = at.get(view.from);
  const to = at.get(view.to);
  const tone = view.blocked ? "defense" : view.tone;

  return (
    <svg
      className="la-iso"
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      role="img"
      aria-label={`${view.index + 1}단계: ${from?.name ?? ""}에서 ${to?.name ?? ""}(으)로. ${view.title}`}
    >
      <defs>
        <marker id={`la-arrow-${tone}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" className={`la-arrowhead la-tone-${tone}`} />
        </marker>
      </defs>
      {[...at.entries()].map(([id, p]) => (
        <g key={id} className={id === view.from || id === view.to ? "la-box is-on" : "la-box"}>
          <path d={`M${p.x - W} ${p.y} L${p.x} ${p.y + H} L${p.x} ${p.y + H + D} L${p.x - W} ${p.y + D}Z`} className="la-face-l" />
          <path d={`M${p.x} ${p.y + H} L${p.x + W} ${p.y} L${p.x + W} ${p.y + D} L${p.x} ${p.y + H + D}Z`} className="la-face-r" />
          <path d={`M${p.x} ${p.y - H} L${p.x + W} ${p.y} L${p.x} ${p.y + H} L${p.x - W} ${p.y}Z`} className="la-face-t" />
          <text x={p.x} y={p.y + H + D + 18} textAnchor="middle" className="la-iso-label">
            {p.name}
          </text>
        </g>
      ))}
      {from && to && from !== to && (
        <path
          key={view.index}
          d={`M${from.x} ${from.y - 6} Q${(from.x + to.x) / 2} ${Math.min(from.y, to.y) - 52} ${to.x} ${to.y - 6}`}
          className={`la-route la-tone-${tone}`}
          markerEnd={`url(#la-arrow-${tone})`}
        />
      )}
    </svg>
  );
}
