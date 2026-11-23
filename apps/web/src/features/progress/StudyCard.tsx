// 표제어 한 쪽의 "다 읽음" 메모(FR-PRG-02): 로그아웃이면 로그인 안내, 로그인이면 다 읽음(完 도장) 상태와 직접 표시·취소. 저장 실패는 알리기만 하고 재생은 그대로(NFR-02)
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { loginPath } from "../auth/safeNext.ts";
import { useAuth } from "../auth/store.ts";
import { sealDate } from "../dictionary/Seal.tsx";
import { isRead, progress, readAt, useProgress } from "./store.ts";

export const SAVE_FAILED = "기록을 저장하지 못했어요. 재생은 그대로 할 수 있어요. 잠시 후 다시 시도해 주세요.";

export function StudyCard({ termId, saveError }: { termId: string; saveError?: string }) {
  const auth = useAuth();
  const state = useProgress();
  const { pathname } = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (auth.status !== "user") {
    return (
      <aside className="la-margin study-card" aria-labelledby="study-h">
        <h2 id="study-h">다 읽음</h2>
        <p>로그인하면 끝까지 본 표제어에 完 도장이 찍혀요.</p>
        <Link to={loginPath(pathname)} className="la-btn la-btn-sm study-login">
          로그인하고 完 도장 남기기
        </Link>
      </aside>
    );
  }

  const read = isRead(state, termId);
  const at = readAt(state, termId);
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
    <aside className="la-margin study-card" aria-labelledby="study-h">
      <h2 id="study-h">다 읽음</h2>
      {state.status === "loading" && <p>기록을 불러오는 중…</p>}
      {state.status === "error" && (
        <>
          <p>기록을 불러오지 못했어요. 재생은 그대로 할 수 있어요.</p>
          <button type="button" className="la-btn la-btn-sm study-login" onClick={() => progress.reload()}>
            다시 불러오기
          </button>
        </>
      )}
      {state.status === "ready" && (
        <>
          <p className={`study-status${read ? " is-read" : ""}`}>{read ? `完 다 읽음${at ? ` · ${sealDate(at).short}` : ""}` : "아직 안 읽음"}</p>
          <p>{read ? "다시 볼 표제어로 두려면 다 읽음을 취소하세요." : "그림 1을 끝까지 보면 完 도장이 찍혀요."}</p>
          <button type="button" className="la-btn la-btn-sm study-login" aria-pressed={read} onClick={toggle} disabled={busy}>
            {read ? "다 읽음 취소" : "다 읽음으로 표시"}
          </button>
        </>
      )}
      <p className="form-error" role="alert">
        {error ?? saveError}
      </p>
    </aside>
  );
}
