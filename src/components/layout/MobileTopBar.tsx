import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { TimerClock } from '../common/TimerClock';

const MODE_LABEL: Record<string, string> = {
  practice: '연습', exam: '시험', random: '랜덤', review: '오답',
};

const LOGO_SRC =
  'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%23166064%22/%3E%3Cpath%20d%3D%22M24%2030l5%205%2011-13%22%20fill%3D%22none%22%20stroke%3D%22%23f5f7f2%22%20stroke-width%3D%226%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E';

// 모바일 전용 상단바(CSS로 ≤880px에서만 노출). 모드·진행·시간을 상시 노출하고 ☰로 컨트롤 드로어를 연다.
export const MobileTopBar = () => {
  // 슬라이스 구독(O1) — 타이머는 TimerClock이 단독 구독한다.
  const { mode, setId, activeProduct, setDrawerOpen } = useQuizStore(useShallow((s) => ({
    mode: s.mode, setId: s.setId, activeProduct: s.activeProduct, setDrawerOpen: s.setDrawerOpen,
  })));
  const { appData, total, answered, progressPercent } = useQuizSession();
  const setTitle = appData?.sets.find((s) => s.id === setId)?.title || '문제 풀이';

  return (
    <header className="mobile-topbar" aria-label="시험 정보">
      <div className="mtb-row">
        <div className="mtb-brand">
          <img src={LOGO_SRC} alt="" />
          <div>
            <small>{(activeProduct || '').toUpperCase()}</small>
            <b>{setTitle}</b>
          </div>
        </div>
        <button
          type="button"
          className="mtb-menu"
          aria-label="메뉴 열기"
          aria-haspopup="dialog"
          data-testid="drawer-open"
          onClick={() => setDrawerOpen(true)}
        >
          ☰
        </button>
      </div>
      <div className="mtb-info" aria-live="polite">
        <span className="mtb-chip">{MODE_LABEL[mode] || mode}</span>
        <span className="mtb-meta">{answered} / {total}</span>
        <span className="mtb-meta">⏱ <TimerClock /></span>
        <span className="mtb-bar" aria-hidden="true"><i style={{ width: `${progressPercent}%` }} /></span>
      </div>
    </header>
  );
};
