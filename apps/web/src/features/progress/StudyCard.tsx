// 용어 쪽의 "완독" 메모(FR-PRG-02): 로그아웃이면 로그인 안내, 로그인이면 完 도장(+완독한 날)과 직접 표시·취소. 저장 실패는 알리기만 하고 재생은 그대로(NFR-02)
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { loginPath } from "../auth/safeNext.ts";
import { useAuth } from "../auth/store.ts";
import { Seal, sealDate, sealLabel } from "../dictionary/Seal.tsx";
import { isRead, progress, readAt, useProgress } from "./store.ts";

export const SAVE_FAILED = "기록을 저장하지 못했어요. 재생은 그대로 할 수 있어요. 잠시 후 다시 시도해 주세요.";

/** press = 이 쪽을 보는 동안 완독이 됐다(도장이 쾅 찍히는 움직임, TermPage가 정한다) */
export function StudyCard({ termId, saveError, press = false }: { termId: string; saveError?: string; press?: boolean }) {
  const auth = useAuth();
  const state = useProgress();
  const { pathname } = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (auth.status !== "user") {
    return (
      <aside className="la-margin study-card" aria-labelledby="study-h">
        <h2 id="study-h">완독</h2>
        <p>로그인하면 끝까지 본 용어에 完 도장이 찍혀요.</p>
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
      <h2 id="study-h">완독</h2>
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
          {read ? (
            <p className={press ? "la-seal-stamp is-press" : "la-seal-stamp"} title={sealLabel(at)}>
              <Seal size={88} />
              {at && (
                <span className="la-seal-date" aria-hidden="true">
                  {sealDate(at).short}
                </span>
              )}
              <span className="visually-hidden">{sealLabel(at)}</span>
            </p>
          ) : (
            <p className="study-status">아직 안 읽음</p>
          )}
          <p>{read ? "다시 읽고 싶으면 완독을 취소할 수 있어요." : "애니메이션을 끝까지 보면 完 도장이 찍혀요."}</p>
          <button type="button" className="la-btn la-btn-sm study-login" onClick={toggle} disabled={busy}>
            {read ? "완독 취소" : "완독으로 표시"}
          </button>
        </>
      )}
      <p className="form-error" role="alert">
        {error ?? saveError}
      </p>
    </aside>
  );
}
