// 표제어 한 쪽(/terms/:id): 쪽 머리(색인으로) → 표제어 + 원어 표기 + 「분야」 〔단계, 방어〕 → 뜻풀이 + 오른쪽 완독 메모(完 도장 + 완독한 날, 학습 상태)
// → [그림 1] 3D 플레이어 → 방어(해결) 방법 → 참고 문헌 → "→ 참조" 관련 표제어.
// 본문은 표시 문법(==형광펜==·`코드`)을 Marked로 그린다. 내용 묶음은 종이색 카드, 넓은 화면에서는 옆에 차례(TOC)
import { Link, useLocation, useNavigationType, useParams } from "react-router";
import type { IndexEntry, Term } from "@app/content-schema";
import { defenseCounts } from "@app/content-schema/scene";
import NotFoundPage from "../../NotFoundPage.tsx";
import { useJson } from "../../useJson.ts";
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { loginPath } from "../auth/safeNext.ts";
import { useAuth } from "../auth/store.ts";
import { entryMeta, Field, SeeAlso } from "../dictionary/Dictionary.tsx";
import { Marked } from "../dictionary/Marked.tsx";
import { SAVE_FAILED, StudyCard } from "../progress/StudyCard.tsx";
import { isRead, progress, useProgress } from "../progress/store.ts";
import type { PlayerJump } from "../../players/Player.tsx"; // 타입만이라 묶음에 들어가지 않는다

// 플레이어(Motion 포함)는 상세 페이지에서만 받는다. 홈 묶음을 가볍게 유지
const Player = lazy(() => import("../../players/Player.tsx"));

/** 참고 자료의 출처 이름(주소의 도메인으로) */
export function sourceOf(url: string) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const known: [RegExp, string][] = [
    [/owasp\.org$/, "OWASP"],
    [/mozilla\.org$/, "MDN"],
    [/amazon\.com$|aws\.amazon/, "AWS"],
    [/ietf\.org$|rfc-editor\.org$/, "IETF"],
    [/w3\.org$/, "W3C"],
    [/microsoft\.com$/, "Microsoft"],
    [/oracle\.com$/, "Oracle"],
    [/python\.org$/, "Python"],
    [/cloudflare\.com$/, "Cloudflare"],
    [/portswigger\.net$/, "PortSwigger"],
    [/cwe\.mitre\.org$|mitre\.org$/, "MITRE"],
    [/kernel\.org$/, "Linux kernel"],
    [/wikipedia\.org$/, "Wikipedia"],
  ];
  return known.find(([re]) => re.test(host))?.[1] ?? host;
}

