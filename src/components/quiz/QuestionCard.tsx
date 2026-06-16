import React, { useState, useCallback } from 'react';
import { useQuizStore } from '../../store/useQuizStore';
import { Question } from '../../hooks/useQuestions';
import { isAnswerCorrect } from '../../utils/answer';
import { RichText } from '../../utils/parser';

interface OptionItemProps {
  opt: { key: string; text: string };
  isSelected: boolean;
  showFeedback: boolean;
  mode: string;
  isCorrectAnswer: boolean;
  handleSelect: (key: string) => void;
}

const OptionItem = React.memo(({
  opt,
  isSelected,
  showFeedback,
  mode,
  isCorrectAnswer,
  handleSelect
}: OptionItemProps) => {
  let className = "option";
  if (isSelected) className += " selected";
  if (showFeedback || mode === 'review') {
    if (isCorrectAnswer) className += " correct";
    else if (isSelected) className += " wrong";
  }

  return (
    <button 
      type="button"
      className={className}
      aria-pressed={isSelected}
      aria-label={`선택지 ${opt.key}${isSelected ? ", 선택됨" : ""}`}
      onClick={() => handleSelect(opt.key)}
    >
      <span className="option-key">{opt.key.toUpperCase()}</span>
      <span className="option-text">
        <RichText content={opt.text} />
      </span>
    </button>
  );
});

export const QuestionCard = React.memo(({ question }: { question: Question }) => {
  const { mode, setId, answers, setAnswer, graded } = useQuizStore();
  const [showFeedback, setShowFeedback] = useState(false);

  // 오답(review) 모드는 시험(exam) 답안을 읽고/판정한다.
  const answerMode = mode === 'review' ? 'exam' : mode;
  const answerKey = `${setId}-${answerMode}-${question.id || question.number}`;
  const selected = answers[answerKey] || [];
  const isMulti = question.answer.length > 1;
  const isGraded = Boolean(graded[`${setId}-${answerMode}`]);
  // 정답/해설 공개 조건: 연습 즉시피드백 · 오답 모드 · 채점 완료
  const reveal = showFeedback || mode === 'review' || isGraded;

  const handleSelect = useCallback((key: string) => {
    if (isGraded) return; // 채점 후 선택 잠금
    if (mode === 'exam' || mode === 'practice') {
      let newSelected = [...selected];
      if (isMulti) {
        if (newSelected.includes(key)) {
          newSelected = newSelected.filter(k => k !== key);
        } else if (newSelected.length < question.answer.length) {
          newSelected.push(key);
        }
        // 복수정답도 모든 보기를 고르면 연습 모드에서 즉시 피드백(#80).
        if (mode === 'practice' && newSelected.length === question.answer.length) {
          setShowFeedback(true);
        }
      } else {
        newSelected = [key];
        if (mode === 'practice') setShowFeedback(true);
      }
      setAnswer(answerKey, newSelected);
    }
  }, [mode, isGraded, isMulti, question.answer.length, selected, answerKey, setAnswer]);

  const isCorrect = () => isAnswerCorrect(question.answer, selected);

  return (
    <>
      <h2 id="questionTitle" className="question-title">
        문제 {question.number} {isMulti ? " · 복수정답" : ""}
      </h2>

      <div id="questionStem" className="question-stem">
        <RichText content={question.stem} />
      </div>

      {question.figure && (
        <div id="questionFigure" className="question-figure">
          <img src={question.figure} alt="Reference figure" />
        </div>
      )}

      <div id="options" className="options">
        {isMulti && (
          <div className="multi-answer-badge">
            <span className="badge-icon">⚠️</span> {question.answer.length}개 선택 문제 — 정답을 <strong>{question.answer.length}개</strong> 모두 고르세요.
          </div>
        )}

        {question.options.map((opt) => {
          const isSelected = selected.includes(opt.key);
          const isCorrectAnswer = question.answer.map(a => a.toLowerCase()).includes(opt.key.toLowerCase());
          
          return (
            <OptionItem
              key={opt.key}
              opt={opt}
              isSelected={isSelected}
              showFeedback={reveal}
              mode={mode}
              isCorrectAnswer={isCorrectAnswer}
              handleSelect={handleSelect}
            />
          );
        })}
      </div>

      {reveal && (
        <div id="feedback" className={`feedback-panel ${isCorrect() ? 'correct' : 'wrong'}`}>
          <div className="feedback-result">
            {isCorrect() ? '✅ 정답입니다' : '❌ 오답입니다'}
            <span className="correct-answer-text">
              정답: {question.answer.join(', ').toUpperCase()}
            </span>
          </div>
          <div className="feedback-explanation">
            <RichText content={question.explanation || '해설이 없습니다.'} />
          </div>
        </div>
      )}
    </>
  );
});
