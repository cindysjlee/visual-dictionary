// 구글 로그인에서 돌아오는 곳(/auth/callback, Cognito 앱 클라이언트의 콜백 주소). 코드를 토큰으로 바꾸는 일은 인증 구현이 하고,
// 이 화면은 끝나기를 기다렸다가 next(사이트 안 경로만, safeNext로 다시 검증)로 보낸다. 실패하거나 코드 없이 들어오면 안내한다
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AuthCard } from "./AuthForm.tsx";
import { authMessage } from "./errors.ts";
import { safeNext } from "./safeNext.ts";
import { auth } from "./store.ts";

export default function CallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let alive = true;
    auth
      .completeRedirect()
      .then((next) => {
        if (!alive) return;
        if (next === null) setError("로그인 정보가 없어요. 로그인 화면에서 다시 시도해 주세요.");
        else void navigate(safeNext(next, location.origin), { replace: true });
      })
      .catch((e: unknown) => alive && setError(authMessage(e)));
    return () => {
      alive = false;
    };
  }, [navigate]);

  return (
    <AuthCard title={error ? "로그인하지 못했어요" : "로그인하는 중"}>
      {error ? (
        <>
          <p className="form-error" role="alert">
            {error}
          </p>
          <div className="auth-links">
            <Link to="/auth/login">로그인 화면으로</Link>
          </div>
        </>
      ) : (
        <p className="muted" role="status">
          Google 계정을 확인하고 있어요…
        </p>
      )}
    </AuthCard>
  );
}
