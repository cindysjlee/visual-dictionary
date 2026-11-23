// 표제어 한 쪽(/terms/:id): 쪽 머리(색인으로) → 표제어(읽었으면 형광펜 밑줄) + 원어 표기 + 「분야」 〔단계, 방어〕 → 뜻풀이 + 밑줄 메모(학습 상태)
// → [그림 1] 3D 플레이어 → 방어(해결) 방법 → 참고 문헌 → "→ 참조" 관련 표제어.
// 본문은 표시 문법(==형광펜==·`코드`)을 Marked로 그린다. 모양 비교(?style=page|modern): modern이면 내용 묶음이 카드가 되고 옆에 차례(TOC)가 붙는다
import { Link, useLocation, useParams } from "react-router";
import type { IndexEntry, Term } from "@app/content-schema";
import { defenseCounts } from "@app/content-schema/scene";
import NotFoundPage from "../../NotFoundPage.tsx";
import { useJson } from "../../useJson.ts";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { loginPath } from "../auth/safeNext.ts";
import { useAuth } from "../auth/store.ts";
import { entryMeta, Field, SeeAlso } from "../dictionary/Dictionary.tsx";
import { Marked } from "../dictionary/Marked.tsx";
import { SAVE_FAILED, StudyCard } from "../progress/StudyCard.tsx";
import { isRead, progress, useProgress } from "../progress/store.ts";

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

/** 이 쪽 차례(modern에서만 보인다): 화면에 들어온 구역을 aria-current로 표시 */
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
    <nav className="la-toc" aria-label="이 쪽 차례">
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
  const { pathname } = useLocation();
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
  const toc = useState(() => [
    { id: "term-def", label: "뜻풀이" },
    { id: "term-fig", label: "그림" },
    ...(term.defenses.length > 0 ? [{ id: "term-defense", label: isSecurity ? "방어" : "해결" }] : []),
    { id: "term-refs", label: "참고" },
  ])[0];

  return (
    <div className="la la-page la-term">
      <header className="la-runhead">
        <span className="la-runhead-name">
          <Link to="/terms">시각화 사전 · 색인</Link>
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
                <span className={read ? "la-hl is-on" : "la-hl"}>{term.name}</span>
              </h1>
              {original && (
                <p className="la-hanja term-sub" lang={term.englishName ? "en" : undefined}>
                  {original}
                </p>
              )}
              <p className="la-pos">
                <Field category={term.category} /> 〔<span className="la-num">{meta}</span>〕
              </p>
              <p className="la-term-def term-desc">
                <Marked text={term.description} />
              </p>
            </div>
            <StudyCard termId={term.id} saveError={saveError} />
          </div>

          <figure id="term-fig" className="la-term-fig la-card" aria-labelledby="term-fig-cap">
            <Suspense fallback={<PlayerSkeleton />}>
              <Player term={term} onComplete={onComplete} />
            </Suspense>
            <figcaption id="term-fig-cap">
              <b>그림 1.</b> {term.name}의 단계별 장면. 무대를 끌면 돌려 볼 수 있다.
            </figcaption>
          </figure>
          {completed && auth.status !== "user" && (
            <section className="la-note complete-notice" role="status">
              <p>
                <strong>끝까지 봤어요.</strong> 로그인하면 이 표제어에 밑줄이 그어지고, 다른 기기에서도 이어서 볼 수 있어요.
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
                {term.defenses.map((d) => (
                  <li key={d.name}>
                    <h3 className="defense-title">{d.name}</h3>
                    {(d.blockedAtStep || d.branchAtStep) && (
                      <p className="la-defense-at">
                        ¶{" "}
                        {d.blockedAtStep ? (
                          <>
                            <span className="la-num">{d.blockedAtStep}</span>단계에서 막힌다.
                          </>
                        ) : (
                          <>
                            <span className="la-num">{d.branchAtStep}</span>단계부터 다른 흐름으로 간다.
                          </>
                        )}
                      </p>
                    )}
                    <p>
                      <Marked text={d.description} />
                    </p>
                  </li>
                ))}
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
  return <TermDetail term={load.data} />;
}
