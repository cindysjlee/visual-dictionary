// 랜딩 "사전 지면": 종이 사전의 한 쪽을 펼친 것처럼 '시각화 사전'을 표제어로 풀이한다.
// 쪽 머리(찾아보기) → 표제어 풀이 ①②③ + [그림 1](예시 용어의 공격/방어 단계, 행위자 등각 그림) → 가나다 색인(읽은 표제어에 형광펜 밑줄) → 책갈피(가입).
// 밑줄: 로그인해 기록을 불러왔으면(/about) 실제로 읽은 표제어, 아니면 "미리보기" 표시를 단 두 표제어에만 긋는다(지어낸 진행률 없음)
import { useEffect, useMemo, useRef, useState } from "react";
import { Form, Link } from "react-router";
import type { Category, IndexEntry } from "@app/content-schema";
import { CATEGORY_LABELS } from "@app/content-schema/labels";
import "@fontsource/nanum-myeongjo/400.css";
import "@fontsource/nanum-myeongjo/700.css";
import "../../styles/landing.css";
import { isRead, useProgress, useRecent } from "../progress/store.ts";
import SketchFigure from "./SketchFigure.tsx";
import { josa, type LandingData } from "./LandingPage.tsx";

type Props = { data: LandingData | null; failed: boolean };

// 첫소리 머리(ㄱ·ㄴ…): 겹자음은 홑자음 머리에 넣는다. 한글이 아니면 로마자 첫 글자
const CHOSEONG = "ㄱㄱㄴㄷㄷㄹㅁㅂㅂㅅㅅㅇㅈㅈㅊㅋㅌㅍㅎ";
export const initialOf = (name: string) => {
  const code = name.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 ? CHOSEONG[Math.floor(code / 588)]! : name.charAt(0).toUpperCase();
};

