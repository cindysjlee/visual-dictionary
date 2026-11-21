// [방어 켜기] 스위치(Y2K 볼록 크롬 손잡이). 랜딩의 스크롤 장면과 단계 장부가 함께 쓴다
export default function DefenseSwitch({ on, onChange, disabled }: { on: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="defense-switch" onClick={() => onChange(!on)} disabled={disabled}>
      <span className="defense-switch-track" aria-hidden="true">
        <span className="defense-switch-knob" />
      </span>
      <span className="defense-switch-label">방어 켜기</span>
    </button>
  );
}
