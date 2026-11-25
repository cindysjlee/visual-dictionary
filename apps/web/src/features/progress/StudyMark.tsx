// 용어 쪽 완독 표시(FR-PRG-01·02, CH-67): 플레이어가 마지막 단계에 순서대로(재생·다음) 도착하면 完 도장이 자동으로 찍힌다.
// 제목 줄 오른쪽에 큰 도장(날짜·완독 취소 / 안 찍음 / 다시 찍기), 플레이어 아래에 찍힘·취소 알림(약 6초)과 비로그인 안내.
// 취소한 용어는 자동으로 다시 찍지 않는다: 저장된 기록이 read=false이면 "취소함"이다(새 필드 없음). 저장이 실패해도 재생은 그대로(NFR-02)
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { loginPath } from "../auth/safeNext.ts";
import { useAuth } from "../auth/store.ts";
import { Seal, sealDate } from "../dictionary/Seal.tsx";
import type { ReadSource } from "./api.ts";
import { progress, readAt, useProgress } from "./store.ts";

export const SAVE_FAILED = "기록을 저장하지 못했어요. 재생은 그대로 할 수 있어요. 잠시 후 다시 시도해 주세요.";
/** 알림이 떠 있는 시간(ms). 취소 버튼에 포커스나 마우스가 있는 동안은 사라지지 않는다 */
export const NOTICE_MS = 6000;

type Notice = { id: number; kind: "stamped" | "cancelled" | "failed" };

/** 이 용어의 완독 상태와 동작: 자동 찍기(플레이어 끝), 취소, 다시 찍기 */
export function useStudy(termId: string) {
  const auth = useAuth();
  const state = useProgress();
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState(false);
  const [reached, setReached] = useState(false);
  const handled = useRef(false);
  const seq = useRef(0);

  const clearNotice = useCallback(() => setNotice(undefined), []);
  const entry = auth.status === "user" && state.status === "ready" ? state.records[termId] : undefined;
  const read = entry?.read === true;
  /** 찍었다가 취소한 용어(기록은 있고 read=false). 이 용어는 자동으로 다시 찍지 않는다 */
  const cancelled = entry !== undefined && !entry.read;

  const save = useCallback(
    async (next: boolean, source: ReadSource) => {
      setBusy(true);
      try {
        await progress.setRead(termId, next, source);
        setNotice({ id: ++seq.current, kind: next ? "stamped" : "cancelled" });
      } catch {
        setNotice({ id: ++seq.current, kind: "failed" });
      } finally {
        setBusy(false);
      }
    },
    [termId],
  );

  // 플레이어의 "끝까지 봄"(재생·다음으로 마지막 단계에 도착, 건너뛰기는 제외 — 엔진이 가린다). 기록을 불러오기 전이면 불러온 뒤에 처리한다
  const onComplete = useCallback(() => setReached(true), []);
  useEffect(() => {
    if (!reached || handled.current || auth.status !== "user" || state.status !== "ready") return;
    handled.current = true;
    if (state.records[termId]) return; // 이미 찍었거나 취소한 용어
    void save(true, "completed");
  }, [reached, auth.status, state, termId, save]);

  return {
    auth,
    state,
    read,
    cancelled,
    at: readAt(state, termId),
    busy,
    notice,
    clearNotice,
    onComplete,
    cancel: () => save(false, "manual"),
    restamp: () => save(true, "manual"),
  };
}
export type Study = ReturnType<typeof useStudy>;

/** 제목 줄 오른쪽의 큰 完 도장. 상태: 찍힘(날짜·완독 취소) / 아직 안 찍음(흐린 윤곽·안내) / 취소함(흐린 윤곽·다시 찍기).
 *  비로그인에는 두지 않는다(플레이어 아래 안내가 대신한다). 읽어 주는 이름은 "완독함, 2026년 11월 24일" */