export default function DictionaryPage({ data, failed }: Props) {
  const [cat, setCat] = useState<Category | "all">("all");
  const progress = useProgress();
  const mine = progress.status === "ready"; // 로그인해 기록을 불러왔다(/about)
  const total = data?.index.length;
  const fields = data?.groups.map(([c]) => CATEGORY_LABELS[c]) ?? [];
  const demo = data?.demo ?? null;
  const demoEntry = demo ? data?.index.find((t) => t.id === demo.id) : undefined;
  const byId = useMemo(() => new Map(data?.index.map((t) => [t.id, t])), [data]);

  // 밑줄: 내 기록이면 읽은 표제어, 아니면 예시 용어와 그 첫 참조 용어(미리보기)
  const lined = useMemo(() => {
    if (!data) return new Set<string>();
    if (mine) return new Set(data.index.filter((t) => isRead(progress, t.id)).map((t) => t.id));
    const first = demoEntry ?? data.index[0];
    return new Set([first?.id, first?.related.find((id) => byId.has(id))].filter((id): id is string => !!id));
  }, [data, mine, progress, demoEntry, byId]);

  // 책갈피: 내 기록이면 최근 본 것 중 아직 다 읽지 않은 표제어, 아니면 밑줄 미리보기와 겹치지 않는 참조 용어(미리보기)
  const recent = useRecent();
  const resumeId = useMemo(() => {
    if (!data) return undefined;
    if (mine) return (recent.find((r) => !isRead(progress, r.termId)) ?? recent[0])?.termId;
    return (demoEntry ?? data.index[0])?.related.find((id) => byId.has(id) && !lined.has(id));
  }, [data, mine, recent, progress, demoEntry, byId, lined]);

  // 가나다순 색인을 첫소리로 묶는다(고른 분야만)
  const sections = useMemo(() => {
    const list = (data?.index ?? []).filter((t) => cat === "all" || t.category === cat).sort((a, b) => a.name.localeCompare(b.name, "ko"));
    const out: { head: string; terms: IndexEntry[] }[] = [];
    for (const t of list) {
      const head = initialOf(t.name);
      if (out.at(-1)?.head === head) out.at(-1)!.terms.push(t);
      else out.push({ head, terms: [t] });
    }
    return out;
  }, [data, cat]);

  // 색인·책갈피가 화면에 들어오면 밑줄·장부를 한 번 긋는다(동작 줄이기면 처음부터 그어져 있다, landing.css)
  const [indexRef, inView] = useInView(!!data);
  const [bookRef, bookInView] = useInView(!!data);

  return (
    <div className="la">
      <header className="la-runhead">
        <span className="la-runhead-name">시각화 사전</span>
        <Form method="get" action="/terms" role="search" className="la-lookup">
          <label htmlFor="la-q">찾아보기</label>
          <input id="la-q" name="q" type="search" placeholder="예: XSS, 데드락" autoComplete="off" />
          <button type="submit">찾기</button>
        </Form>
        {data && (
          <span className="la-guide">
            표제어 <span className="la-num">{data.index.length}</span>, 분야 <span className="la-num">{data.groups.length}</span>
          </span>
        )}
      </header>

      <div className="la-spread">
        <article className="la-entry" aria-labelledby="la-hw">
          <h1 id="la-hw" className="la-headword">
            시각화 사전
            <span className="la-hanja">
              <span lang="ko-Hani">[視覺化辭典]</span> <span lang="en">visual dictionary</span>
            </span>
          </h1>
          <p className="la-gloss">단계별 그림과 3D 장면으로 보는 보안·CS 용어 사전</p>
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
            <li>
              읽은 표제어에 <span className="la-hl is-on">밑줄</span>을 긋고 분야별 진행률을 쌓아 가는, 나만의 사전. 로그인하면 남는다.
            </li>
          </ol>
          <p className="la-actions">
            <Link className="la-btn la-btn-ink" to="/terms">
              표제어 둘러보기
            </Link>
            {mine ? (
              <Link className="la-btn" to="/me">
                내 학습 보기
              </Link>
            ) : (
              <Link className="la-btn la-btn-mark" to="/auth/signup">
                회원가입
              </Link>
            )}
          </p>
          {!mine && <p className="la-signup-note">가입하면 내 사전에 밑줄이 남아요.</p>}
          {failed && (
            <p className="la-note" role="alert">
              표제어 목록을 불러오지 못했습니다. 새로고침하거나 표제어 둘러보기로 가 주세요.
            </p>
          )}
        </article>

        {demo ? <SketchFigure term={demo} mine={mine} /> : <figure className="la-fig la-fig-wait" aria-busy="true" aria-label="그림을 불러오는 중" />}
      </div>

      <section ref={indexRef} id="la-index" className={inView ? "la-index is-inview" : "la-index"} aria-labelledby="la-index-title">
        <div className="la-index-head">
          <h2 id="la-index-title">표제어 색인</h2>
          <p>
            {total === undefined
              ? "표제어를 불러오는 중입니다."
              : mine
                ? `가나다순 ${total}개. 밑줄은 내가 끝까지 읽은 표제어다.`
                : `가나다순 ${total}개, 모두 로그인 없이 볼 수 있다. 「미리보기」 표지가 붙은 밑줄은 가입하면 생기는 모습이다.`}
          </p>
        </div>
        {/* 엄지 색인: 분야별로 색인을 좁힌다 */}
        <nav className="la-thumbs" aria-label="분야별 엄지 색인">
          <button type="button" className="la-thumb" aria-pressed={cat === "all"} onClick={() => setCat("all")}>
            전체 <span className="la-thumb-count">{total ?? ""}</span>
          </button>
          {data?.groups.map(([c, list]) => (
            <button key={c} type="button" className={`la-thumb la-tab-${c}`} aria-pressed={cat === c} onClick={() => setCat(c)}>
              {CATEGORY_LABELS[c]} <span className="la-thumb-count">{list.length}</span>
            </button>
          ))}
        </nav>
        <div className="la-columns">
          {sections.map(({ head, terms }) => (
            <section key={head} className="la-letter" aria-label={`${head}(으)로 시작하는 표제어`}>
              <h3 aria-hidden="true">{head}</h3>
              <ul>
                {terms.map((t) => {
                  const on = lined.has(t.id);
                  const see = t.related.map((id) => byId.get(id)).filter((r): r is IndexEntry => !!r);
                  return (
                    <li key={t.id}>
                      <Link to={`/terms/${t.id}`} className="la-word">
                        <span className={on ? "la-hl is-on" : "la-hl"}>{t.name}</span>
                        {on && <span className="visually-hidden">{mine ? " (읽음)" : " (밑줄 미리보기)"}</span>}
                      </Link>
                      {t.englishName && (
                        <span className="la-en" lang="en">
                          {t.englishName}
                        </span>
                      )}
                      <span className={`la-field la-tab-${t.category}`}>「{CATEGORY_LABELS[t.category]}」</span>
                      {on && !mine && (
                        <span className="la-preview" aria-hidden="true">
                          미리보기
                        </span>
                      )}
                      {t.id === resumeId && (
                        <span className="la-resume">
                          책갈피<span className="visually-hidden">: 읽다 만 쪽{mine ? "" : " (미리보기)"}</span>
                          {!mine && <span aria-hidden="true"> · 미리보기</span>}
                        </span>
                      )}
                      <p className="la-def">
                        {t.summary}
                        <span className="la-meta">
                          {" "}
                          〔<span className="la-num">{t.stepCount}</span>단계
                          {t.defenseCount > 0 && (
                            <>
                              , 방어 <span className="la-num">{t.defenseCount}</span>
                            </>
                          )}
                          〕
                        </span>
                      </p>
                      {see.length > 0 && <SeeAlso list={see} />}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </section>

      <section ref={bookRef} className={bookInView ? "la-bookmark is-inview" : "la-bookmark"} aria-labelledby="la-bm-title">
        <span className="la-ribbon" aria-hidden="true" />
        <div className="la-bm-text">
          <h2 id="la-bm-title">{mine ? "내 사전의 밑줄" : "읽은 만큼 밑줄이 쌓이는 사전"}</h2>
          <p>
            {mine
              ? "끝까지 본 표제어에 밑줄이 그어지고, 분야마다 몇 개를 읽었는지 쌓인다. 다른 브라우저에서도 같다."
              : "종이 사전에 형광펜을 긋듯, 끝까지 본 표제어에 밑줄이 남습니다. 기록은 계정에 저장되어 다른 브라우저에서 열어도 같은 곳에서 이어집니다."}
          </p>
          <dl className="la-bm-list">
            <div>
              <dt>밑줄</dt>
              <dd>끝까지 본 표제어에 형광펜 밑줄이 그어진다.</dd>
            </div>
            <div>
              <dt>분야별 진행률</dt>
              <dd>분야마다 밑줄 친 표제어가 몇 개인지 쌓인다.</dd>
            </div>
            <div>
              <dt>책갈피</dt>
              <dd>읽다 만 표제어에 책갈피가 꽂히고, 최근 본 표제어가 목록 첫머리에 남는다.</dd>
            </div>
          </dl>
          <p className="la-actions">
            {mine ? (
              <Link className="la-btn la-btn-ink" to="/me">
                내 학습 보기
              </Link>
            ) : (
              <>
                <Link className="la-btn la-btn-mark" to="/auth/signup">
                  회원가입
                </Link>
                <Link className="la-btn" to="/auth/login">
                  로그인
                </Link>
              </>
            )}
          </p>
        </div>
        {data && <Ledger groups={data.groups} lined={lined} mine={mine} byId={byId} resume={resumeId ? byId.get(resumeId) : undefined} />}
      </section>
    </div>
  );
}

/** 요소의 일부가 처음 화면에 들어왔는지(한 번 true가 되면 그대로) */
function useInView(ready: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen || !ready) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setSeen(true), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, ready]);
  return [ref, seen] as const;
}

/** 사전의 "→ 참조": 관련 표제어 링크 */
const SeeAlso = ({ list }: { list: IndexEntry[] }) => (
  <p className="la-see">
    <span aria-hidden="true">→ </span>
    <span className="visually-hidden">참조: </span>
    {list.map((r, i) => (
      <span key={r.id}>
        {i > 0 && ", "}
        <Link to={`/terms/${r.id}`}>{r.name}</Link>
      </span>
    ))}
  </p>
);

/** 분야별 진행률 장부: 내 기록이면 실제 값, 아니면 색인의 밑줄 미리보기 두 개를 읽었다고 할 때의 모습 */
function Ledger({ groups, lined, mine, byId, resume }: { groups: LandingData["groups"]; lined: Set<string>; mine: boolean; byId: Map<string, IndexEntry>; resume?: IndexEntry }) {
  const names = [...lined].map((id) => byId.get(id)?.name).filter(Boolean);
  return (
    <figure className="la-ledger" aria-labelledby="la-ledger-cap">
      <figcaption id="la-ledger-cap">
        {mine ? "분야별 진행률" : "미리보기"}
        {!mine && names.length > 0 && <span>색인에서 밑줄 친 {names.join("·")}를 읽었다면</span>}
      </figcaption>
      <ul>
        {groups.map(([c, list]) => {
          const read = list.filter((t) => lined.has(t.id)).length;
          return (
            <li key={c} className={`la-tab-${c}`}>
              <span>{CATEGORY_LABELS[c]}</span>
              <span className="la-ledger-bar" aria-hidden="true">
                <span style={{ width: `${(read / list.length) * 100}%` }} />
              </span>
              <span className="la-num">
                {read} / {list.length}
              </span>
            </li>
          );
        })}
      </ul>
      {resume && (
        <p className="la-ledger-resume">
          <span className="la-resume">책갈피</span> 읽다 만 쪽: <Link to={`/terms/${resume.id}`}>{resume.name}</Link>
          {!mine && " (미리보기)"}
        </p>
      )}
    </figure>
  );
}
