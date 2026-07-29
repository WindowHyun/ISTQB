import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../store/useQuizStore';
import { useQuestions, Question } from './useQuestions';
import { isQuestionCorrect, isAnswered } from '../utils/answer';
import { answerKeyFor, gradeKeyFor } from '../utils/answerKey';
import { buildChapterStats } from '../utils/chapterStats';
import { computeCstsWeightedScore } from '../utils/scoring';
import { saveHistoryToDB } from '../utils/storage';

// 사이드바(통계·채점·진행률)와 워크스페이스(문항·네비)가 공유하는 파생 상태/액션.
// 레거시 레이아웃은 채점 버튼·진행률을 사이드바에, 문항을 워크스페이스에 두므로
// 두 컴포넌트가 동일한 세션 계산을 필요로 한다 — 한 곳에 모아 중복을 제거한다.
export function useQuizSession() {
  // 슬라이스 구독(O1) — elapsedSeconds는 구독하지 않고 채점 시점에 getState()로 읽는다
  // (구독하면 이 훅을 쓰는 모든 컴포넌트가 타이머 틱마다 리렌더된다).
  const { mode, setId, answers, graded, examStarted, addHistory, setReviewIds, setGraded, setResultOpen, setConfirmGradeOpen, markReviewed, unmarkReviewed } =
    useQuizStore(useShallow((s) => ({
      mode: s.mode, setId: s.setId, answers: s.answers, graded: s.graded,
      examStarted: s.examStarted[s.setId],
      addHistory: s.addHistory, setReviewIds: s.setReviewIds, setGraded: s.setGraded,
      markReviewed: s.markReviewed, unmarkReviewed: s.unmarkReviewed,
      setResultOpen: s.setResultOpen, setConfirmGradeOpen: s.setConfirmGradeOpen,
    })));
  const { appData, currentQuestions, loadError, retryLoad } = useQuestions();

  // 각 모드는 자체 답안 네임스페이스를 사용한다(오답 모드는 재풀이용 별도 기록).
  // useCallback: 아래 파생 메모들의 의존성이라 매 렌더 참조가 바뀌면 메모가 무효화된다.
  const answerKeyOf = useCallback(
    (q: Question) => answerKeyFor(setId, mode, q),
    [setId, mode],
  );

  const total = currentQuestions.length;
  // 이 훅은 5개 컴포넌트(사이드바·워크스페이스·팔레트·상단바·모달)가 각각 호출하므로,
  // 메모 없이는 전 문항 순회(답함/정답/오답/가중점수)가 컴포넌트 수 × 렌더 수만큼 반복된다.
  // 실제 입력(문항·답안·키 규칙)이 바뀔 때만 재계산하도록 묶는다.
  const { answered, correctCount, wrongQuestions } = useMemo(() => {
    let answeredCount = 0;
    let correct = 0;
    const wrong: { q: Question; i: number }[] = [];
    currentQuestions.forEach((q, i) => {
      const selected = answers[answerKeyOf(q)] || [];
      if (isAnswered(selected, q.answerParts)) answeredCount += 1;
      if (isQuestionCorrect(q.answer, selected, q.type, q.answerParts)) correct += 1;
      // 채점된 시험/랜덤 또는 오답 모드에서 틀린 문항 목록(오답노트·네비 표시용).
      else wrong.push({ q, i });
    });
    return { answered: answeredCount, correctCount: correct, wrongQuestions: wrong };
  }, [currentQuestions, answers, answerKeyOf]);
  // CSTS 합격 판정용 가중 점수(4지선다·서답형 1.5점/진위형 1.0점) — evaluatePass가 소비한다.
  // ISTQB는 전 문항이 동일 배점이라 결과가 단순 정답률과 같아 무해하지만, 실제로 쓰는 건 CSTS뿐이다.
  const cstsWeighted = useMemo(
    () => computeCstsWeightedScore(currentQuestions, answers, answerKeyOf),
    [currentQuestions, answers, answerKeyOf],
  );

  const gradeKey = gradeKeyFor(setId, mode);
  const isGraded = Boolean(graded[gradeKey]);
  // 시험 단계 파생 상태의 단일 원천 — 게이트(QuestionWorkspace)·잠금(Sidebar)·
  // 통계 연습 버튼(AppModals)이 모두 이 값을 쓴다. 규칙을 한 곳만 고치면 되게 한다.
  // - showExamGate: 완전히 새로 시작하는 시험(시작 전·미채점·답안 없음)에서만 게이트 노출.
  //   answered>0(이어풀기 복원)은 이미 응시 개시로 본다.
  // - examLocked: 응시 중(시작 후 미채점)에는 세트/모드 전이를 잠근다.
  const showExamGate = mode === 'exam' && !examStarted && !isGraded && answered === 0;
  const examLocked = mode === 'exam' && !!examStarted && !isGraded;
  // 시험은 시작 게이트 통과(또는 이어풀기 답안 존재) 전에는 채점 불가 — 게이트는
  // 워크스페이스만 가리므로, 이 조건이 없으면 사이드바 '채점하기'로 응시한 적 없는
  // 시험이 0/N 유령 회차로 기록된다.
  const examUnderway = mode !== 'exam' || !!examStarted || answered > 0;
  const canGrade = (mode === 'exam' || mode === 'random') && !isGraded && total > 0 && examUnderway;
  const progressPercent = total ? Math.round((answered / total) * 100) : 0;

  const handleGrade = () => {
    // 멱등성 가드 — 같은 tick 더블클릭 등으로 재진입해도 회차/통계가 이중 집계되지 않게 한다.
    // 버튼 disabled(canGrade)는 리렌더 이후에야 반영되므로 채점 상태를 직접 확인한다.
    if (useQuizStore.getState().graded[gradeKey]) return;
    // 문항이 아직 로드되지 않았으면 채점하지 않는다. canGrade에만 total>0 가드가 있어
    // 버튼 경로는 막혔지만, 제한시간 자동 제출은 canGrade를 거치지 않고 직접 호출된다 —
    // 복원 직후(문항 fetch 진행 중)에 만료가 걸리면 0/0 유령 회차가 기록됐다.
    if (total === 0) return;
    // 오답 목록은 위 메모(wrongQuestions)와 같은 판정을 재사용한다 — 따로 계산하면
    // 판정 규칙이 갈라져 화면 표시와 기록이 어긋날 수 있다.
    const wrongQs = wrongQuestions.map(({ q }) => q);
    const wrongIds = wrongQs.map((q) => q.id || `legacy-${q.number}`);
    // 오답 노트(세트 전체 회차 리스트)용 상세를 채점 시점에 함께 저장한다(4A).
    const wrongItems = wrongQs.map((q) => ({
      number: q.number,
      myAnswer: answers[answerKeyOf(q)] || [],
      correctAnswer: q.answer,
    }));
    const setTitle = appData?.sets.find((s) => s.id === setId)?.title;
    const chapterOutcome = buildChapterStats(currentQuestions, answers, answerKeyOf);
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
      chapterStats: chapterOutcome.stats,
      // 문항 id까지 남긴다 — 재풀이해도 챕터 분모가 부풀지 않게 합산에서 최신 결과만 고른다.
      chapterQuestions: chapterOutcome.questions,
      // CSTS 합격 판정 가중 점수 스냅샷(직전 회차 대비 비교에서 재사용) — ISTQB는 저장하지 않는다.
      cstsWeighted: useQuizStore.getState().activeProduct === 'csts' ? cstsWeighted : undefined,
      // 챕터 미니 시험(랜덤+필터) 표식 — 타임라인·회차 비교에서 세트 전체 회차와 분리된다.
      // (연습은 채점이 없고 시험 모드 진입 시 setMode가 필터를 해제하므로 랜덤에서만 값이 실린다)
      chapter: useQuizStore.getState().chapterFilter ?? undefined,
    };
    addHistory(history);
    // 채점 이력을 IndexedDB에 영속화(새로고침 후 통계 대시보드에서 조회).
    saveHistoryToDB(history);
    // 모드별로 저장해 랜덤 채점이 시험 오답 목록을 덮어쓰지 않게 한다(오답 모드는 합집합을 읽음).
    setReviewIds(gradeKey, wrongIds);
    // 다시 틀린 문항은 '복습함'에서 되돌린다 — 아니면 한 번 복습했다는 이유로
    // 이후 계속 오답인데도 재풀이 목록에 영영 나타나지 않는다.
    unmarkReviewed(setId, wrongItems.map((w) => w.number));
    setGraded(gradeKey, true);
  };

  // 오답 모드 '복습 완료' — 지금 맞힌 문항을 재풀이 대상에서 뺀다.
  // 오답 모드는 즉시 피드백이라 이미 정오답이 확정돼 있으므로 별도 채점이 필요 없다.
  // 회차로 기록하지 않는 이유: 오답만 골라 푼 표본이라 통계(정답률·회차)에 섞으면 왜곡된다.
  const reviewedCount = mode === 'review'
    ? currentQuestions.filter((q) =>
        isQuestionCorrect(q.answer, answers[answerKeyOf(q)] || [], q.type, q.answerParts)).length
    : 0;
  const completeReview = () => {
    if (mode !== 'review') return 0;
    const done = currentQuestions.filter((q) =>
      isQuestionCorrect(q.answer, answers[answerKeyOf(q)] || [], q.type, q.answerParts));
    if (done.length) markReviewed(setId, done.map((q) => q.number));
    return done.length;
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
    cstsWeighted,
    isGraded,
    canGrade,
    reviewedCount,
    completeReview,
    showExamGate,
    examLocked,
    progressPercent,
    wrongQuestions,
    handleGrade,
    gradeAndShow,
    requestGrade,
  };
}
