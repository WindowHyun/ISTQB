import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../store/useQuizStore';
import { useQuestions, Question } from './useQuestions';
import { isQuestionCorrect } from '../utils/answer';
import { buildChapterStats } from '../utils/chapterStats';
import { saveHistoryToDB } from '../utils/storage';

// 사이드바(통계·채점·진행률)와 워크스페이스(문항·네비)가 공유하는 파생 상태/액션.
// 레거시 레이아웃은 채점 버튼·진행률을 사이드바에, 문항을 워크스페이스에 두므로
// 두 컴포넌트가 동일한 세션 계산을 필요로 한다 — 한 곳에 모아 중복을 제거한다.
export function useQuizSession() {
  // 슬라이스 구독(O1) — elapsedSeconds는 구독하지 않고 채점 시점에 getState()로 읽는다
  // (구독하면 이 훅을 쓰는 모든 컴포넌트가 타이머 틱마다 리렌더된다).
  const { mode, setId, answers, graded, addHistory, setReviewIds, setGraded, setResultOpen, setConfirmGradeOpen } =
    useQuizStore(useShallow((s) => ({
      mode: s.mode, setId: s.setId, answers: s.answers, graded: s.graded,
      addHistory: s.addHistory, setReviewIds: s.setReviewIds, setGraded: s.setGraded,
      setResultOpen: s.setResultOpen, setConfirmGradeOpen: s.setConfirmGradeOpen,
    })));
  const { appData, currentQuestions, loadError, retryLoad } = useQuestions();

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
      // 시각+난수 — 같은 ms 재채점·백업 병합에서도 기존 회차를 덮어쓰지 않는 유일 키.
      // (통계의 시각 표시는 createdAt을 쓰므로 id가 숫자일 필요는 없다)
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      setId,
      mode,
      // 소속 제품을 기록에 남긴다 — 세트가 훗날 index.json에서 빠져도 제품 스코프
      // 통계/삭제에서 이력이 고아가 되지 않는다.
      certification: useQuizStore.getState().activeProduct ?? undefined,
      answers: gradedAnswers,
      correct: total - wrongIds.length,
      total,
      // 매초 리렌더를 피하려고 구독 대신 채점 시점에 스냅샷으로 읽는다(O1).
      elapsedSeconds: Math.round(useQuizStore.getState().elapsedSeconds),
      createdAt: Date.now(),
      setTitle,
      wrongItems,
      // 챕터별 정답 집계(약점 분석용) — 채점 시점의 문항·답안으로 확정 저장.
      chapterStats: buildChapterStats(currentQuestions, answers, answerKeyOf),
    };
    addHistory(history);
    // 채점 이력을 IndexedDB에 영속화(새로고침 후 통계 대시보드에서 조회).
    saveHistoryToDB(history);
    // 모드별로 저장해 랜덤 채점이 시험 오답 목록을 덮어쓰지 않게 한다(오답 모드는 합집합을 읽음).
    setReviewIds(`${setId}-${mode}`, wrongIds);
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
    loadError,
    retryLoad,
    answerKeyOf,
    total,
    answered,
    correctCount,
    isGraded,
    canGrade,
    progressPercent,
    wrongQuestions,
    handleGrade,
    gradeAndShow,
    requestGrade,
  };
}