export function TitleStamp({ study }: { study: Study }) {
  const { auth, state, read, cancelled, at, busy } = study;
  const [press, setPress] = useState(false);
  const was = useRef<boolean>(undefined);
  useEffect(() => {
    if (state.status !== "ready" || auth.status !== "user") return;
    if (was.current === false && read) setPress(true);
    was.current = read;
  }, [read, state.status, auth.status]);

  if (auth.status === "loading" || (auth.status === "user" && state.status === "loading")) return <div className="la-term-stamp is-pending" aria-hidden="true" />;
  if (auth.status !== "user") return null;
  if (state.status === "error") {
    return (
      <div className="la-term-stamp">
        <p className="la-stamp-text">기록을 불러오지 못했어요.</p>
        <button type="button" className="la-stamp-btn" onClick={() => progress.reload()}>
          다시 불러오기
        </button>
      </div>
    );
  }
  if (state.status !== "ready") return null;

  const label = at ? `완독함, ${sealDate(at).long}` : "완독함";
  return (
    <div className={`la-term-stamp${press ? " is-press" : ""}${read ? "" : " is-empty"}`}>
      {read ? (
        <>
          <span role="img" aria-label={label} title={label} className="la-stamp-img">
            <Seal size={92} />
          </span>
          {at && (
            <span className="la-seal-date" aria-hidden="true">
              {sealDate(at).short}
            </span>
          )}
          <button type="button" className="la-stamp-btn" onClick={() => void study.cancel()} disabled={busy}>
            완독 취소
          </button>
        </>
      ) : (
        <>
          <span className="la-stamp-img" aria-hidden="true">
            <Seal size={92} ghost />
          </span>
          {cancelled ? (
            <button type="button" className="la-stamp-btn" onClick={() => void study.restamp()} disabled={busy}>
              다시 찍기
            </button>
          ) : (
            <p className="la-stamp-text">애니메이션을 끝까지 보면 찍혀요</p>
          )}
        </>
      )}
    </div>
  );
}

/** 플레이어 아래 한 줄: 비로그인 안내(항상) + 도장을 찍거나 취소한 순간의 알림(role=status, 약 6초) */
export function StampNote({ study }: { study: Study }) {
  const { auth, notice, clearNotice } = study;
  const { pathname } = useLocation();
  const hold = useRef({ focus: false, hover: false, expired: false });
  const id = notice?.id;
  useEffect(() => {
    if (id === undefined) return;
    const h = hold.current;
    h.expired = false;
    const timer = setTimeout(() => {
      if (h.focus || h.hover) h.expired = true; // 취소 버튼에 포커스·마우스가 있으면 떠나는 순간에 사라진다
      else clearNotice();
    }, NOTICE_MS);
    return () => clearTimeout(timer);
  }, [id, clearNotice]);
  const release = (part: "focus" | "hover", on: boolean) => {
    const h = hold.current;
    h[part] = on;
    if (!on && h.expired && !h.focus && !h.hover) clearNotice();
  };

  return (
    <div className="la-stamp-note">
      {auth.status === "anon" && (
        <p className="la-stamp-hint">
          로그인하면 완독이 기록돼요 ·{" "}
          <Link to={loginPath(pathname)} className="la-stamp-link">
            로그인
          </Link>
        </p>
      )}
      <div
        role="status"
        className="la-stamp-live"
        onFocus={() => release("focus", true)}
        onBlur={() => release("focus", false)}
        onMouseEnter={() => release("hover", true)}
        onMouseLeave={() => release("hover", false)}
      >
        {notice?.kind === "stamped" && (
          <p className="la-stamp-notice">
            完 도장이 찍혔어요 ·{" "}
            <button type="button" className="la-stamp-btn" aria-label="방금 찍은 도장 취소" onClick={() => void study.cancel()} disabled={study.busy}>
              취소
            </button>
          </p>
        )}
        {notice?.kind === "cancelled" && <p className="la-stamp-notice">完 도장을 취소했어요. 제목 옆의 “다시 찍기”로 다시 찍을 수 있어요.</p>}
        {notice?.kind === "failed" && (
          <p className="la-stamp-notice form-error" role="alert">
            {SAVE_FAILED}
          </p>
        )}
      </div>
    </div>
  );
}
