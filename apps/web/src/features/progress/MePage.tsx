// 내 학습(/me): 진행률, 읽은·안 읽은 용어, 계정 설정(로그아웃, 회원 탈퇴). docs/05 내 학습
// 탈퇴(FR-AUTH-06): 비밀번호를 Cognito로 다시 확인해야 탈퇴 버튼이 켜지고, 확인 대화상자에서 한 번 더 묻는다
import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import type { IndexEntry } from "@app/content-schema";
import { useJson } from "../../useJson.ts";
import { Field } from "../auth/AuthForm.tsx";
import { authMessage } from "../auth/errors.ts";
import { loginPath } from "../auth/safeNext.ts";
import { auth, useAuth } from "../auth/store.ts";
import { ProgressError } from "./api.ts";
import { ProgressSummary } from "./ProgressSummary.tsx";
import { daysAgoLabel, recentTerms } from "./recent.ts";
import { isRead, progress, useProgress, useRecent } from "./store.ts";

function TermList({ title, terms }: { title: string; terms: IndexEntry[] }) {
  return (
    <div className="glass card span-2">
      <h2 className="card-title">
        {title} <span className="muted">{terms.length}</span>
      </h2>
      {terms.length === 0 ? (
        <p className="muted">아직 없어요.</p>
      ) : (
        <ul className="me-terms">
          {terms.map((t) => (
            <li key={t.id}>
              <Link to={`/terms/${t.id}`}>{t.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Withdraw({ leave }: { leave: () => void }) {
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

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
      void navigate("/", { replace: true, state: { notice: "탈퇴했어요. 계정과 학습 기록이 모두 삭제됐어요." } });
      await auth.signOutAfterWithdraw();
    } catch (err) {
      dialog.current?.close();
      if (err instanceof ProgressError && err.name === "ReauthRequired") {
        // 서버는 최근 5분 안에 인증한 토큰만 받는다: 재확인부터 다시
        setVerified(false);
        setPassword("");
        setError("비밀번호를 확인한 지 5분이 지났어요. 다시 확인한 뒤 탈퇴해 주세요.");
        return;
      }
      setError("탈퇴하지 못했어요. 계정과 기록은 그대로예요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass card span-2 withdraw">
      <h2 className="card-title">회원 탈퇴</h2>
      <p className="muted">탈퇴하면 계정과 학습 기록이 모두 삭제되고 되돌릴 수 없어요. 본인 확인을 위해 비밀번호를 다시 입력해 주세요.</p>
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
          <button type="submit" className="btn btn-sm" disabled={busy || !password || verified}>
            비밀번호 확인
          </button>
          <button type="button" className="btn btn-sm btn-danger" disabled={!verified || busy} onClick={() => dialog.current?.showModal()}>
            탈퇴하기
          </button>
        </div>
      </form>
      <dialog ref={dialog} className="glass card card-lg confirm-dialog" aria-labelledby="withdraw-title">
        <h2 id="withdraw-title" className="card-title">
          정말 탈퇴할까요?
        </h2>
        <p>계정과 모든 학습 기록이 삭제되며 되돌릴 수 없어요.</p>
        <div className="withdraw-actions">
          <button type="button" className="btn btn-sm" onClick={() => dialog.current?.close()} disabled={busy} autoFocus>
            취소
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={confirm} disabled={busy}>
            {busy ? "탈퇴하는 중…" : "탈퇴"}
          </button>
        </div>
      </dialog>
    </div>
  );
}

/** 최근 본 용어 10개(FR-PRG-06, 30일 보존) */
function RecentList({ index }: { index: IndexEntry[] }) {
  const items = recentTerms(useRecent(), index, 10);
  return (
    <div className="glass card span-2">
      <h2 className="card-title">최근 본 용어</h2>
      {items.length === 0 ? (
        <p className="muted">아직 없어요. 용어를 열어 보면 30일 동안 여기에 남아요.</p>
      ) : (
        <ul className="recent-list">
          {items.map(({ term, viewedAt }) => (
            <li key={term.id}>
              <Link to={`/terms/${term.id}`}>{term.name}</Link>
              <span className="muted">{daysAgoLabel(viewedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
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
  const index = useJson<IndexEntry[]>("/content/index.json");

  if (user.status === "anon" || user.status === "unavailable") return leaving.current ? null : <Navigate to={loginPath("/me")} replace />;
  if (user.status === "loading") return <p className="muted">불러오는 중…</p>;

  const terms = index.state === "ok" ? index.data : [];
  const records = state.status === "ready" ? state.records : {};
  return (
    <>
      <section className="bento">
        <div className="glass card card-lg span-2">
          <h1 className="auth-title">내 학습</h1>
          <p className="muted">{user.email}</p>
          {state.status === "ready" && index.state === "ok" ? (
            <ProgressSummary index={terms} records={records} />
          ) : state.status === "error" ? (
            <>
              <p className="muted">기록을 불러오지 못했어요.</p>
              <button type="button" className="btn btn-sm study-login" onClick={() => progress.reload()}>
                다시 불러오기
              </button>
            </>
          ) : (
            <p className="muted">기록을 불러오는 중…</p>
          )}
        </div>
        <div className="glass card span-2">
          <h2 className="card-title">계정 설정</h2>
          <p className="muted">로그인한 이메일: {user.email}</p>
          <button
            type="button"
            className="btn btn-sm study-login"
            onClick={() => {
              leave();
              void navigate("/", { replace: true });
              void auth.signOut();
            }}
          >
            로그아웃
          </button>
        </div>
      </section>
      {state.status === "ready" && (
        <section className="bento">
          <TermList title="읽은 용어" terms={terms.filter((t) => isRead(state, t.id))} />
          <TermList title="안 읽은 용어" terms={terms.filter((t) => !isRead(state, t.id))} />
        </section>
      )}
      <section className="bento">
        <RecentList index={terms} />
        <Withdraw leave={leave} />
      </section>
    </>
  );
}
