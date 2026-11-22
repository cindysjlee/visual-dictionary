// 랜딩 "사전 지면": 종이 사전의 한 쪽을 펼친 것처럼 '시각화 사전'을 표제어로 풀이한다.
// 쪽 머리(찾아보기) → 표제어 풀이 ①②③ + [그림 1](예시 용어의 공격/방어 단계, 행위자 등각 그림) → 가나다 색인(읽은 표제어에 형광펜 밑줄) → 책갈피(가입).
// 밑줄: 로그인해 기록을 불러왔으면(/about) 실제로 읽은 표제어, 아니면 "미리보기" 표시를 단 두 표제어에만 긋는다(지어낸 진행률 없음)
import { useMemo, useState } from "react";
import { Form, Link } from "react-router";
import type { Category } from "@app/content-schema";
import { CATEGORY_LABELS } from "@app/content-schema/labels";
import { IndexColumns, Ledger, Thumbs, useInView } from "../dictionary/Dictionary.tsx";
import { isRead, useProgress, useRecent } from "../progress/store.ts";
import SketchFigure from "./SketchFigure.tsx";
import { josa, type LandingData } from "./LandingPage.tsx";

type Props = { data: LandingData | null; failed: boolean };

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

  const shown = (data?.index ?? []).filter((t) => cat === "all" || t.category === cat);

  // 색인·책갈피가 화면에 들어오면 밑줄·장부를 한 번 긋는다(동작 줄이기면 처음부터 그어져 있다, dictionary.css)
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
                내 단어장 보기
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
        {data && <Thumbs label="분야별 엄지 색인" groups={data.groups} total={data.index.length} value={cat} onChange={setCat} />}
        <IndexColumns terms={shown} byId={byId} lined={lined} resumeId={resumeId} preview={!mine} />
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
                내 단어장 보기
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
        {data && (
          <Ledger
            groups={data.groups}
            lined={lined}
            caption={mine ? "분야별 진행률" : "미리보기"}
            note={!mine && lined.size > 0 ? `색인에서 밑줄 친 ${[...lined].map((id) => byId.get(id)?.name).join("·")}를 읽었다면` : undefined}
            resume={resumeId ? byId.get(resumeId) : undefined}
            resumeNote={mine ? undefined : " (미리보기)"}
          />
        )}
      </section>
    </div>
  );
}
