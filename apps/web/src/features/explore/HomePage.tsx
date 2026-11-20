import { useState } from "react";
import { Link, useLocation } from "react-router";
import type { Category, IndexEntry, Term } from "@app/content-schema";
import { CATEGORY_LABELS, PLAYER_LABELS } from "@app/content-schema/labels";
import { ArrowIcon, SearchIcon, ShieldIcon } from "../../icons.tsx";
import { useJson } from "../../useJson.ts";
import { loginPath } from "../auth/safeNext.ts";
import { useAuth } from "../auth/store.ts";
import { ProgressSummary } from "../progress/ProgressSummary.tsx";
import { recentTerms } from "../progress/recent.ts";
import { isRead, progress, useProgress, useRecent } from "../progress/store.ts";
import { passesReadFilter, type ReadFilter } from "../progress/summary.ts";

const CATEGORY_FILTERS: [Category | "all", string][] = [["all", "전체"], ...(Object.entries(CATEGORY_LABELS) as [Category, string][])];
const READ_FILTERS: [ReadFilter, string][] = [
  ["all", "전체"],
  ["read", "읽음"],
  ["unread", "안 읽음"],
];

/** 최근 본 용어 3개(FR-PRG-06) */
function RecentLinks({ index }: { index: IndexEntry[] }) {
  const items = recentTerms(useRecent(), index, 3);
  if (!items.length) return null;
  return (
    <nav className="recent-links" aria-label="최근 본 용어">
      <span className="muted">최근 본 용어</span>
      {items.map(({ term }) => (
        <Link key={term.id} to={`/terms/${term.id}`}>
          {term.name}
        </Link>
      ))}
    </nav>
  );
}

/** 홈 "내 진행률" 카드(FR-PRG-05): 로그아웃이면 로그인 안내, 로그인이면 전체·카테고리별 진행률 */
function ProgressCard({ index }: { index: IndexEntry[] }) {
  const auth = useAuth();
  const state = useProgress();
  return (
    <div className="glass card span-2">
      <h2 className="card-title">내 진행률</h2>
      {auth.status !== "user" ? (
        <>
          <p className="muted">로그인하면 읽은 용어와 분야별 진행률이 여기에 표시돼요.</p>
          <Link to={loginPath("/")} className="btn btn-sm study-login">
            로그인
          </Link>
        </>
      ) : state.status === "ready" ? (
        <>
          <ProgressSummary index={index} records={state.records} />
          <RecentLinks index={index} />
        </>
      ) : state.status === "error" ? (
        <>
          <p className="muted">기록을 불러오지 못했어요. 용어는 그대로 볼 수 있어요.</p>
          <button type="button" className="btn btn-sm study-login" onClick={() => progress.reload()}>
            다시 불러오기
          </button>
        </>
      ) : (
        <p className="muted">기록을 불러오는 중…</p>
      )}
    </div>
  );
}

const matches = (term: IndexEntry, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || [term.name, term.englishName ?? "", term.summary, ...term.aliases].some((s) => s.toLowerCase().includes(q));
};

export const termMeta = (t: Pick<IndexEntry, "playerType" | "stepCount" | "defenseCount" | "supportCount" | "category">) => {
  const word = t.category === "web-security" ? "방어" : "해결";
  // 보조 방어(차단 단계 없음)는 방어 개수에 넣지 않고 따로 보인다: "방어 1 · 보조 1"
  const defense =
    t.defenseCount + t.supportCount === 0 ? "개념 설명" : t.supportCount > 0 ? `${word} ${t.defenseCount} · 보조 ${t.supportCount}` : `${word} ${t.defenseCount}개`;
  return `${PLAYER_LABELS[t.playerType]} · ${t.stepCount}단계 · ${defense}`;
};

