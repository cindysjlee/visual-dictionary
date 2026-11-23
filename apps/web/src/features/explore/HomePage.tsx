// 표제어 색인(/terms): 사전의 색인 쪽. 쪽 머리(찾아보기) → 표제어 색인 머리 + 내 다 읽음 장부 → 엄지 색인(분야)·읽음 걸러 보기 → 가나다순 첫소리 색인.
// 다 읽은 표제어에는 줄 끝에 完 도장, 읽다 만 표제어(최근 본 것 중 안 읽은 것)에는 책갈피. 검색어(?q=)와 분야(?field=)는 주소에 남는다
import { useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import type { Category, IndexEntry } from "@app/content-schema";
import { CATEGORY_LABELS } from "@app/content-schema/labels";
import { useJson } from "../../useJson.ts";
import { loginPath } from "../auth/safeNext.ts";
import { useAuth } from "../auth/store.ts";
import { groupByCategory, IndexColumns, Ledger, Thumbs } from "../dictionary/Dictionary.tsx";
import { bookmarkIds } from "../progress/bookmarks.ts";
import { recentTerms } from "../progress/recent.ts";
import { isRead, progress, readAt, useProgress, useRecent } from "../progress/store.ts";
import { passesReadFilter, type ReadFilter } from "../progress/summary.ts";

const READ_FILTERS: [ReadFilter, string][] = [
  ["all", "전체"],
  ["read", "읽음"],
  ["unread", "안 읽음"],
];

const isCategory = (v: string | null): v is Category => !!v && v in CATEGORY_LABELS;

/** 최근 본 표제어 3개(FR-PRG-06) */
function RecentLinks({ index }: { index: IndexEntry[] }) {
  const items = recentTerms(useRecent(), index, 3);
  if (!items.length) return null;
  return (
    <nav className="recent-links" aria-label="최근 본 용어">
      <span>최근 본 용어</span>
      {items.map(({ term }) => (
        <Link key={term.id} to={`/terms/${term.id}`}>
          {term.name}
        </Link>
      ))}
    </nav>
  );
}

const matches = (term: IndexEntry, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || [term.name, term.englishName ?? "", term.summary, ...term.aliases].some((s) => s.toLowerCase().includes(q));
};

/** 다른 화면이 새로고침을 거치며 넘긴 안내를 한 번만 꺼낸다(저장소를 못 쓰면 없음). 넣는 곳: features/progress/MePage.tsx */
const HANDED_NOTICE = "vd-notice"; // main.tsx의 랜딩 로더도 이 키가 있으면 목록으로 보낸다
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
  const [params, setParams] = useSearchParams();
  // 랜딩 찾아보기(/terms?q=)와 분야(?field=)를 처음 값으로 읽고, 바뀌면 주소에도 남긴다(새로고침·뒤로 가기·공유)
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [category, setCategory] = useState<Category | "all">(() => {
    const f = params.get("field");
    return isCategory(f) ? f : "all";
  });
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  // 예: 탈퇴 완료. 구글 사용자는 로그아웃 때 로그인 도메인을 거쳐 새로 불러와지므로 sessionStorage로 한 번 넘겨받는다(features/progress/MePage)
  const routeNotice = (useLocation().state as { notice?: string } | null)?.notice;
  const [handedNotice] = useState(takeHandedNotice);
  const notice = routeNotice ?? handedNotice;
  const user = useAuth();
  const recent = useRecent();
  const state = useProgress();
  const records = state.status === "ready"; // 기록이 있을 때만 도장·걸러 보기·장부를 쓴다

  const terms = load.state === "ok" ? load.data : null;
  const byId = useMemo(() => new Map((terms ?? []).map((t) => [t.id, t])), [terms]);
  const groups = useMemo(() => groupByCategory(terms ?? []), [terms]);
  const lined = useMemo(() => new Set(records ? (terms ?? []).filter((t) => isRead(state, t.id)).map((t) => t.id) : []), [records, terms, state]);
  // 책갈피: 최근 본 것 중 아직 다 읽지 않은 표제어(로그인했을 때만)
  const resumeId = state.status === "ready" ? bookmarkIds(state.records, recent).find((id) => byId.has(id)) : undefined;

  if (load.state === "loading") return <p className="la-loading">불러오는 중…</p>;
  if (!terms) return <p role="alert">용어 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>;

  const sync = (q: string, c: Category | "all") => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (c !== "all") next.set("field", c);
    setParams(next, { replace: true });
  };
  const changeQuery = (q: string) => {
    setQuery(q);
    sync(q, category);
  };
  const changeCategory = (c: Category | "all") => {
    setCategory(c);
    sync(query, c);
  };
  const shown = terms.filter(
    (t) => (category === "all" || t.category === category) && matches(t, query) && (!records || passesReadFilter(readFilter, isRead(state, t.id))),
  );
  const reset = () => {
    setQuery("");
    setCategory("all");
    setReadFilter("all");
    sync("", "all");
  };
  const why = [query.trim() && `‘${query.trim()}’`, category !== "all" && `「${CATEGORY_LABELS[category]}」에서`, records && readFilter !== "all" && `${readFilter === "read" ? "읽은" : "안 읽은"} 것 중`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="la la-page">
      {notice && (
        <p className="la-note page-notice" role="status">
          {notice}
        </p>
      )}
      <header className="la-runhead">
        <span className="la-runhead-name">
          시각화 사전 <span aria-hidden="true">·</span> 색인
        </span>
        <form role="search" className="la-lookup" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="terms-q">검색</label>
          <input id="terms-q" name="q" type="search" placeholder="예: XSS, 데드락, forgery" autoComplete="off" value={query} onChange={(e) => changeQuery(e.target.value)} />
        </form>
        <span className="la-guide">
          용어 <span className="la-num">{terms.length}</span>, 분야 <span className="la-num">{groups.length}</span>
        </span>
      </header>

      <div className="la-index-top">
        <div className="la-index-head">
          <h1>용어 색인</h1>
          <p>
            가나다순 <span className="la-num">{terms.length}</span>개.{" "}
            {records ? "完 도장은 완독한 용어, 책갈피는 읽다 만 용어다." : "모두 로그인 없이 볼 수 있다."}
          </p>
        </div>
        <aside className="la-mine" aria-label="내 진행률">
          {user.status !== "user" ? (
            <p>
              로그인하면 끝까지 본 용어에 完 도장이 찍히고 분야별 진행률이 쌓인다. <Link to={loginPath("/terms")}>로그인</Link>
            </p>
          ) : state.status === "ready" ? (
            <>
              <Ledger groups={groups} lined={lined} caption="내 진행률" resume={resumeId ? byId.get(resumeId) : undefined} />
              <RecentLinks index={terms} />
            </>
          ) : state.status === "error" ? (
            <p>
              기록을 불러오지 못했어요. 용어는 그대로 볼 수 있어요.{" "}
              <button type="button" className="la-btn la-btn-sm" onClick={() => progress.reload()}>
                다시 불러오기
              </button>
            </p>
          ) : (
            <p>기록을 불러오는 중…</p>
          )}
        </aside>
      </div>

      <div className="la-index-tools">
        <Thumbs label="카테고리" groups={groups} total={terms.length} value={category} onChange={changeCategory} />
        {records && (
          <div className="la-thumbs la-read-filter" role="group" aria-label="읽음 상태">
            {READ_FILTERS.map(([value, label]) => (
              <button key={value} type="button" className="la-thumb" aria-pressed={readFilter === value} onClick={() => setReadFilter(value)}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="visually-hidden" role="status">
        용어 {shown.length}개
      </p>

      <section className="la-index is-inview" aria-label="용어 목록">
        {shown.length === 0 ? (
          <div className="la-empty">
            <p>
              찾는 용어가 없어요{why && <> · {why}</>}
            </p>
            <button type="button" className="la-btn la-btn-ink" onClick={reset}>
              전체 목록 보기
            </button>
          </div>
        ) : (
          <IndexColumns terms={shown} byId={byId} lined={lined} readAt={(id) => readAt(state, id)} resumeId={resumeId} headingLevel={2} />
        )}
      </section>
    </div>
  );
}