/** 이 쪽 차례(넓은 화면에서만 보인다): 화면에 들어온 구역을 aria-current로 표시 */
function Toc({ items }: { items: { id: string; label: string }[] }) {
  const [current, setCurrent] = useState(items[0]?.id);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setCurrent(top.target.id);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    for (const el of els) io.observe(el);
    return () => io.disconnect();
  }, [items]);
  return (
    <nav className="la-toc" aria-label="이 페이지 목차">
      <ol>
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} aria-current={current === i.id ? "location" : undefined}>
              {i.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function TermDetail({ term }: { term: Term }) {
  const index = useJson<IndexEntry[]>("/content/index.json");
  // JSON에 적은 순서대로, 배포된(published, 목록에 있는) 용어만 링크한다
  const related = index.state === "ok" ? term.related.flatMap((id) => index.data.find((t) => t.id === id) ?? []) : [];
  const isSecurity = term.category === "web-security";
  const auth = useAuth();
  const state = useProgress();
  const read = auth.status === "user" && isRead(state, term.id);
  // 이 쪽을 보는 동안 안 읽음 → 다 읽음이 되면(끝까지 봄·직접 표시) 도장이 쾅 찍힌다. 이미 다 읽은 쪽을 열 때는 그대로
  const wasRead = useRef<boolean>(undefined);
  const [press, setPress] = useState(false);
  useEffect(() => {
    if (state.status !== "ready" || auth.status !== "user") return;
    if (wasRead.current === false && read) setPress(true);
    wasRead.current = read;
  }, [read, state.status, auth.status]);
  const { pathname, hash } = useLocation();
  const navType = useNavigationType();
  // 용어 쪽은 늘 맨 위(용어 이름)에서 시작한다(Layout의 ScrollRestoration). 주소에 #term-fig처럼 가리키는 곳이 있을 때만 거기서 시작한다.
  // 내용이 늦게 도착한 첫 방문은 라우터가 그 자리를 아직 모르므로 여기서 한 번 옮긴다. 뒤로 가기(POP)는 라우터가 먼저 떠난 위치를 복원하므로(앞선 형제 효과),
  // 이미 맨 위가 아니면 건드리지 않는다. 주소를 직접 열었을 때도 POP이지만 그때는 맨 위라 해시로 간다
  useLayoutEffect(() => {
    if (!hash || (navType === "POP" && window.scrollY > 0)) return;
    try {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
    } catch {
      // 해석할 수 없는 해시는 무시한다(맨 위에서 시작)
    }
    // 처음 그려질 때만: 쪽 안 차례 링크로 해시가 바뀌는 것은 라우터가 처리한다
  }, []);
  // 끝까지 봄(FR-PRG-01): 로그인 상태면 읽음으로 저장, 아니면 로그인 안내. 저장이 실패해도 재생은 그대로(NFR-02)
  const [completed, setCompleted] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const signedIn = useRef(false);
  useEffect(() => {
    signedIn.current = auth.status === "user";
  }, [auth.status]);
  // 최근 본 용어(FR-PRG-06): 로그인 상태로 상세를 열면 한 번 기록한다. 실패해도 화면은 그대로
  useEffect(() => {
    if (auth.status === "user") progress.recordView(term.id);
  }, [auth.status, term.id]);
  const onComplete = useCallback(() => {
    setCompleted(true);
    if (signedIn.current) progress.setRead(term.id, true, "completed").catch(() => setSaveError(SAVE_FAILED));
  }, [term.id]);
  const meta = entryMeta({ stepCount: term.scenario.steps.length, defenseCount: defenseCounts(term).defenseCount, category: term.category });
  const original = [term.englishName, ...term.aliases].filter(Boolean).join(" · ");
  // "¶ n단계"를 누르면 그림 1로 올라가 그 방어 모드의 n단계를 보인다
  const [jump, setJump] = useState<PlayerJump>();
  const showDefense = (defense: number, step: number) => {
    setJump((j) => ({ defense, step, n: (j?.n ?? 0) + 1 }));
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("term-fig")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  const toc = useState(() => [
    { id: "term-def", label: "설명" },
    { id: "term-fig", label: "애니메이션" },
    ...(term.defenses.length > 0 ? [{ id: "term-defense", label: isSecurity ? "방어" : "해결" }] : []),
    { id: "term-refs", label: "참고" },
  ])[0];

  return (
    <div className="la la-page la-term">
      <header className="la-runhead">
        <span className="la-runhead-name">
          <Link to="/terms">← 용어 색인으로</Link>
        </span>
        <span />
        <span className="la-guide">
          <Field category={term.category} />
        </span>
      </header>

      <div className="la-term-layout">
        <Toc items={toc} />
        <article className="la-term-page" aria-labelledby="term-hw">
          <div id="term-def" className="la-term-head la-card">
            <div>
              <h1 id="term-hw" className="la-headword term-title">
                {term.name}
              </h1>
              {original && (
                <p className="la-hanja term-sub" lang={term.englishName ? "en" : undefined}>
                  {original}
                </p>
              )}
              <p className="la-pos">
                <Field category={term.category} /> <span className="la-num">{meta}</span>
              </p>
              <p className="la-term-def term-desc">
                <Marked text={term.description} />
              </p>
            </div>
            <StudyCard termId={term.id} saveError={saveError} press={press} />
          </div>

          <figure id="term-fig" className="la-term-fig la-card" aria-labelledby="term-fig-cap">
            <Suspense fallback={<PlayerSkeleton />}>
              <Player term={term} onComplete={onComplete} jump={jump} />
            </Suspense>
            <figcaption id="term-fig-cap">
              <b>그림 1.</b> {term.name}의 단계별 장면. 무대를 끌면 돌려 볼 수 있다.
            </figcaption>
          </figure>
          {completed && auth.status !== "user" && (
            <section className="la-note complete-notice" role="status">
              <p>
                <strong>끝까지 봤어요.</strong> 로그인하면 이 용어에 完 도장이 찍히고, 다른 기기에서도 이어서 볼 수 있어요.
              </p>
              <Link to={loginPath(pathname)} className="la-btn la-btn-mark">
                로그인하고 저장하기
              </Link>
            </section>
          )}

          {term.defenses.length > 0 && (
            <section id="term-defense" className="la-term-sec la-card la-card-defense" aria-labelledby="term-def-h">
              <h2 id="term-def-h">{isSecurity ? "방어 방법" : "해결 방법"}</h2>
              <ol className="la-defenses">
                {term.defenses.map((d, i) => {
                  const at = d.blockedAtStep ?? d.branchAtStep;
                  return (
                    <li key={d.name}>
                      <h3 className="defense-title">{d.name}</h3>
                      {at && (
                        <p className="la-defense-at">
                          ¶{" "}
                          {/* 누르면 그림 1이 이 방어의 모드로 그 단계를 보여 준다 */}
                          <button type="button" className="la-defense-jump" onClick={() => showDefense(i, at)}>
                            <span className="la-num">{at}</span>
                            {d.blockedAtStep ? "단계에서 막힌다." : "단계부터 다른 흐름으로 간다."}
                            <span className="visually-hidden"> 그림 1에서 보기</span>
                          </button>
                        </p>
                      )}
                      <p>
                        <Marked text={d.description} />
                      </p>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          <section id="term-refs" className="la-term-sec la-card" aria-labelledby="term-ref-h">
            <h2 id="term-ref-h">참고 자료</h2>
            <ul className="link-list la-refs">
              {term.references.map((r) => (
                <li key={r.url}>
                  <span className="la-ref-src">{sourceOf(r.url)}</span>
                  <a href={r.url} rel="noopener noreferrer">
                    {r.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {related.length > 0 && <SeeAlso list={related} className="la-see la-term-see related" />}
        </article>
      </div>
    </div>
  );
}

/** 불러오는 동안에도 플레이어 크기만큼 자리를 잡아 레이아웃이 밀리지 않게 한다(CLS) */
const PlayerSkeleton = () => (
  <section className="glass card player player-skeleton" aria-label="애니메이션 플레이어" aria-busy="true">
    <p className="muted">플레이어를 불러오는 중…</p>
  </section>
);

function TermSkeleton() {
  return (
    <div className="la la-page la-term" aria-busy="true">
      <div className="la-term-head detail-skeleton">
        <p className="muted">불러오는 중…</p>
      </div>
      <PlayerSkeleton />
    </div>
  );
}

export default function TermPage() {
  const { id } = useParams();
  const load = useJson<Term>(`/content/terms/${id}.json`);

  if (load.state === "loading") return <TermSkeleton />;
  if (load.state === "notfound") return <NotFoundPage message="찾는 용어가 없습니다." />;
  if (load.state === "error") return <p role="alert">용어를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>;
  // key: 다른 용어로 바뀌면 재생 상태·완독 안내 같은 이 쪽의 상태를 처음부터 다시 시작한다(캐시된 용어는 "불러오는 중"을 거치지 않는다)
  return <TermDetail key={load.data.id} term={load.data} />;
}
