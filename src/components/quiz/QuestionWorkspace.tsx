import React, { useEffect } from 'react';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuestions } from '../../hooks/useQuestions';
import { QuestionCard } from './QuestionCard';

export const QuestionWorkspace = () => {
  const { index, setIndex, mode, tickTimer, startTimer } = useQuizStore();
  const { currentQuestions } = useQuestions();

  useEffect(() => {
    startTimer();
    let interval: any;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearInterval(interval);
      } else {
        interval = setInterval(tickTimer, 1000);
      }
    };

    interval = setInterval(tickTimer, 1000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [mode, startTimer, tickTimer]);

  if (!currentQuestions.length) {
    return <div className="workspace">문제를 불러오는 중이거나 문제가 없습니다.</div>;
  }

  const currentQuestion = currentQuestions[index];

  return (
    <div className="workspace">
      <div className="question-nav">
        {currentQuestions.map((q, i) => (
          <button 
            key={q.id || i}
            className={`nav-btn ${i === index ? 'active' : ''}`}
            onClick={() => setIndex(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="question-container">
        <QuestionCard question={currentQuestion} />
      </div>

      <div className="nav-actions">
        <button 
          disabled={index === 0} 
          onClick={() => setIndex(i => i - 1)}
        >
          이전
        </button>
        <button 
          disabled={index === currentQuestions.length - 1} 
          onClick={() => setIndex(i => i + 1)}
        >
          다음
        </button>
      </div>
    </div>
  );
};
