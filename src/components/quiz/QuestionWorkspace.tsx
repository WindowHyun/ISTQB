import React, { useEffect } from 'react';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuestions } from '../../hooks/useQuestions';
import { flushPersist } from '../../utils/storage';
import { QuestionCard } from './QuestionCard';

export const QuestionWorkspace = () => {
  const { index, setIndex, mode, tickTimer, startTimer } = useQuizStore();
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

  return (
    <div className="workspace">
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
    </div>
  );
};
