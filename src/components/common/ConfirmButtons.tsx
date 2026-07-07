import { useState } from 'react';

interface ConfirmButtonsProps {
  /** 초기(비무장) 버튼 라벨. */
  label: string;
  /** 무장 후 실제 실행 버튼 라벨. */
  confirmLabel: string;
  onConfirm: () => void;
  /** 실행 버튼 data-testid(E2E용). */
  confirmTestId?: string;
  /** 두 버튼에 공통 적용할 클래스(예: "settings-action"). */
  buttonClassName?: string;
}

// 파괴적 액션 공용 2단계 확인 버튼(window.confirm 대체 — 비차단·모달 체계와 일관).
// 무장(armed) 상태는 컴포넌트 로컬이므로 언마운트(모달 닫힘) 시 자동 해제된다 —
// 호출부가 닫힘 경로마다 수동으로 리셋할 필요가 없다.
export const ConfirmButtons = ({
  label, confirmLabel, onConfirm, confirmTestId, buttonClassName = '',
}: ConfirmButtonsProps) => {
  const [armed, setArmed] = useState(false);
  const cls = (extra: string) => `${buttonClassName} ${extra}`.trim();

  if (!armed) {
    return (
      <button type="button" className={cls('danger')} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        className={cls('danger')}
        data-testid={confirmTestId}
        onClick={() => { setArmed(false); onConfirm(); }}
      >
        {confirmLabel}
      </button>
      <button type="button" className={cls('')} onClick={() => setArmed(false)}>
        취소
      </button>
    </>
  );
};
