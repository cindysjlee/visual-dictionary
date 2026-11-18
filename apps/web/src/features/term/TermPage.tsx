import { Link, useParams } from "react-router";
import type { IndexEntry, Term } from "@app/content-schema";
import { CATEGORY_LABELS } from "@app/content-schema/labels";
import NotFoundPage from "../../NotFoundPage.tsx";
import { ShieldIcon } from "../../icons.tsx";
import { useJson } from "../../useJson.ts";
import { termMeta } from "../explore/HomePage.tsx";
import { Suspense, lazy } from "react";

// 플레이어(Motion 포함)는 상세 페이지에서만 받는다. 홈 묶음을 가볍게 유지
const Player = lazy(() => import("../../players/Player.tsx"));

function TermDetail({ term }: { term: Term }) {
  const index = useJson<IndexEntry[]>("/content/index.json");
  // 배포된(published) 용어만 링크한다
  const related = index.state === "ok" ? index.data.filter((t) => term.related.includes(t.id)) : [];
  const isSecurity = term.category === "web-security";

  return (
    <>
      <section className="detail-top">
        <div className="glass card card-lg">
          <div className="chips">
            <span className={`tag tag-${term.category}`}>{CATEGORY_LABELS[term.category]}</span>
            <span className="tag tag-plain">
              {termMeta({
                playerType: term.scenario.playerType,
                stepCount: term.scenario.steps.length,
                defenseCount: term.defenses.length,
                category: term.category,
              })}
            </span>
          </div>
          <h1 className="term-title">{term.name}</h1>
          {(term.englishName || term.aliases.length > 0) && (
            <p className="term-sub">{[term.englishName, ...term.aliases].filter(Boolean).join(" · ")}</p>
          )}
          <p className="term-desc">{term.description}</p>
        </div>
        <div className="glass card card-lg">
          <h2 className="card-title">학습 상태</h2>
          <p className="muted">로그인하면 끝까지 재생한 용어가 자동으로 읽음 처리돼요.</p>
        </div>
      </section>

      {/* 끝까지 봄(onComplete) → 읽음 저장은 6단계에서 연결한다 */}
      <Suspense fallback={<section className="glass card player" aria-label="애니메이션 플레이어"><p className="muted">플레이어를 불러오는 중…</p></section>}>
        <Player term={term} />
      </Suspense>

      <section className="bento">
        {term.defenses.length > 0 && (
          <h2 className="visually-hidden">{isSecurity ? "방어 방법" : "해결 방법"}</h2>
        )}
        {term.defenses.map((d, i) => (
          <div key={d.name} className={`glass card span-2${i === 0 ? " tint-defense" : ""}`}>
            <h3 className="defense-title">
              <ShieldIcon size={18} />
              {d.name}
              {d.blockedAtStep && <small>· {d.blockedAtStep}단계에서 차단</small>}
            </h3>
            <p className="muted">{d.description}</p>
          </div>
        ))}
        <div className={`glass card ${related.length > 0 ? "span-3" : "span-all"}`}>
          <h2 className="card-title">참고 자료</h2>
          <div className="link-list">
            {term.references.map((r) => (
              <a key={r.url} href={r.url} rel="noopener noreferrer">
                {r.title}
              </a>
            ))}
          </div>
        </div>
        {related.length > 0 && (
          <div className="glass card related">
            <h2 className="card-title">관련 용어</h2>
            {related.map((t) => (
              <Link key={t.id} to={`/terms/${t.id}`}>
                {t.name}
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export default function TermPage() {
  const { id } = useParams();
  const load = useJson<Term>(`/content/terms/${id}.json`);

  if (load.state === "loading") return <p className="muted">불러오는 중…</p>;
  if (load.state === "notfound") return <NotFoundPage message="찾는 용어가 없습니다." />;
  if (load.state === "error") return <p role="alert">용어를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>;
  return <TermDetail term={load.data} />;
}