// 비회원에게는 "이어서 볼 용어" 대신 첫 용어를 보여 준다. 로그인 후 최근 본 용어로 바꾼다(6~7단계)
function FeaturedCard({ entry, label }: { entry: IndexEntry; label: string }) {
  const load = useJson<Term>(`/content/terms/${entry.id}.json`);
  const term = load.state === "ok" ? load.data : null;
  const blockedAt = term?.defenses.find((d) => d.blockedAtStep)?.blockedAtStep;

  return (
    <Link to={`/terms/${entry.id}`} className="glass tint-attack card featured span-2 row-2">
      <div className="featured-head">
        <span className="tag tag-plain">{label}</span>
        <span>
          {CATEGORY_LABELS[entry.category]} · {PLAYER_LABELS[entry.playerType]}
        </span>
      </div>
      <div>
        <div className="featured-name">{entry.name}</div>
        <p className="muted">{entry.summary}</p>
      </div>
      {term && (
        <ol className="step-list" aria-label={`${entry.name} 진행 단계`}>
          {term.scenario.steps.map((step, i) => (
            <li key={i} className={i + 1 === blockedAt ? "is-blocked" : step.danger ? "is-danger" : undefined}>
              <span className="step-no">{String(i + 1).padStart(2, "0")}</span>
              <span>{step.title}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="featured-foot">
        {blockedAt && (
          <span className="defense-note">
            <ShieldIcon />
            방어 모드에서는 {blockedAt}단계에서 차단
          </span>
        )}
        <span className="go-mark">
          <ArrowIcon />
        </span>
      </div>
    </Link>
  );
}

/** 다른 화면이 새로고침을 거치며 넘긴 안내를 한 번만 꺼낸다(저장소를 못 쓰면 없음). 넣는 곳: features/progress/MePage.tsx */
const HANDED_NOTICE = "vd-notice";
function takeHandedNotice(): string | undefined {
  try {
    const notice = sessionStorage.getItem(HANDED_NOTICE) ?? undefined;
    sessionStorage.removeItem(HANDED_NOTICE);
    return notice;
  } catch {
    return undefined;
  }
}

export default function HomePage() {
  const load = useJson<IndexEntry[]>("/content/index.json");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  // 예: 탈퇴 완료. 구글 사용자는 로그아웃 때 로그인 도메인을 거쳐 새로 불러와지므로 sessionStorage로 한 번 넘겨받는다(features/progress/MePage)
  const routeNotice = (useLocation().state as { notice?: string } | null)?.notice;
  const [handedNotice] = useState(takeHandedNotice);
  const notice = routeNotice ?? handedNotice;
  const user = useAuth();
  const recent = useRecent();
  const state = useProgress();
  const records = state.status === "ready"; // 기록이 있을 때만 읽음 표시·필터를 쓴다

  if (load.state === "loading") return <p className="muted">불러오는 중…</p>;
  if (load.state !== "ok") return <p role="alert">용어 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>;

  const terms = load.data;
  const shown = terms.filter(
    (t) => (category === "all" || t.category === category) && matches(t, query) && (!records || passesReadFilter(readFilter, isRead(state, t.id))),
  );
  const reset = () => {
    setQuery("");
    setCategory("all");
    setReadFilter("all");
  };

  return (
    <>
      {notice && (
        <p className="glass card page-notice" role="status">
          {notice}
        </p>
      )}
      <section className="bento">
        <div className="glass card card-lg hero span-2 row-2">
          <div className="stack">
            <p className="eyebrow">보안 · CS 개념 시각화 사전</p>
            <h1>
              공격이 흘러가는 길과
              <br />
              막히는 지점을
              <br />
              한 장면씩 봐요
            </h1>
          </div>
          <label className="search">
            <SearchIcon />
            <input
              type="search"
              name="q"
              placeholder="CSRF, 데드락처럼 용어로 검색"
              aria-label="용어 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        {(() => {
          // 로그인 상태로 본 용어가 있으면 가장 최근 용어를 "이어서 볼 용어"로(FR-PRG-06), 아니면 첫 용어
          const last = user.status === "user" ? recentTerms(recent, terms, 1)[0]?.term : undefined;
          const entry = last ?? terms[0];
          return entry && <FeaturedCard key={entry.id} entry={entry} label={last ? "이어서 볼 용어" : "처음 볼 용어"} />;
        })()}

        <ProgressCard index={terms} />

        <div className="glass card span-2 filters">
          <div className="chips" role="group" aria-label="카테고리">
            {CATEGORY_FILTERS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="chip"
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {records && (
            <div className="chips" role="group" aria-label="읽음 상태">
              {READ_FILTERS.map(([value, label]) => (
                <button key={value} type="button" className="chip" aria-pressed={readFilter === value} onClick={() => setReadFilter(value)}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bento" aria-label="용어 목록">
        {shown.length === 0 ? (
          <div className="glass card card-lg notice span-all">
            <p>찾는 용어가 없어요{query.trim() && <> · ‘{query.trim()}’</>}</p>
            <button type="button" className="btn btn-cta" onClick={reset}>
              전체 목록 보기
            </button>
          </div>
        ) : (
          shown.map((t, i) => (
            <Link key={t.id} to={`/terms/${t.id}`} className={`glass card term-card${i === 0 ? " span-2" : ""}`}>
              <span className="term-card-tags">
                <span className={`tag tag-${t.category}`}>{CATEGORY_LABELS[t.category]}</span>
                {records && isRead(state, t.id) && (
                  <span className="tag tag-read">
                    <span aria-hidden="true">✓</span> 읽음
                  </span>
                )}
              </span>
              <span className="term-card-name">{t.name}</span>
              <span className="term-card-desc">{t.summary}</span>
              <span className="meta">{termMeta(t)}</span>
            </Link>
          ))
        )}
      </section>
    </>
  );
}
