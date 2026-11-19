// 이메일 인증 코드 입력(FR-AUTH-02). 같은 탭에서 가입한 직후면 바로 로그인해 next로, 아니면 로그인 화면으로
import { useState } from "react";
import { useNavigate } from "react-router";
import { AuthCard, Field, Message, useNavState, useNext, useSubmit } from "./AuthForm.tsx";
import { authMessage } from "./errors.ts";
import { auth } from "./store.ts";

export default function ConfirmPage() {
  const nav = useNavState();
  const { next, query } = useNext();
  const navigate = useNavigate();
  const [email, setEmail] = useState(nav.email ?? "");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState(nav.notice);
  const { busy, error, setError, onSubmit } = useSubmit(async () => {
    const signedIn = await auth.confirmSignUp(email.trim(), code.trim());
    if (signedIn) navigate(next, { replace: true });
    else navigate(`/auth/login${query}`, { replace: true, state: { email: email.trim(), notice: "인증이 끝났어요. 로그인해 주세요." } });
  });

  const resend = async () => {
    setError(undefined);
    try {
      await auth.resendSignUpCode(email.trim());
      setNotice("새 인증 코드를 보냈어요. 가장 최근 메일의 코드를 입력해 주세요.");
    } catch (e) {
      setError(authMessage(e));
    }
  };

  return (
    <AuthCard title="이메일 인증" lead="메일로 받은 6자리 코드를 입력해 주세요. 코드는 24시간 동안 쓸 수 있어요.">
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <Field label="이메일" name="email" type="email" autoComplete="email" value={email} onChange={setEmail} />
        <Field label="인증 코드" name="code" autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={setCode} />
        <Message error={error} notice={notice} />
        <button type="submit" className="btn btn-cta" disabled={busy || !email || code.trim().length < 6}>
          {busy ? "확인하는 중…" : "인증하기"}
        </button>
      </form>
      <div className="auth-links">
        <button type="button" className="link-btn" onClick={resend} disabled={!email}>
          코드 다시 받기
        </button>
      </div>
    </AuthCard>
  );
}
