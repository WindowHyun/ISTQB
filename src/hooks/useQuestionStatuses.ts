import { useMemo } from 'react';
import { useQuizStore } from '../store/useQuizStore';
import type { Question } from './useQuestions';
import {
  deriveQuestionStatuses,
  isCorrectnessVisible,
  summarizeStatuses,
  type QuestionStatus,
} from '../utils/questionStatus';

const EMPTY = {
  statuses: [] as QuestionStatus[],
  summary: summarizeStatuses([]),
  showCorrectness: false,
};

/**
 * 진행 스트립·문항 목록 시트가 함께 읽는 문항 상태. 파생 규칙은 utils/questionStatus가 단일 원천이다.
 *
 * 세션 값(문항·답안 키 규칙·채점 여부)을 인자로 받는다 — 이 훅 안에서 useQuizSession을 다시 부르면
 * 호출처마다 문항 로더 인스턴스가 하나씩 더 생긴다(이미 5곳이 부르고 있다). 답안만 스토어에서
 * 직접 구독해 답안 클릭마다 갱신되고, 메모로 타이머 틱에는 다시 계산하지 않는다.
 */
export function useQuestionStatuses(input: {
  mode: string;
  currentQuestions: Question[];
  answerKeyOf: (q: Question) => string;
  isGraded: boolean;
}) {
  const { mode, currentQuestions, answerKeyOf, isGraded } = input;
  const answers = useQuizStore((s) => s.answers);

  return useMemo(() => {
    // 퀵은 하단 바에 스트립도 목록도 없고 문항이 수백 개라 답안마다 훑을 이유가 없다.
    if (mode === 'quick') return EMPTY;
    const statuses = deriveQuestionStatuses({
      mode,
      questions: currentQuestions,
      answers,
      answerKeyOf,
      graded: isGraded,
    });
    return {
      statuses,
      summary: summarizeStatuses(statuses),
      // 이 단계에서 정오(✓/✕·정답/오답)를 말해도 되는가 — 시험·랜덤은 채점 전에는 말하지 않는다.
      showCorrectness: isCorrectnessVisible(mode, isGraded),
    };
  }, [mode, currentQuestions, answers, answerKeyOf, isGraded]);
}
