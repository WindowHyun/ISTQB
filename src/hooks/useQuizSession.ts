import { useQuizStore } from '../store/useQuizStore';
import { useQuestions, Question } from './useQuestions';
import { isQuestionCorrect } from '../utils/answer';
import { saveHistoryToDB } from '../utils/storage';

// 사이드바(통계·채점·진행률)와 워크스페이스(문항·네비)가 공유하는 파생 상태/액션.
// 레거시 레이아웃은 채점 버튼·진행률을 사이드바에, 문항을 워크스페이스에 두므로
// 두 컴포넌트가 동일한 세션 계산을 필요로 한다 — 한 곳에 모아 중복을 제거한다.
export function useQuizSession() {
  const { mode, setId, answers, graded, elapsedSeconds, addHistory, setReviewIds, setGraded, setResultOpen, setConfirmGradeOpen } = useQuizStore();
  const { appData, currentQuestions } = useQuestions();

  // 각 모드는 자체 답안 네임스페이스를 사용한다(오답 모드는 재풀이용 별도 기록).
  const answerKeyOf = (q: Question) => `${setId}-${mode}-${q.id || q.number}`;

  const total = currentQuestions.length;
  const answered = currentQuestions.filter(
    (q) => (answers[answerKeyOf(q)] || []).length > 0
  ).length;
  const correctCount = currentQuestions.filter(
    (q) => isQuestionCorrect(q.answer, answers[answerKeyOf(q)] || [], q.type)
  ).length;

  const gradeKey = `${setId}-${mode}`;
  const isGraded = Boolean(graded[gradeKey]);
  const canGrade = (mode === 'exam' || mode === 'random') && !isGraded && total > 0;
  const progressPercent = total ? Math.round((answered / total) * 100) : 0;

  // 채점된 시험/랜덤 또는 오답 모드에서 틀린 문항 목록(오답노트·네비 표시용).
  const wrongQuestions = currentQuestions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => !isQuestionCorrect(q.answer, answers[answerKeyOf(q)] || [], q.type));

  const handleGrade = () => {
    const wrongQs = currentQuestions
      .filter((q) => !isQuestionCorrect(q.answer, answers[answerKeyOf(q)] || [], q.type));
    const wrongIds = wrongQs.map((q) => q.id || `legacy-${q.number}`);
    // 오답 노트(세트 전체 회차 리스트)용 상세를 채점 시점에 함께 저장한다(4A).
    const wrongItems = wrongQs.map((q) => ({
      number: q.number,
      myAnswer: answers[answerKeyOf(q)] || [],
      correctAnswer: q.answer,
    }));
    const setTitle = appData?.sets.find((s) => s.id === setId)?.title;
    const gradedAnswers: Record<string, string[]> = {};
    currentQuestions.forEach((q) => {
      const k = answerKeyOf(q);
      if (answers[k]) gradedAnswers[k] = answers[k];
    });
    const history = {
      id: Date.now().toString(),
      setId,
      mode,
      answers: gradedAnswers,
      correct: total - wrongIds.length,
      total,
      elapsedSeconds: Math.round(elapsedSeconds),
      createdAt: Date.now(),
      setTitle,
      wrongItems,
    };
    addHistory(history);
    // 채점 이력을 IndexedDB에 영속화(새로고침 후 통계 대시보드에서 조회).
    saveHistoryToDB(history);
    setReviewIds(setId, wrongIds);
    setGraded(gradeKey, true);
  };

  // 채점 후 결과 요약 모달을 자동으로 띄운다(사이드바·모바일 하단바 공용).
  const gradeAndShow = () => {
    handleGrade();
    setResultOpen(true);
  };

  // 채점 요청: 미응답이 있으면 확인 모달을 먼저 띄우고, 없으면 바로 채점한다.
  const requestGrade = () => {
    if (answered < total) setConfirmGradeOpen(true);
    else gradeAndShow();
  };

  return {
    appData,
    currentQuestions,
    answerKeyOf,
    total,
    answered,
    correctCount,
    isGraded,
    canGrade,
    progressPercent,
    wrongQuestions,
    elapsedSeconds,
    handleGrade,
    gradeAndShow,
    requestGrade,
  };
}
