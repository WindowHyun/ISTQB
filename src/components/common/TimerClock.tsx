import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../../store/useQuizStore';
import { formatClock } from '../../utils/time';
import { examLimitSeconds, remainingSeconds } from '../../utils/examTime';

// 시간 표시 전용 구독 컴포넌트(O1).
// elapsedSeconds는 매초 갱신되므로 이 컴포넌트만 리렌더되게 분리한다 —
// 부모(사이드바·모바일 상단바)는 슬라이스 셀렉터만 구독해 매초 리렌더되지 않는다.
// 시험 모드에는 제한시간이 있어 경과 대신 '남은 시간'을 카운트다운으로 보여준다
// (mode·activeProduct는 거의 바뀌지 않아 구독을 늘려도 리렌더 빈도는 그대로다).
export const TimerClock = () => {
  const { elapsedSeconds, mode, activeProduct, isGraded } = useQuizStore(
    useShallow((s) => ({
      elapsedSeconds: s.elapsedSeconds,
      mode: s.mode,
      activeProduct: s.activeProduct,
      // 채점을 마쳤는지(세트·모드 단위) — 채점 후에는 카운트다운이 의미를 잃는다.
      isGraded: Boolean(s.graded[`${s.setId}-${s.mode}`]),
    })),
  );
  // 채점 후에는 남은 시간 대신 '소요 시간'을 보여준다 — 그대로 두면 시험이 끝났는데도
  // "남은 시간 1:00:00"이 남아, 같은 화면의 결과(소요 시간)와 상충하는 값이 보인다.
  const limit = mode === 'exam' && !isGraded ? examLimitSeconds(activeProduct) : null;
  if (limit == null) return <>{formatClock(elapsedSeconds)}</>;

  const remaining = remainingSeconds(limit, elapsedSeconds);
  // 임박 상태는 색으로도 구분한다(5분 이하 경고 / 1분 이하 위험).
  const level = remaining <= 60 ? 'danger' : remaining <= 300 ? 'warn' : undefined;
  return (
    <span className={level ? `timer-${level}` : undefined} data-testid="timer-remaining" data-level={level}>
      {formatClock(remaining)}
    </span>
  );
};
