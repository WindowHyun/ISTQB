import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { TimerClock } from '../common/TimerClock';
import { MODE_LABEL } from '../../utils/modeLabel';
import { computeQuickStats } from '../../utils/quickStats';
import { BRAND_LOGO_SRC } from '../../utils/brandLogo';


// 모바일 전용 상단바(CSS로 ≤880px에서만 노출). 모드·진행·시간을 상시 노출하고 ☰로 컨트롤 드로어를 연다.
export const MobileTopBar = () => {
  // 슬라이스 구독(O1) — 타이머는 TimerClock이 단독 구독한다.
  const { mode, setId, index, answers, activeProduct, chapterFilter, setDrawerOpen } = useQuizStore(useShallow((s) => ({
    mode: s.mode, setId: s.setId, activeProduct: s.activeProduct,
    // 퀵 점수판에 필요한 값. 퀵이 아닐 때도 구독은 되지만, index·answers는 원래
    // 이 컴포넌트가 그리는 진행률(answered)이 바뀔 때 함께 움직이던 값이라 리렌더가 늘지 않는다.
    index: s.index, answers: s.answers,
    chapterFilter: s.chapterFilter, setDrawerOpen: s.setDrawerOpen,
  })));
  const { appData, currentQuestions, answerKeyOf, total, answered, progressPercent } = useQuizSession();
  const isQuick = mode === 'quick';
  const quick = computeQuickStats(currentQuestions, answers, answerKeyOf, index);
  const setTitle = isQuick
    ? '퀵 — 전 세트 랜덤'
    : (appData?.sets.find((s) => s.id === setId)?.title || '문제 풀이');

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
        {/* 챕터 집중 연습은 일반 연습과 구분해 표기 — 배너 라벨과 일관. */}
        <span className="mtb-chip">
          {mode === 'practice' && chapterFilter ? '집중 연습' : (MODE_LABEL[mode] || mode)}
        </span>
        {isQuick ? (
          // 퀵은 무한이라 분모(N/총계)도 진행 막대도 없고, 기록을 남기지 않아 시간도 재지 않는다.
          // 문제 화면의 점수판과 같은 값을 좁은 폭에 맞춰 줄여 놓는다.
          <>
            <span className="mtb-meta" aria-live="polite">{quick.solved}문항</span>
            <span className="mtb-meta">✅ {quick.correct} · ❌ {quick.wrong}</span>
            <span className="mtb-meta">🔥 {quick.streak}</span>
          </>
        ) : (
          <>
            {/* 라이브 영역을 진행률에만 둔다 — 타이머를 포함하면 스크린리더가 매초 시간을 낭독한다. */}
            <span className="mtb-meta" aria-live="polite">{answered} / {total}</span>
            <span className="mtb-meta">⏱ <TimerClock /></span>
            <span className="mtb-bar" aria-hidden="true"><i style={{ width: `${progressPercent}%` }} /></span>
          </>
        )}
      </div>
    </header>
  );
};
