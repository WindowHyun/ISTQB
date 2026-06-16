import { useQuizStore } from '../store/useQuizStore';
import { useQuestions, Question } from './useQuestions';
import { isAnswerCorrect } from '../utils/answer';

// 사이드바(통계·채점·진행률)와 워크스페이스(문항·네비)가 공유하는 파생 상태/액션.
// 레거시 레이아웃은 채점 버튼·진행률을 사이드바에, 문항을 워크스페이스에 두므로
// 두 컴포넌트가 동일한 세션 계산을 필요로 한다 — 한 곳에 모아 중복을 제거한다.
export function useQuizSession() {
  const { mode, setId, answers, graded, addHistory, setReviewIds, setGraded } = useQuizStore();
  const { appData, currentQuestions } = useQuestions();

  // 오답(review) 모드는 시험(exam) 답안을 읽고 판정한다.
  const answerMode = mode === 'review' ? 'exam' : mode;
  const answerKeyOf = (q: Question) => `${setId}-${answerMode}-${q.id || q.number}`;

  const total = currentQuestions.length;
  const answered = currentQuestions.filter(
    (q) => (answers[answerKeyOf(q)] || []).length > 0
  ).length;
  const correctCount = currentQuestions.filter(
    (q) => isAnswerCorrect(q.answer, answers[answerKeyOf(q)] || [])
  ).length;

  const gradeKey = `${setId}-${mode}`;
  const isGraded = Boolean(graded[gradeKey]);
  const canGrade = (mode === 'exam' || mode === 'random') && !isGraded && total > 0;
  const progressPercent = total ? Math.round((answered / total) * 100) : 0;

  // 채점된 시험/랜덤 또는 오답 모드에서 틀린 문항 목록(오답노트·네비 표시용).
  const wrongQuestions = currentQuestions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => !isAnswerCorrect(q.answer, answers[answerKeyOf(q)] || []));

  const handleGrade = () => {
    const wrongIds = currentQuestions
      .filter((q) => !isAnswerCorrect(q.answer, answers[answerKeyOf(q)] || []))
      .map((q) => q.id || `legacy-${q.number}`);
    const gradedAnswers: Record<string, string[]> = {};
    currentQuestions.forEach((q) => {
      const k = answerKeyOf(q);
      if (answers[k]) gradedAnswers[k] = answers[k];
    });
    addHistory({ id: Date.now().toString(), setId, mode, answers: gradedAnswers });
    setReviewIds(setId, wrongIds);
    setGraded(gradeKey, true);
  };

  return {
    appData,
    currentQuestions,
    answerMode,
    answerKeyOf,
    total,
    answered,
    correctCount,
    isGraded,
    canGrade,
    progressPercent,
    wrongQuestions,
    handleGrade,
  };
}
