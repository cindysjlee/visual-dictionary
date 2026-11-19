// /auth/* 화면 공통 조각: 카드, 입력칸, 오류·안내 영역, 제출 처리. 이메일은 URL이 아니라 라우터 state로 넘긴다(주소창·기록에 개인정보를 남기지 않음)
import { useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router";
import { FAKE_AUTH, FAKE_CODE } from "./client.ts";
import { authMessage } from "./errors.ts";
import { PASSWORD_RULES } from "./password.ts";
import { safeNext } from "./safeNext.ts";

export type AuthNavState = { email?: string; notice?: string } | null;

/** 지금 화면의 next(검증된 사이트 안 경로)와 다음 화면에 그대로 넘길 쿼리 */
export function useNext() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"), location.origin);
  return { next, query: next === "/" ? "" : `?next=${encodeURIComponent(next)}` };
}

export const useNavState = () => (useLocation().state as AuthNavState) ?? {};

export function AuthCard({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="auth-wrap">
      <div className="glass card card-lg auth-card">
        <h1 className="auth-title">{title}</h1>
        {lead && <p className="muted">{lead}</p>}
        {/* 개발 서버·테스트 빌드에서 실제 가입으로 착각하지 않게(배포 빌드에는 이 분기가 없다) */}
        {FAKE_AUTH && (
          <p className="fake-auth-note" role="note">
            개발용 가짜 인증이에요. 실제로 가입되지 않고 메일도 가지 않아요. 인증 코드는 {FAKE_CODE}이에요.
          </p>
        )}
        {children}
      </div>
    </section>
  );
}

type FieldProps = {
  label: string;
  name: string;
  type?: "email" | "password" | "text";
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
  describedBy?: string;
  inputMode?: "numeric";
  maxLength?: number;
};

export function Field({ label, name, type = "text", autoComplete, value, onChange, describedBy, inputMode, maxLength }: FieldProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="search field-box">
        <input
          name={name}
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
          inputMode={inputMode}
          maxLength={maxLength}
          required
        />
      </span>
    </label>
  );
}

/** 비밀번호 조건 목록: 입력하는 동안 충족 여부를 보인다(색이 아니라 기호와 숨은 글자로도) */
export function PasswordRules({ password }: { password: string }) {
  return (
    <ul id="password-rules" className="password-rules" aria-label="비밀번호 조건">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        return (
          <li key={r.id} className={ok ? "is-ok" : undefined}>
            <span aria-hidden="true">{ok ? "✓" : "·"}</span> {r.label}
            <span className="visually-hidden">{ok ? " 충족" : " 미충족"}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** 오류는 role=alert, 안내는 role=status. 둘 다 없으면 자리만(레이아웃이 흔들리지 않게) */
export function Message({ error, notice }: { error?: string; notice?: string }) {
  return (
    <>
      <p className="form-error" role="alert">
        {error}
      </p>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
    </>
  );
}

/** 제출: 진행 중에는 버튼을 막고, 실패하면 한국어 오류. check가 문자열을 돌려주면 보내지 않고 그 문구를 보인다 */
export function useSubmit(run: () => Promise<void>, check?: () => string | undefined) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = check?.();
    if (problem) return setError(problem);
    setBusy(true);
    setError(undefined);
    try {
      await run();
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, onSubmit };
}
