import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../store/useQuizStore';
import { useQuestions, Question } from './useQuestions';
import { isQuestionCorrect } from '../utils/answer';
import { isQuickCommitted, isAnsweredInMode } from '../utils/quickStats';
import { answerKeyFor, gradeKeyFor } from '../utils/answerKey';
import { buildRoundHistory, makeRoundId } from '../utils/roundHistory';
import { questionKey } from '../utils/chapterStats';
import { computeCstsWeightedScore } from '../utils/scoring';
import { isGradedMode } from '../utils/modeLabel';
import { saveHistoryToDB } from '../utils/storage';

// 사이드바(통계·채점·진행률)와 워크스페이스(문항·네비)가 공유하는 파생 상태/액션.
// 레거시 레이아웃은 채점 버튼·진행률을 사이드바에, 문항을 워크스페이스에 두므로
// 두 컴포넌트가 동일한 세션 계산을 필요로 한다 — 한 곳에 모아 중복을 제거한다.
export function useQuizSession() {
  // 슬라이스 구독(O1) — elapsedSeconds는 구독하지 않고 채점 시점에 getState()로 읽는다
  // (구독하면 이 훅을 쓰는 모든 컴포넌트가 타이머 틱마다 리렌더된다).
  const { mode, setId, answers, graded, examStarted, addHistory, addQuickRound, setReviewIds, setGraded, setResultOpen, setConfirmGradeOpen, markReviewed, unmarkReviewed } =
    useQuizStore(useShallow((s) => ({
      mode: s.mode, setId: s.setId, answers: s.answers, graded: s.graded,
      examStarted: s.examStarted[s.setId],
      addHistory: s.addHistory, addQuickRound: s.addQuickRound, setReviewIds: s.setReviewIds, setGraded: s.setGraded,
      markReviewed: s.markReviewed, unmarkReviewed: s.unmarkReviewed,
      setResultOpen: s.setResultOpen, setConfirmGradeOpen: s.setConfirmGradeOpen,
    })));
  const { appData, currentQuestions, listContext, loadError, retryLoad } = useQuestions();

  // 각 모드는 자체 답안 네임스페이스를 사용한다(오답 모드는 재풀이용 별도 기록).
  // useCallback: 아래 파생 메모들의 의존성이라 매 렌더 참조가 바뀌면 메모가 무효화된다.
  const answerKeyOf = useCallback(
    (q: Question) => answerKeyFor(setId, mode, q),
    [setId, mode],
  );

  /**
   * 채점 대상 문항.
   *
   * 퀵만 다르다 — **실제로 답을 확정한 문항까지만** 회차로 남긴다. 다른 모드는 회차가 곧
   * 세트(또는 추첨분) 전체라 미응답을 오답으로 세는 것이 맞지만, 퀵은 끝을 정해 놓지 않고
   * 전 세트를 뽑아 두는 모드다. 그대로 채점하면 한 문항만 풀고 눌러도 **뽑아 둔 390문항이
   * 통째로 회차에 들어가고 389개가 오답으로 기록된다** — 챕터 분모가 첫 채점에 제품 전체로
   * 뛰고(약점 분석이 무의미해진다) 24시간 퀵 오답 목록에는 본 적도 없는 문항이 쌓인다.
   *
   * 판정은 computeQuickStats와 같은 isQuickCommitted를 쓴다. 화면의 점수판이 "진행 5"라고
   * 말했으면 회차도 5문항이어야 한다 — 두 곳이 각자 판정하면 그 둘이 어긋난다.
   *
   * 술어뿐 아니라 **세는 범위**도 같아야 한다. 종전 점수판은 현재 커서까지만 세어, ‹ 로 앞
   * 문항에 돌아간 상태에서 채점하면 화면은 "진행 1"인데 회차는 3문항으로 기록됐다 — 술어를
   * 공유하고도 범위가 갈려 같은 결함이 났다. 지금은 양쪽 다 '확정한 문항 전부'이며,
   * 그 관계를 quickStats.test.ts의 교차 계약 검사가 고정한다.
   */
  const gradableQuestions = useMemo(
    () => (mode === 'quick'
      ? currentQuestions.filter((q) => isQuickCommitted(q, answers[answerKeyOf(q)] || []))
      : currentQuestions),
    [mode, currentQuestions, answers, answerKeyOf],
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
      // '답함'의 기준은 모드가 정한다 — 퀵은 확정(복수정답은 다 골라야)이라야 답함이다.
      // 팔레트 색도 같은 함수를 쓴다(isAnsweredInMode가 단일 원천).
      if (isAnsweredInMode(mode, q, selected)) answeredCount += 1;
      if (isQuestionCorrect(q.answer, selected, q.type, q.answerParts)) correct += 1;
      // 채점된 시험/랜덤 또는 오답 모드에서 틀린 문항 목록(오답노트·네비 표시용).
      else wrong.push({ q, i });
    });
    return { answered: answeredCount, correctCount: correct, wrongQuestions: wrong };
  }, [mode, currentQuestions, answers, answerKeyOf]);
  // CSTS 합격 판정용 가중 점수(4지선다·서답형 1.5점/진위형 1.0점) — evaluatePass가 소비한다.
  // ISTQB는 전 문항이 동일 배점이라 결과가 단순 정답률과 같아 무해하지만, 실제로 쓰는 건 CSTS뿐이다.
  const cstsWeighted = useMemo(
    () => computeCstsWeightedScore(currentQuestions, answers, answerKeyOf),
    [currentQuestions, answers, answerKeyOf],
  );

  /**
   * 결과 요약이 쓰는 집계 — 회차로 기록되는 범위와 같아야 한다(gradableQuestions).
   * 퀵이 아니면 currentQuestions와 동일하므로 total·correctCount와 값이 같다.
   * 나누지 않으면 퀵 결과가 "3 / 390문항 · 오답 387"처럼, 보지도 않은 문항을 오답으로
   * 세어 보여준다 — 기록에 남는 회차(3문항)와도 어긋난다.
   */
  const { gradedTotal, gradedCorrect } = useMemo(() => ({
    gradedTotal: gradableQuestions.length,
    gradedCorrect: gradableQuestions.filter((q) =>
      isQuestionCorrect(q.answer, answers[answerKeyOf(q)] || [], q.type, q.answerParts)).length,
  }), [gradableQuestions, answers, answerKeyOf]);

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
  const canGrade = isGradedMode(mode) && !isGraded && total > 0 && examUnderway;
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
    // 퀵은 확정한 문항까지만 회차로 남기므로(gradableQuestions) 오답도 그 범위로 좁힌다 —
    // 아니면 아직 보지도 않은 문항이 전부 오답으로 기록된다.
    const gradable = new Set(gradableQuestions);
    const wrongQs = wrongQuestions.map(({ q }) => q).filter((q) => gradable.has(q));
    const wrongIds = wrongQs.map(questionKey);
    // 퀵은 세트 하나에 매이지 않아 index.json에서 제목을 찾을 수 없다 — 그대로 두면
    // 통계 목록에 센티넬 'QUICK'이 그대로 노출된다.
    const setTitle = mode === 'quick'
      ? '퀵 랜덤'
      : appData?.sets.find((s) => s.id === setId)?.title;
    // 회차 레코드 조립은 utils/roundHistory가 단일 원천이다 — 훅 안에 두면 유닛이 닿지
    // 못해(이 훅은 커버리지 0%였다) 필드 누락이 새로고침 뒤에야 조용히 드러났다.
    // 시각·난수는 인자로 넘겨 그쪽을 결정적으로 유지한다.
    const snapshot = useQuizStore.getState();
    const history = buildRoundHistory({
      setId,
      mode,
      questions: gradableQuestions,
      answers,
      answerKeyOf,
      wrongQuestions: wrongQs,
      // 소속 제품을 기록에 남긴다 — 세트가 훗날 index.json에서 빠져도 제품 스코프
      // 통계/삭제에서 이력이 고아가 되지 않는다.
      certification: snapshot.activeProduct ?? undefined,
      setTitle,
      // 매초 리렌더를 피하려고 구독 대신 채점 시점에 스냅샷으로 읽는다(O1).
      elapsedSeconds: snapshot.elapsedSeconds,
      // 챕터 미니 시험(랜덤+필터) 표식 — 타임라인·회차 비교에서 세트 전체 회차와 분리된다.
      // (연습은 채점이 없고 시험 모드 진입 시 setMode가 필터를 해제하므로 랜덤에서만 값이 실린다)
      chapter: snapshot.chapterFilter ?? undefined,
      // CSTS 합격 판정 가중 점수 스냅샷 — ISTQB는 저장하지 않는다(단순 정답률이라 불필요).
      cstsWeighted: snapshot.activeProduct === 'csts' ? cstsWeighted : undefined,
      now: Date.now(),
      id: makeRoundId(),
    });
    if (mode === 'quick') {
      // 퀵은 회차 기록을 남기지 않는다(요약·타임라인·이력 목록에 나오지 않는다).
      // 대신 24시간 임시 보관에 넣어 방금 틀린 것을 볼 수 있게 하고, 챕터 통계에는 합산한다.
      // 세트별 오답 버킷(reviewIds)에는 넣지 않는다 — 세트를 다 풀지도 않았는데 그 세트의
      // 오답 모드에 섞이면, 세트 단위 학습 흐름이 퀵 결과로 오염된다.
      // 이 결정이 사양의 단일 원천이다. 읽는 쪽(useQuestions의 review 분기)도 퀵 키를
      // 보지 않는다 — 종전에는 읽기만 남아 있어 "담긴다"는 주석과 실제가 어긋났다.
      addQuickRound(history);
    } else {
      addHistory(history);
      // 채점 이력을 IndexedDB에 영속화(새로고침 후 통계 대시보드에서 조회).
      saveHistoryToDB(history);
    }
    if (mode !== 'quick') {
      // 모드별로 저장해 랜덤 채점이 시험 오답 목록을 덮어쓰지 않게 한다(오답 모드는 합집합을 읽음).
      setReviewIds(gradeKey, wrongIds);
      // 다시 틀린 문항은 '복습함'에서 되돌린다 — 아니면 한 번 복습했다는 이유로
      // 이후 계속 오답인데도 재풀이 목록에 영영 나타나지 않는다.
      unmarkReviewed(setId, wrongQs.map((q) => q.number));
    }
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
    // 지금 실린 목록이 어느 맥락에서 만들어졌는지 — 스토어의 mode/setId와 다를 수 있다
    // (비동기 출제가 끝나기 전 구간). 워크스페이스가 이 값을 DOM에 적는다.
    listContext,
    loadError,
    retryLoad,
    answerKeyOf,
    total,
    answered,
    correctCount,
    // 결과 요약용(회차로 기록되는 범위) — 퀵이 아니면 total·correctCount와 같다.
    gradedTotal,
    gradedCorrect,
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
