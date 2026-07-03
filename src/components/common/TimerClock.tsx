import { useQuizStore } from '../../store/useQuizStore';
import { formatClock } from '../../utils/time';

// 경과 시간 표시 전용 구독 컴포넌트(O1).
// elapsedSeconds는 매초 갱신되므로 이 컴포넌트만 리렌더되게 분리한다 —
// 부모(사이드바·모바일 상단바)는 슬라이스 셀렉터만 구독해 매초 리렌더되지 않는다.
export const TimerClock = () => {
  const elapsedSeconds = useQuizStore((s) => s.elapsedSeconds);
  return <>{formatClock(elapsedSeconds)}</>;
};
