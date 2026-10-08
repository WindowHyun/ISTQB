import { useShallow } from 'zustand/react/shallow';
import { useQuizStore, freshQuickRounds, type ExamHistory } from '../store/useQuizStore';
import type { AppData } from './useQuestions';
import {
  buildQuickWrongs,
  buildWrongNoteBySet,
  countWrongNote,
  selectProductHistories,
} from '../utils/wrongNote';
import { productSets } from '../utils/setSheet';

/**
 * 오답 노트가 나열하는 데이터와 그 총수 — 노트 모달과 모바일 상태 줄의 배지가 함께 쓴다.
 *
 * 이 계산은 종전에 AppModals 안의 useMemo 연쇄였다. 배지가 같은 모집단을 세려면 연쇄 전체가
 * 필요한데, 한쪽에서 다시 조립하면 "배지는 4인데 열어 보니 17개"처럼 어긋난다. 그래서 한 곳에
 * 두고, 순수 부분은 utils/wrongNote(유닛으로 고정)에 둔다.
 */
export interface WrongNoteData {
  sets: AppData['sets'];
  productHistories: Record<string, ExamHistory>;
  productQuickRounds: ExamHistory[];
  quickWrongs: ReturnType<typeof buildQuickWrongs>;
  wrongNoteBySet: ReturnType<typeof buildWrongNoteBySet>;
  total: number;
}

interface Memo {
  appData: AppData | null;
  activeProduct: string | null;
  histories: Record<string, ExamHistory>;
  quickRounds: ExamHistory[];
  out: WrongNoteData;
}

// 직전 계산 하나. 배지(MobileTopBar)와 노트(AppModals)는 항상 마운트돼 같은 입력으로 이 계산을 부르는데,
// 컴포넌트마다 useMemo를 두면 이력·퀵 회차가 바뀔 때마다 연쇄(병합·정렬)가 두 번 돈다. 입력이 같은 동안은
// 결과를 공유한다 — 컴포넌트별 useMemo와 무효화 시점이 같고(입력 참조가 바뀔 때), 계산만 한 번이 된다.
// 퀵 회차의 24시간 만료(freshQuickRounds)는 현재 시각으로 가르므로, 입력이 그대로인 채 시간만 흘러서는
// 다시 계산하지 않는다 — 종전 useMemo와 같은 동작이다.
let memo: Memo | null = null;

export function deriveWrongNote(
  appData: AppData | null,
  activeProduct: string | null,
  histories: Record<string, ExamHistory>,
  quickRounds: ExamHistory[],
): WrongNoteData {
  if (
    memo && memo.appData === appData && memo.activeProduct === activeProduct
    && memo.histories === histories && memo.quickRounds === quickRounds
  ) {
    return memo.out;
  }

  const sets = productSets(appData?.sets, activeProduct);
  // 통계·오답노트·이력 비우기는 현재 제품 이력만 대상으로 한다.
  const productHistories = selectProductHistories(histories, new Set(sets.map((s) => s.id)), activeProduct);
  // 현재 제품의 유효(미만료) 퀵 회차 — 오답노트와 통계가 같은 모집단을 본다.
  // 제품 필터가 빠지면 CSTS에서 푼 퀵이 ISTQB 챕터 통계에 남의 챕터로 끼어든다.
  const productQuickRounds = freshQuickRounds(quickRounds).filter(
    (r) => !r.certification || r.certification === activeProduct,
  );
  const titleOf = (sid: string) => appData?.sets.find((s) => s.id === sid)?.title;
  const quickWrongs = buildQuickWrongs(productQuickRounds, titleOf);
  const wrongNoteBySet = buildWrongNoteBySet(Object.values(productHistories), titleOf);

  const out: WrongNoteData = {
    sets,
    productHistories,
    productQuickRounds,
    quickWrongs,
    wrongNoteBySet,
    total: countWrongNote(wrongNoteBySet, quickWrongs),
  };
  memo = { appData, activeProduct, histories, quickRounds, out };
  return out;
}

/** 테스트 격리용 — 직전 계산을 비운다. */
export function __resetWrongNoteMemoForTest(): void {
  memo = null;
}

export function useWrongNote(appData: AppData | null): WrongNoteData {
  const { activeProduct, histories, quickRounds } = useQuizStore(useShallow((s) => ({
    activeProduct: s.activeProduct, histories: s.histories, quickRounds: s.quickRounds,
  })));
  // 호출하는 컴포넌트는 답안 클릭·타이머 틱마다 리렌더되지만 입력 참조는 그대로이므로 연쇄는 다시 돌지 않는다.
  return deriveWrongNote(appData, activeProduct, histories, quickRounds);
}
