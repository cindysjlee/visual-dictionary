// [방어 켜기] 스위치(Y2K 볼록 크롬 손잡이). 랜딩의 스크롤 장면과 단계 장부가 함께 쓴다
/** hint: 어떤 방어인지 작은 글자(예: frame-ancestors / X-Frame-Options) */
export default function DefenseSwitch({ on, onChange, disabled, hint }: { on: boolean; onChange: (next: boolean) => void; disabled?: boolean; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="defense-switch" onClick={() => onChange(!on)} disabled={disabled}>
      <span className="defense-switch-track" aria-hidden="true">
        <span className="defense-switch-knob" />
      </span>
      <span className="defense-switch-label">
        방어 켜기
        {hint && <span className="defense-switch-hint">{hint}</span>}
      </span>
    </button>
  );
}
