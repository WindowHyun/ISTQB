import { useEffect } from 'react';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { isQuestionCorrect } from '../../utils/answer';
import { flushPersist } from '../../utils/storage';
import { QuestionCard } from './QuestionCard';

export const QuestionWorkspace = () => {
  const { index, setId, mode, answers, setIndex, tickTimer, startTimer } = useQuizStore();
  const { appData, currentQuestions, answerKeyOf, isGraded } = useQuizSession();

  useEffect(() => {
    startTimer();
    let interval: ReturnType<typeof setInterval> | undefined;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        tickTimer();
        flushPersist(); // 경과 시간을 이 시점에 저장(#71)
        clearInterval(interval);
      } else {
        startTimer();
        interval = setInterval(tickTimer, 1000);
      }
    };
    interval = setInterval(tickTimer, 1000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(interval);
      flushPersist();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else if (event.key === 'ArrowRight') setIndex((i) => Math.min(total - 1, i + 1));
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [setIndex, currentQuestions.length]);

  if (!currentQuestions.length) {
    return (
      <section className="workspace" aria-label="문제 풀이 영역">
        <article className="question-card">
          <p className="nav-summary">문제를 불러오는 중이거나 표시할 문제가 없습니다.</p>
        </article>
      </section>
    );
  }

  const total = currentQuestions.length;
  const safeIndex = Math.min(Math.max(index, 0), total - 1);
  const currentQuestion = currentQuestions[safeIndex];
  const isMulti = currentQuestion.answer.length > 1;
  const setTitle = appData?.sets.find((s) => s.id === setId)?.title || '';

  return (
    <section className="workspace" aria-label="문제 풀이 영역">
      <header className="topbar">
        <div>
          <p id="setMeta">{setTitle}</p>
          <h2 id="questionTitle">문제 {currentQuestion.number}{isMulti ? ' · 복수정답' : ''}</h2>
        </div>
        <div className="topbar-actions">
          <button
            id="prevBtn"
            type="button"
            aria-label="이전 문제"
            disabled={safeIndex === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            ‹
          </button>
          <button
            id="nextBtn"
            type="button"
            aria-label="다음 문제"
            disabled={safeIndex === total - 1}
            onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
          >
            ›
          </button>
        </div>
      </header>

      <article className="question-card">
        {/* mode+문항을 key로 묶어 카드를 remount → showFeedback 등 로컬 상태가
            문항 이동·모드 전환 간 누수되지 않게 한다(#79). */}
        <QuestionCard
          key={`${mode}-${currentQuestion.id || currentQuestion.number}`}
          question={currentQuestion}
        />
      </article>

      <nav id="questionNav" className="question-nav" aria-label="문제 번호">
        {currentQuestions.map((q, i) => {
          const selected = answers[answerKeyOf(q)] || [];
          const classes: string[] = [];
          if (i === safeIndex) classes.push('current');
          if (isGraded) classes.push(isQuestionCorrect(q.answer, selected, q.type) ? 'correct' : 'missed');
          else classes.push(selected.length > 0 ? 'answered' : 'unanswered');
          return (
            <button
              key={q.id || i}
              type="button"
              className={classes.join(' ')}
              aria-label={`문제 ${i + 1}${i === safeIndex ? ', 현재 문제' : ''}`}
              aria-current={i === safeIndex ? 'true' : undefined}
              onClick={() => setIndex(i)}
            >
              {i + 1}
            </button>
          );
        })}
      </nav>
    </section>
  );
};
