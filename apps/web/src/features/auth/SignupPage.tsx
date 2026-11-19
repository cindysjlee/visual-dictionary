// 회원가입(FR-AUTH-02): 이메일·비밀번호(8자 이상, 영문·숫자 포함). 이미 가입된 이메일은 요구사항대로 알려 준다(docs/03 보안 메모의 한계)
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { AuthCard, Field, Message, PasswordRules, useNext, useSubmit } from "./AuthForm.tsx";
import { checkNewPassword } from "./password.ts";
import { auth } from "./store.ts";

export default function SignupPage() {
  const { query } = useNext();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const { busy, error, onSubmit } = useSubmit(
    async () => {
      await auth.signUp(email.trim(), password);
      navigate(`/auth/confirm${query}`, { state: { email: email.trim(), notice: "메일로 6자리 인증 코드를 보냈어요." } });
    },
    () => checkNewPassword(password, again),
  );

  return (
    <AuthCard title="회원가입" lead="이메일로 가입하고, 메일로 받은 인증 코드를 입력하면 가입이 끝나요.">
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <Field label="이메일" name="email" type="email" autoComplete="email" value={email} onChange={setEmail} />
        <Field label="비밀번호" name="password" type="password" autoComplete="new-password" value={password} onChange={setPassword} describedBy="password-rules" />
        <PasswordRules password={password} />
        <Field label="비밀번호 확인" name="password-again" type="password" autoComplete="new-password" value={again} onChange={setAgain} />
        <Message error={error} />
        <button type="submit" className="btn btn-cta" disabled={busy || !email || !password || !again}>
          {busy ? "가입하는 중…" : "가입하기"}
        </button>
      </form>
      <div className="auth-links">
        <span className="muted">이미 계정이 있나요?</span>
        <Link to={`/auth/login${query}`}>로그인</Link>
      </div>
    </AuthCard>
  );
}
