// 로그인(FR-AUTH-03). 성공하면 next(사이트 안 경로)로, 이메일 인증이 아직이면 코드 입력 화면으로
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { AuthCard, Field, Message, useNavState, useNext, useSubmit } from "./AuthForm.tsx";
import { auth, useAuth } from "./store.ts";

export default function LoginPage() {
  const nav = useNavState();
  const { next, query } = useNext();
  const navigate = useNavigate();
  const state = useAuth();
  const [email, setEmail] = useState(nav.email ?? "");
  const [password, setPassword] = useState("");
  const { busy, error, onSubmit } = useSubmit(async () => {
    const result = await auth.signIn(email.trim(), password);
    if (result === "confirm") navigate(`/auth/confirm${query}`, { state: { email: email.trim(), notice: "이메일 인증이 아직 끝나지 않았어요. 메일로 새 코드를 보냈어요." } });
    else navigate(next, { replace: true });
  });

  if (state.status === "user") return <Navigate to={next} replace />;

  return (
    <AuthCard title="로그인" lead="로그인하면 다 본 용어가 기록되어 다른 기기에서도 이어서 볼 수 있어요.">
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <Field label="이메일" name="email" type="email" autoComplete="email" value={email} onChange={setEmail} />
        <Field label="비밀번호" name="password" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
        <Message error={error} notice={nav.notice} />
        <button type="submit" className="btn btn-cta" disabled={busy || !email || !password}>
          {busy ? "로그인하는 중…" : "로그인"}
        </button>
      </form>
      <div className="auth-links">
        <Link to={`/auth/reset${query}`} state={{ email }}>
          비밀번호를 잊었어요
        </Link>
        <Link to={`/auth/signup${query}`}>회원가입</Link>
      </div>
    </AuthCard>
  );
}
