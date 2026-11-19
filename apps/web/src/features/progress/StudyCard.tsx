// 상세 페이지 "학습 상태" 카드(FR-PRG-02): 로그아웃이면 로그인 안내, 로그인이면 읽음 상태와 직접 전환. 저장 실패는 알리기만 하고 재생은 그대로(NFR-02)
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { loginPath } from "../auth/safeNext.ts";
import { useAuth } from "../auth/store.ts";
import { isRead, progress, useProgress } from "./store.ts";

export const SAVE_FAILED = "기록을 저장하지 못했어요. 재생은 그대로 할 수 있어요. 잠시 후 다시 시도해 주세요.";

export function StudyCard({ termId, saveError }: { termId: string; saveError?: string }) {
  const auth = useAuth();
  const state = useProgress();
  const { pathname } = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (auth.status !== "user") {
    return (
      <div className="glass card card-lg study-card">
        <h2 className="card-title">학습 상태</h2>
        <p className="muted">로그인하면 끝까지 재생한 용어가 자동으로 읽음 처리돼요.</p>
        <Link to={loginPath(pathname)} className="btn btn-sm study-login">
          로그인
        </Link>
      </div>
    );
  }

  const read = isRead(state, termId);
  const toggle = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await progress.setRead(termId, !read, "manual");
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass card card-lg study-card">
      <h2 className="card-title">학습 상태</h2>
      {state.status === "loading" && <p className="muted">기록을 불러오는 중…</p>}
      {state.status === "error" && (
        <>
          <p className="muted">기록을 불러오지 못했어요. 재생은 그대로 할 수 있어요.</p>
          <button type="button" className="btn btn-sm study-login" onClick={() => progress.reload()}>
            다시 불러오기
          </button>
        </>
      )}
      {state.status === "ready" && (
        <>
          <p className={`study-status${read ? " is-read" : ""}`}>
            <span aria-hidden="true">{read ? "✓" : "○"}</span> {read ? "읽음" : "아직 안 읽음"}
          </p>
          <p className="muted">{read ? "다시 복습하고 싶으면 안 읽음으로 되돌릴 수 있어요." : "끝까지 재생하면 자동으로 읽음이 돼요."}</p>
          <button type="button" className="btn btn-sm study-login" onClick={toggle} disabled={busy}>
            {read ? "안 읽음으로 되돌리기" : "읽음으로 표시"}
          </button>
        </>
      )}
      <p className="form-error" role="alert">
        {error ?? saveError}
      </p>
    </div>
  );
}
