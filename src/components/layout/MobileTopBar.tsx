import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { TimerClock } from '../common/TimerClock';
import { MODE_LABEL } from '../../utils/modeLabel';
import { BRAND_LOGO_SRC } from '../../utils/brandLogo';


// 모바일 전용 상단바(CSS로 ≤880px에서만 노출). 모드·진행·시간을 상시 노출하고 ☰로 컨트롤 드로어를 연다.
export const MobileTopBar = () => {
  // 슬라이스 구독(O1) — 타이머는 TimerClock이 단독 구독한다.
  const { mode, setId, activeProduct, chapterFilter, setDrawerOpen } = useQuizStore(useShallow((s) => ({
    mode: s.mode, setId: s.setId, activeProduct: s.activeProduct,
    chapterFilter: s.chapterFilter, setDrawerOpen: s.setDrawerOpen,
  })));
  const { appData, total, answered, progressPercent } = useQuizSession();
  const setTitle = appData?.sets.find((s) => s.id === setId)?.title || '문제 풀이';

  return (
    <header className="mobile-topbar" aria-label="시험 정보">
      <div className="mtb-row">
        <div className="mtb-brand">
          <img src={BRAND_LOGO_SRC} alt="" />
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
      <div className="mtb-info">
        {/* 챕터 미니 시험(랜덤+필터)은 일반 랜덤과 구분해 표기 — 결과 모달 라벨과 일관. */}
        <span className="mtb-chip">
          {mode === 'random' && chapterFilter ? '미니 시험' : (MODE_LABEL[mode] || mode)}
        </span>
        {/* 라이브 영역을 진행률에만 둔다 — 타이머를 포함하면 스크린리더가 매초 시간을 낭독한다. */}
        <span className="mtb-meta" aria-live="polite">{answered} / {total}</span>
        <span className="mtb-meta">⏱ <TimerClock /></span>
        <span className="mtb-bar" aria-hidden="true"><i style={{ width: `${progressPercent}%` }} /></span>
      </div>
    </header>
  );
};
