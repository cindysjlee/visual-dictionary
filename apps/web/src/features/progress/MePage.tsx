// 내 단어장(/me): 분야별 밑줄 장부(진행률) → 책갈피(읽다 만 쪽·최근 본 표제어) → 밑줄 친/아직 밑줄 없는 표제어(분야별) → 계정(로그아웃, 회원 탈퇴). docs/05 내 단어장
// 탈퇴(FR-AUTH-06): 비밀번호를 Cognito로 다시 확인해야 탈퇴 버튼이 켜지고, 확인 대화상자에서 한 번 더 묻는다
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import type { IndexEntry } from "@app/content-schema";
import { useJson } from "../../useJson.ts";
import { Field } from "../auth/AuthForm.tsx";
import { authMessage } from "../auth/errors.ts";
import { loginPath } from "../auth/safeNext.ts";
import { auth, useAuth } from "../auth/store.ts";
import { ProgressError } from "./api.ts";
import { Field as FieldMark, groupByCategory, Ledger } from "../dictionary/Dictionary.tsx";
import { daysAgoLabel, recentTerms } from "./recent.ts";
import { isRead, progress, useProgress, useRecent } from "./store.ts";

/** 분야별로 묶은 표제어 목록. 밑줄 친 쪽은 형광펜 밑줄, 기록은 있지만 안 읽은 표제어에는 책갈피 */
function WordList({ id, title, terms, lined, bookmarked, empty }: { id: string; title: string; terms: IndexEntry[]; lined: boolean; bookmarked: ReadonlySet<string>; empty: ReactNode }) {
  const groups = groupByCategory(terms);
  return (
    <section className="la-words" aria-labelledby={id}>
      <h2 id={id}>
        {title} <span className="la-num">{terms.length}</span>
      </h2>
      {terms.length === 0 ? (
        <p className="la-words-empty">{empty}</p>
      ) : (
        groups.map(([c, list]) => (
          <div key={c} className="la-words-group">
            <h3>
              <FieldMark category={c} />
            </h3>
            <ul>
              {[...list]
                .sort((x, y) => x.name.localeCompare(y.name, "ko"))
                .map((t) => (
                  <li key={t.id}>
                    <Link to={`/terms/${t.id}`} className="la-word">
                      <span className={lined ? "la-hl is-on" : "la-hl"}>{t.name}</span>
                    </Link>
                    {bookmarked.has(t.id) && (
                      <span className="la-resume">
                        책갈피<span className="visually-hidden">: 읽다 만 쪽</span>
                      </span>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

const WITHDRAWN_NOTICE = "탈퇴했어요. 계정과 학습 기록이 모두 삭제됐어요.";

function Withdraw({ leave }: { leave: () => void }) {
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const user = useAuth();
  // 구글 사용자는 비밀번호가 없어 구글 계정 선택을 거친 재로그인으로 확인한다(돌아오면 /me?reauth=1). 화면 표시일 뿐, 실제 판단은 서버의 auth_time 5분 검사
  const google = user.status === "user" && user.provider === "google";
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [verified, setVerified] = useState(() => google && params.get("reauth") === "1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const reauthGoogle = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await auth.reauthWithGoogle("/me?reauth=1"); // 구글로 이동한다
    } catch (err) {
      setError(authMessage(err));
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await auth.verifyPassword(password);
      setVerified(true);
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await progress.withdraw();
      dialog.current?.close();
      // 떠나는 중 표시를 먼저: 로그아웃이 홈 이동보다 먼저 반영돼도 이 화면이 로그인 화면으로 보내지 않는다
      leave();
      // 구글 사용자는 로그아웃이 로그인 도메인(/logout)을 거쳐 첫 화면을 새로 불러온다: 안내를 sessionStorage로 넘긴다(HomePage가 한 번 꺼냄)
      try {
        if (google) sessionStorage.setItem("vd-notice", WITHDRAWN_NOTICE);
      } catch {
        // 저장소를 못 쓰면 안내만 빠진다
      }
      void navigate("/terms", { replace: true, state: { notice: WITHDRAWN_NOTICE } });
      await auth.signOutAfterWithdraw();
    } catch (err) {
      dialog.current?.close();
      if (err instanceof ProgressError && err.name === "ReauthRequired") {
        // 서버는 최근 5분 안에 인증한 토큰만 받는다: 재확인부터 다시
        setVerified(false);
        setPassword("");
        setError(`${google ? "Google 계정을" : "비밀번호를"} 확인한 지 5분이 지났어요. 다시 확인한 뒤 탈퇴해 주세요.`);
        return;
      }
      setError("탈퇴하지 못했어요. 계정과 기록은 그대로예요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="la-withdraw withdraw">
      <h3>회원 탈퇴</h3>
      {google ? (
        <div className="auth-form">
          <p>탈퇴하면 계정과 학습 기록이 모두 삭제되고 되돌릴 수 없어요. 본인 확인을 위해 Google 계정을 다시 선택해 주세요.</p>
          <p className="form-error" role="alert">
            {error}
          </p>
          {verified && (
            <p className="form-notice" role="status">
              Google 계정을 다시 확인했어요. 5분 안에 탈퇴해 주세요.
            </p>
          )}
          <div className="withdraw-actions">
            <button type="button" className="la-btn la-btn-sm" onClick={reauthGoogle} disabled={busy || verified}>
              Google로 다시 확인
            </button>
            <button type="button" className="la-btn la-btn-sm btn-danger" disabled={!verified || busy} onClick={() => dialog.current?.showModal()}>
              탈퇴하기
            </button>
          </div>
        </div>
      ) : (
      <>
      <p>탈퇴하면 계정과 학습 기록이 모두 삭제되고 되돌릴 수 없어요. 본인 확인을 위해 비밀번호를 다시 입력해 주세요.</p>
      <form className="auth-form" onSubmit={verify} noValidate>
        <Field
          label="비밀번호"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            setVerified(false);
          }}
        />
        <p className="form-error" role="alert">
          {error}
        </p>
        {verified && (
          <p className="form-notice" role="status">
            비밀번호를 확인했어요.
          </p>
        )}
        <div className="withdraw-actions">
          <button type="submit" className="la-btn la-btn-sm" disabled={busy || !password || verified}>
            비밀번호 확인
          </button>
          <button type="button" className="la-btn la-btn-sm btn-danger" disabled={!verified || busy} onClick={() => dialog.current?.showModal()}>
            탈퇴하기
          </button>
        </div>
      </form>
      </>
      )}
      <dialog ref={dialog} className="glass card card-lg confirm-dialog" aria-labelledby="withdraw-title">
        <h2 id="withdraw-title" className="card-title">
          정말 탈퇴할까요?
        </h2>
        <p>계정과 모든 학습 기록이 삭제되며 되돌릴 수 없어요.</p>
        <div className="withdraw-actions">
          <button type="button" className="la-btn la-btn-sm" onClick={() => dialog.current?.close()} disabled={busy} autoFocus>
            취소
          </button>
          <button type="button" className="la-btn la-btn-sm btn-danger" onClick={confirm} disabled={busy}>
            {busy ? "탈퇴하는 중…" : "탈퇴"}
          </button>
        </div>
      </dialog>
    </div>
  );
}

/** 최근 본 표제어 10개(FR-PRG-06, 30일 보존) */
function RecentList({ index }: { index: IndexEntry[] }) {
  const items = recentTerms(useRecent(), index, 10);
  return items.length === 0 ? (
    <p>아직 없어요. 표제어를 열어 보면 30일 동안 여기에 남아요.</p>
  ) : (
    <ul className="recent-list">
      {items.map(({ term, viewedAt }) => (
        <li key={term.id}>
          <Link to={`/terms/${term.id}`}>{term.name}</Link>
          <span className="la-meta">{daysAgoLabel(viewedAt)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function MePage() {
  const user = useAuth();
  const navigate = useNavigate();
  const leaving = useRef(false); // 로그아웃·탈퇴로 홈으로 가는 중이면 로그인 화면으로 보내지 않는다
  const leave = () => {
    leaving.current = true;
  };
  const state = useProgress();
  const recent = useRecent();
  const index = useJson<IndexEntry[]>("/content/index.json");

  if (user.status === "anon" || user.status === "unavailable") return leaving.current ? null : <Navigate to={loginPath("/me")} replace />;
  if (user.status === "loading") return <p className="la-loading">불러오는 중…</p>;

  const terms = index.state === "ok" ? index.data : [];
  const ready = state.status === "ready" && index.state === "ok";
  const lined = new Set(ready ? terms.filter((t) => isRead(state, t.id)).map((t) => t.id) : []);
  // 책갈피: 기록은 있지만 아직 밑줄이 없는 표제어 + 최근 본 것 중 안 읽은 것(맨 앞이 읽다 만 쪽)
  const recentUnread = recentTerms(recent, terms, 10).filter(({ term }) => !lined.has(term.id));
  const bookmarked = new Set([...(ready ? Object.keys(state.records).filter((id) => !lined.has(id)) : []), ...recentUnread.map(({ term }) => term.id)]);
  const resume = recentUnread[0]?.term;
  const first = terms.find((t) => t.id === "csrf") ?? terms[0];

  return (
    <div className="la la-page la-me">
      <header className="la-runhead">
        <span className="la-runhead-name">시각화 사전 · 내 단어장</span>
        <span />
        <span className="la-guide">
          밑줄 <span className="la-num">{lined.size}</span> / <span className="la-num">{terms.length}</span>
        </span>
      </header>

      <div className="la-me-head">
        <div>
          <h1 className="la-headword">내 단어장</h1>
          <p className="la-gloss">끝까지 본 표제어에 밑줄을 긋고, 읽다 만 표제어에 책갈피를 꽂아 둔 나만의 사전.</p>
        </div>
        {ready ? (
          <Ledger
            groups={groupByCategory(terms)}
            lined={lined}
            caption="분야별 밑줄 장부"
            resume={resume}
          />
        ) : state.status === "error" ? (
          <p>
            기록을 불러오지 못했어요.{" "}
            <button type="button" className="la-btn la-btn-sm study-login" onClick={() => progress.reload()}>
              다시 불러오기
            </button>
          </p>
        ) : (
          <p>기록을 불러오는 중…</p>
        )}
      </div>

      <section className="la-me-bookmarks" aria-labelledby="me-bm">
        <h2 id="me-bm">책갈피</h2>
        {bookmarked.size > 0 ? (
          <p className="la-me-marks">
            읽다 만 표제어:{" "}
            {terms
              .filter((t) => bookmarked.has(t.id))
              .map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ", "}
                  <Link to={`/terms/${t.id}`}>{t.name}</Link>
                </span>
              ))}
          </p>
        ) : (
          <p className="la-me-sub">읽다 만 표제어가 없다. 열어 보고 끝까지 보지 않은 표제어에 책갈피가 꽂힌다.</p>
        )}
        <h3 className="la-me-h3">최근 본 표제어</h3>
        <RecentList index={terms} />
      </section>

      {ready && (
        <div className="la-me-words">
          <WordList
            id="me-read"
            title="밑줄 친 표제어"
            terms={terms.filter((t) => lined.has(t.id))}
            lined
            bookmarked={new Set()}
            empty={
              <>
                아직 밑줄 친 표제어가 없다. 그림을 끝까지 보면 밑줄이 그어진다.
                {first && (
                  <>
                    {" "}
                    → 처음이라면 <Link to={`/terms/${first.id}`}>{first.name}</Link>
                  </>
                )}
              </>
            }
          />
          <WordList id="me-unread" title="아직 밑줄 없는 표제어" terms={terms.filter((t) => !lined.has(t.id))} lined={false} bookmarked={bookmarked} empty="모든 표제어에 밑줄을 그었다." />
        </div>
      )}

      <section className="la-account" aria-labelledby="me-account">
        <h2 id="me-account">계정</h2>
        <dl className="la-account-list">
          <div>
            <dt>이메일</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>로그인</dt>
            <dd>
              <button
                type="button"
                className="la-btn la-btn-sm study-login"
                onClick={() => {
                  leave();
                  void navigate("/terms", { replace: true });
                  void auth.signOut();
                }}
              >
                로그아웃
              </button>
            </dd>
          </div>
        </dl>
        <Withdraw leave={leave} />
      </section>
    </div>
  );
}
