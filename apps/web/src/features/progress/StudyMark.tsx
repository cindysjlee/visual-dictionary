// 용어 쪽 완독 표시(FR-PRG-02, 2026-11 재배치): 제목 줄 오른쪽 위의 작은 完 도장(완독한 용어에만, 날짜만) + 글 맨 끝의 한 줄 블록(표시·취소·로그인 안내).
// 자동 완독은 없다(끝까지 재생해도 저장하지 않는다). 저장이 실패해도 재생은 그대로(NFR-02)
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { loginPath } from "../auth/safeNext.ts";
import { useAuth } from "../auth/store.ts";
import { Seal, sealDate } from "../dictionary/Seal.tsx";
import { isRead, progress, readAt, useProgress } from "./store.ts";

export const SAVE_FAILED = "기록을 저장하지 못했어요. 재생은 그대로 할 수 있어요. 잠시 후 다시 시도해 주세요.";

/** 제목 줄 오른쪽 위의 작은 完 도장. 완독한 용어에만 보이고 문구·버튼은 없다. 읽어 주는 이름은 "완독함, 2026년 11월 24일".
 *  절대 위치라 제목 줄 높이를 늘리지 않는다. 이 쪽을 보는 동안 안 읽음 → 완독이 되면 쾅 찍힌다(CSS, 동작 줄이기면 처음부터 찍힌 상태) */
export function TitleStamp({ termId }: { termId: string }) {
  const auth = useAuth();
  const state = useProgress();
  const read = auth.status === "user" && isRead(state, termId);
  const wasRead = useRef<boolean>(undefined);
  const [press, setPress] = useState(false);
  useEffect(() => {
    if (state.status !== "ready" || auth.status !== "user") return;
    if (wasRead.current === false && read) setPress(true);
    wasRead.current = read;
  }, [read, state.status, auth.status]);
  if (!read) return null;
  const at = readAt(state, termId);
  const label = at ? `완독함, ${sealDate(at).long}` : "완독함";
  return (
    <span className={press ? "la-term-stamp is-press" : "la-term-stamp"} role="img" aria-label={label} title={label}>
      <Seal size={32} light />
      {at && (
        <span className="la-seal-date" aria-hidden="true">
          {sealDate(at).short}
        </span>
      )}
    </span>
  );
}

/** 글 맨 끝의 한 줄 블록. 로그인·미완독: "다 읽었으면 完 도장 찍기" 버튼 / 로그인·완독: "完 날짜 · 완독 취소" / 비로그인: 로그인 화면으로 가는 링크 */
export function StudyEnd({ termId }: { termId: string }) {
  const auth = useAuth();
  const state = useProgress();
  const { pathname } = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const change = async (read: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      await progress.setRead(termId, read, "manual");
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (auth.status !== "user") {
    body = (
      <Link to={loginPath(pathname)} className="la-study-login">
        로그인하고 完 도장 남기기
      </Link>
    );
  } else if (state.status === "loading") {
    body = <span>기록을 불러오는 중…</span>;
  } else if (state.status === "error") {
    body = (
      <>
        <span>기록을 불러오지 못했어요. 재생은 그대로 할 수 있어요.</span>
        <button type="button" className="la-study-undo" onClick={() => progress.reload()}>
          다시 불러오기
        </button>
      </>
    );
  } else if (isRead(state, termId)) {
    const at = readAt(state, termId);
    body = (
      <>
        <span className="la-study-date">完{at ? ` ${sealDate(at).short}` : ""} ·</span>
        <button type="button" className="la-study-undo" onClick={() => change(false)} disabled={busy}>
          완독 취소
        </button>
      </>
    );
  } else {
    body = (
      <button type="button" className="la-btn la-btn-sm" onClick={() => change(true)} disabled={busy}>
        다 읽었으면 完 도장 찍기
      </button>
    );
  }

  return (
    <div className="la-study-end" role="group" aria-label="완독 표시">
      {body}
      <p className="form-error" role="alert">
        {error}
      </p>
    </div>
  );
}