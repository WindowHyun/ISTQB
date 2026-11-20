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

  // 두 상태의 버튼에 서로 다른 key를 준다 — 같은 자리·같은 종류라 React가 DOM 버튼을 그대로 재사용하면
  // 포커스가 '삭제' 버튼에 남아, Enter를 두 번 누르는 것만으로 확인 없이 지워졌다.
  if (!armed) {
    return (
      <button key="arm" type="button" className={cls('danger')} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <>
      <button
        key="confirm"
        type="button"
        className={cls('danger')}
        data-testid={confirmTestId}
        // 더블클릭·더블탭의 두 번째 클릭(detail ≥ 2)은 확정이 아니다 — 무장한 직후 같은 자리에 나타난 버튼이
        // 그 클릭을 받아 확인 없이 실행됐다. 키보드(detail 0)와 한 번 누르기(detail 1)는 그대로 실행된다.
        onClick={(e) => { if (e.detail > 1) return; setArmed(false); onConfirm(); }}
      >
        {confirmLabel}
      </button>
      {/* 포커스는 안전한 쪽(취소)에 둔다 — 지우려는 사람은 확정 버튼을 눌러야 한다. */}
      <button key="cancel" type="button" className={cls('')} autoFocus onClick={() => setArmed(false)}>
        취소
      </button>
    </>
  );
};
