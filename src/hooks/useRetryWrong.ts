import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../store/useQuizStore';
import { reviewTargetIds, selectReviewQuestions, type AppData, type Question } from './useQuestions';
import { loadSetQuestions, peekSetQuestions } from '../utils/questionLoader';
import { showToast } from '../utils/toast';

/**
 * 오답 다시 풀기를 시작한다. 시작했으면 true — 부르는 쪽이 자기 오버레이(드로어·시트)를 닫는다.
 *
 * 사이드바의 '오답 다시 풀기'와 문항 목록 시트의 'N문제 다시 풀기'가 **같은 길**을 쓴다.
 * 두 버튼이 각자 조립하면 한쪽에만 응시 잠금 가드나 "오답 없음" 안내가 있는 상태가 되고,
 * 시험 응시 중에 시트로 오답 풀기를 시작해 타이머를 잃는 식의 우회로가 열린다.
 *
 * 스토어를 getState()로 읽는 이유: 이벤트 시점의 값이 필요하고, 구독하면 이 함수를 부르는
 * 컴포넌트가 오답 대상이 바뀔 때마다 리렌더된다.
 */
export function startRetryWrong(examLocked: boolean): boolean {
  // 응시 중 잠금 — 이 진입로는 세그먼트 밖이라 disabled에 걸리지 않지만 setMode+resetTimer를
  // 호출하므로, 여기서 막지 않으면 잠금을 우회해 시험 타이머가 소실된다.
  if (examLocked) {
    showToast('시험 응시 중에는 오답 풀기를 시작할 수 없습니다. 먼저 채점하세요.', 'info');
    return false;
  }
  const { reviewIds, setId, clearAnswers, setMode, beginSession } = useQuizStore.getState();
  // 현재 세트에 오답이 없으면 빈 오답 모드로 이동하지 않고 안내만 한다(모드 유지).
  // 판정은 useQuestions의 reviewTargetIds가 단일 원천이다.
  if (reviewTargetIds(reviewIds, setId).size === 0) {
    // 퀵을 빼고 안내한다 — 퀵 오답은 세트 버킷에 담기지 않는 사양이라, 넣어 두면
    // "퀵으로 채점했는데 왜 없냐"는 잘못된 기대를 이 문구가 직접 만들어 낸다.
    showToast('현재 문제 세트에는 오답이 없습니다. 시험 모드에서 채점하면 기록됩니다.', 'info');
    return false;
  }
  // 이전 재풀이 답안을 비우고 오답(review) 모드로 전환해 틀린 문항만 새로 푼다.
  clearAnswers(setId, 'review');
  setMode('review');
  beginSession();
  return true;
}

/**
 * 오답 모드가 이 세트에서 **실제로 내놓을** 문항 수 — 'N문제 다시 풀기'의 N.
 *
 * 현재 화면의 목록에서 세지 않는다. 랜덤(40문항 추첨)·챕터 집중 연습 중에는 화면의 목록이
 * 세트 전체가 아니라 부분집합이라 오답 대상 중 일부만 보인다. 대신 세트 문항을 (캐시된) 로더로
 * 읽어, 오답 모드의 출제와 같은 함수(selectReviewQuestions)로 거른다.
 *
 * 로드 전에는 null이다 — 0으로 돌려주면 시트가 열리는 순간 'CTA 없음'이 잠깐 비쳤다가
 * 나타나 깜빡인다. 호출부는 null이면 CTA를 내지 않는다(없는 것보다 틀린 수가 나쁘다).
 */
export function useReviewTargetCount(appData: AppData | null, enabled: boolean): number | null {
  const { setId, reviewIds, reviewedOk } = useQuizStore(useShallow((s) => ({
    setId: s.setId, reviewIds: s.reviewIds, reviewedOk: s.reviewedOk[s.setId],
  })));
  const path = appData?.sets.find((s) => s.id === setId)?.path;

  // 이미 읽은 세트면 로딩 프레임 없이 바로 센다(오답 노트 재진입과 같은 방식).
  const [questions, setQuestions] = useState<{ path: string; list: Question[] } | null>(
    () => (path && peekSetQuestions(path) ? { path, list: peekSetQuestions(path) as Question[] } : null),
  );

  useEffect(() => {
    if (!enabled || !path) return;
    const cached = peekSetQuestions(path);
    if (cached) {
      setQuestions((prev) => (prev?.path === path ? prev : { path, list: cached }));
      return;
    }
    let cancelled = false;
    loadSetQuestions(path)
      .then((list) => { if (!cancelled) setQuestions({ path, list }); })
      .catch(() => { /* 카운트는 부가 정보 — 실패하면 CTA를 내지 않는다 */ });
    return () => { cancelled = true; };
  }, [enabled, path]);

  return useMemo(() => {
    // 세트가 바뀐 직후엔 옛 세트의 문항이 남아 있을 수 있다 — 경로가 맞을 때만 센다.
    if (!path || questions?.path !== path) return null;
    return selectReviewQuestions(
      questions.list,
      reviewTargetIds(reviewIds, setId),
      new Set(reviewedOk ?? []),
    ).length;
  }, [path, questions, reviewIds, setId, reviewedOk]);
}
