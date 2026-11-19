// 비밀번호 재설정(FR-AUTH-05): 이메일 → 메일로 받은 코드와 새 비밀번호. 가입 여부는 드러내지 않는다(코드 단계에서만 실패)
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { AuthCard, Field, Message, PasswordRules, useNavState, useNext, useSubmit } from "./AuthForm.tsx";
import { checkNewPassword } from "./password.ts";
import { auth } from "./store.ts";

export default function ResetPage() {
  const nav = useNavState();
  const { query } = useNext();
  const navigate = useNavigate();
  const [email, setEmail] = useState(nav.email ?? "");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");

  const request = useSubmit(async () => {
    await auth.resetPassword(email.trim());
    setSent(true);
  });
  const confirm = useSubmit(
    async () => {
      await auth.confirmResetPassword(email.trim(), code.trim(), password);
      navigate(`/auth/login${query}`, { replace: true, state: { email: email.trim(), notice: "비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요." } });
    },
    () => checkNewPassword(password, again),
  );

  return (
    <AuthCard title="비밀번호 재설정" lead={sent ? "메일로 받은 6자리 코드와 새 비밀번호를 입력해 주세요." : "가입한 이메일로 인증 코드를 보내 드려요."}>
      {!sent ? (
        <form className="auth-form" onSubmit={request.onSubmit} noValidate>
          <Field label="이메일" name="email" type="email" autoComplete="email" value={email} onChange={setEmail} />
          <Message error={request.error} />
          <button type="submit" className="btn btn-cta" disabled={request.busy || !email}>
            {request.busy ? "보내는 중…" : "인증 코드 받기"}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={confirm.onSubmit} noValidate>
          <Message error={confirm.error} notice="가입된 이메일이라면 인증 코드를 보냈어요." />
          <Field label="인증 코드" name="code" autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={setCode} />
          <Field label="새 비밀번호" name="password" type="password" autoComplete="new-password" value={password} onChange={setPassword} describedBy="password-rules" />
          <PasswordRules password={password} />
          <Field label="새 비밀번호 확인" name="password-again" type="password" autoComplete="new-password" value={again} onChange={setAgain} />
          <button type="submit" className="btn btn-cta" disabled={confirm.busy || code.trim().length < 6 || !password || !again}>
            {confirm.busy ? "바꾸는 중…" : "비밀번호 바꾸기"}
          </button>
        </form>
      )}
      <div className="auth-links">
        <Link to={`/auth/login${query}`}>로그인으로 돌아가기</Link>
      </div>
    </AuthCard>
  );
}
