import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore, freshQuickRounds } from '../store/useQuizStore';
import type { AppData } from './useQuestions';
import {
  buildQuickWrongs,
  buildWrongNoteBySet,
  countWrongNote,
  selectProductHistories,
} from '../utils/wrongNote';

/**
 * 오답 노트가 나열하는 데이터와 그 총수 — 노트 모달과 모바일 상태 줄의 배지가 함께 쓴다.
 *
 * 이 계산은 종전에 AppModals 안의 useMemo 연쇄였다. 배지가 같은 모집단을 세려면 연쇄 전체가
 * 필요한데, 한쪽에서 다시 조립하면 "배지는 4인데 열어 보니 17개"처럼 어긋난다. 그래서 한 곳에
 * 두고, 순수 부분은 utils/wrongNote(유닛으로 고정)에 둔다.
 *
 * useMemo를 유지하는 이유는 AppModals와 같다: 호출하는 컴포넌트가 답안 클릭·타이머 틱마다
 * 리렌더되는데, 메모가 없으면 노트가 닫혀 있어도 매번 전체 이력을 정렬·병합한다.
 */
export function useWrongNote(appData: AppData | null) {
  const { activeProduct, histories, quickRounds } = useQuizStore(useShallow((s) => ({
    activeProduct: s.activeProduct, histories: s.histories, quickRounds: s.quickRounds,
  })));

  const sets = useMemo(
    () => (appData ? appData.sets.filter((s) => s.certification.toLowerCase() === activeProduct) : []),
    [appData, activeProduct],
  );

  // 통계·오답노트·이력 비우기는 현재 제품 이력만 대상으로 한다.
  const productHistories = useMemo(
    () => selectProductHistories(histories, new Set(sets.map((s) => s.id)), activeProduct),
    [histories, sets, activeProduct],
  );

  // 현재 제품의 유효(미만료) 퀵 회차 — 오답노트와 통계가 같은 모집단을 본다.
  // 제품 필터가 빠지면 CSTS에서 푼 퀵이 ISTQB 챕터 통계에 남의 챕터로 끼어든다.
  const productQuickRounds = useMemo(
    () => freshQuickRounds(quickRounds).filter((r) => !r.certification || r.certification === activeProduct),
    [quickRounds, activeProduct],
  );

  const titleOf = useMemo(
    () => (sid: string) => appData?.sets.find((s) => s.id === sid)?.title,
    [appData],
  );

  const quickWrongs = useMemo(
    () => buildQuickWrongs(productQuickRounds, titleOf),
    [productQuickRounds, titleOf],
  );

  const wrongNoteBySet = useMemo(
    () => buildWrongNoteBySet(Object.values(productHistories), titleOf),
    [productHistories, titleOf],
  );

  const total = useMemo(() => countWrongNote(wrongNoteBySet, quickWrongs), [wrongNoteBySet, quickWrongs]);

  return { sets, productHistories, productQuickRounds, quickWrongs, wrongNoteBySet, total };
}
