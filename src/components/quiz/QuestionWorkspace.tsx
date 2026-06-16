import React, { useEffect } from 'react';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuestions, Question } from '../../hooks/useQuestions';
import { flushPersist } from '../../utils/storage';
import { isAnswerCorrect } from '../../utils/answer';
import { QuestionCard } from './QuestionCard';

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const QuestionWorkspace = () => {
  const {
    index, setIndex, mode, setId, answers, elapsedSeconds, graded,
    tickTimer, startTimer, addHistory, setReviewIds, setGraded,
  } = useQuizStore();
  const { currentQuestions } = useQuestions();

  useEffect(() => {
    startTimer();
    let interval: ReturnType<typeof setInterval> | undefined;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 숨김 직전까지만 누적하고 멈춘다. (백그라운드 체류 시간은 제외)
        tickTimer();
        flushPersist(); // 경과 시간을 이 시점에 저장(#71)
        clearInterval(interval);
      } else {
        // 복귀 시 기준 시각을 now로 재설정해 백그라운드 간격이 합산되지 않게 한다.
        startTimer();
        interval = setInterval(tickTimer, 1000);
      }
    };

    interval = setInterval(tickTimer, 1000);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      flushPersist(); // 언마운트 시 경과 시간 저장(#71)
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [mode, startTimer, tickTimer]);

  // index가 현재 목록 범위를 벗어나면 보정(세트/모드 전환 잔여 index 방어, #70)
  useEffect(() => {
    const total = currentQuestions.length;
    if (total && (index < 0 || index >= total)) {
      setIndex(Math.min(Math.max(index, 0), total - 1));
    }
  }, [currentQuestions.length, index, setIndex]);

  // 키보드 좌우 화살표로 문항 이동 (입력 필드 포커스 시 제외)
  useEffect(() => {
    const total = currentQuestions.length;
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (event.key === "ArrowRight") setIndex((i) => Math.min(total - 1, i + 1));
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [setIndex, currentQuestions.length]);

  if (!currentQuestions.length) {
    return <div className="workspace">문제를 불러오는 중이거나 문제가 없습니다.</div>;
  }

  const safeIndex = Math.min(Math.max(index, 0), currentQuestions.length - 1);
  const currentQuestion = currentQuestions[safeIndex];

  const answerMode = mode === 'review' ? 'exam' : mode;
  const answerKeyOf = (q: Question) => `${setId}-${answerMode}-${q.id || q.number}`;
  const total = currentQuestions.length;
  const answered = currentQuestions.filter((q) => (answers[answerKeyOf(q)] || []).length > 0).length;
  const correctCount = currentQuestions.filter((q) => isAnswerCorrect(q.answer, answers[answerKeyOf(q)] || [])).length;
  const gradeKey = `${setId}-${mode}`;
  const isGraded = Boolean(graded[gradeKey]);
  const canGrade = (mode === 'exam' || mode === 'random') && !isGraded;

  // 오답노트: 채점된 시험/랜덤 또는 오답 모드에서 틀린 문항을 한눈에 보고 이동.
  const showWrongNote = (isGraded && (mode === 'exam' || mode === 'random')) || mode === 'review';
  const wrongQuestions = showWrongNote
    ? currentQuestions
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => !isAnswerCorrect(q.answer, answers[answerKeyOf(q)] || []))
    : [];

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

  return (
    <div className="workspace">
      <div className="workspace-header">
        <span className="ws-stat" aria-live="polite">진행 {answered} / {total}</span>
        <span className="ws-stat ws-timer">⏱ {formatTime(elapsedSeconds)}</span>
        {canGrade && (
          <button type="button" className="primary grade-btn" data-testid="grade-button" onClick={handleGrade}>
            채점하기
          </button>
        )}
        {(mode === 'exam' || mode === 'random') && isGraded && (
          <span className="ws-score" data-testid="score" aria-live="polite">점수 {correctCount} / {total}</span>
        )}
      </div>

      <nav className="question-nav" aria-label="문제 번호">
        {currentQuestions.map((q, i) => (
          <button
            key={q.id || i}
            type="button"
            className={`nav-btn ${i === index ? 'active' : ''}`}
            aria-label={`문제 ${i + 1}${i === index ? ", 현재 문제" : ""}`}
            aria-current={i === index ? "true" : undefined}
            onClick={() => setIndex(i)}
          >
            {i + 1}
          </button>
        ))}
      </nav>

      <div className="question-container">
        <QuestionCard question={currentQuestion} />
      </div>

      <div className="nav-actions">
        <button
          type="button"
          disabled={index === 0}
          aria-label="이전 문제"
          onClick={() => setIndex(i => i - 1)}
        >
          이전
        </button>
        <button
          type="button"
          disabled={index === currentQuestions.length - 1}
          aria-label="다음 문제"
          onClick={() => setIndex(i => i + 1)}
        >
          다음
        </button>
      </div>

      {showWrongNote && wrongQuestions.length > 0 && (
        <details className="wrong-note" data-testid="wrong-note">
          <summary>오답노트 ({wrongQuestions.length})</summary>
          <ul className="wrong-note-list">
            {wrongQuestions.map(({ q, i }) => {
              const mine = (answers[answerKeyOf(q)] || []).map((s) => s.toUpperCase()).join(', ') || '-';
              const correct = q.answer.map((s) => s.toUpperCase()).join(', ');
              return (
                <li key={q.id || i}>
                  <button type="button" className="wrong-note-jump" onClick={() => setIndex(i)}>
                    문제 {q.number}
                  </button>
                  <span className="wrong-note-ans">내 답 {mine} · 정답 {correct}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
};
