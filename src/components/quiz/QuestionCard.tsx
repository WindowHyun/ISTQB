import React, { useState, useCallback } from 'react';
import { useQuizStore } from '../../store/useQuizStore';
import { Question } from '../../hooks/useQuestions';
import { isQuestionCorrect } from '../../utils/answer';
import { RichText } from '../../utils/parser';
import { openImageLightbox } from '../../utils/lightbox';

interface OptionItemProps {
  opt: { key: string; text: string };
  isSelected: boolean;
  showFeedback: boolean;
  isCorrectAnswer: boolean;
  locked: boolean;
  handleSelect: (key: string) => void;
}

const OptionItem = React.memo(({
  opt,
  isSelected,
  showFeedback,
  isCorrectAnswer,
  locked,
  handleSelect,
}: OptionItemProps) => {
  let className = "option";
  if (isSelected) className += " selected";
  if (showFeedback) {
    if (isCorrectAnswer) className += " correct";
    else if (isSelected) className += " wrong";
  }

  return (
    <button
      type="button"
      className={className}
      aria-pressed={isSelected}
      disabled={locked}
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

const TF_OPTIONS = [
  { key: 'o', text: 'O (맞다 / 참)' },
  { key: 'x', text: 'X (틀리다 / 거짓)' },
];

export const QuestionCard = React.memo(({ question }: { question: Question }) => {
  const { mode, setId, answers, setAnswer, graded } = useQuizStore();
  const [showFeedback, setShowFeedback] = useState(false);

  const answerKey = `${setId}-${mode}-${question.id || question.number}`;
  const selected = answers[answerKey] || [];

  const hasOptions = question.options.length > 0;
  const isTrueFalse = !hasOptions && question.type === 'true_false';
  const isShort = !hasOptions && question.type === 'short_answer';
  const displayOptions = hasOptions
    ? question.options
    : isTrueFalse
      ? TF_OPTIONS
      : [];

  const isMulti = hasOptions && question.answer.length > 1;
  const isGraded = Boolean(graded[`${setId}-${mode}`]);
  // 연습·오답 모드는 즉시 피드백, 시험·랜덤은 채점 후 공개.
  const immediate = mode === 'practice' || mode === 'review';
  const reveal = showFeedback || isGraded;
  const locked = isGraded; // 채점 후 잠금(연습/오답은 잠그지 않음)

  const handleSelect = useCallback((key: string) => {
    if (isGraded) return;
    let newSelected = [...selected];
    if (isMulti) {
      if (newSelected.includes(key)) {
        newSelected = newSelected.filter((k) => k !== key);
      } else if (newSelected.length < question.answer.length) {
        newSelected.push(key);
      }
      if (immediate && newSelected.length === question.answer.length) setShowFeedback(true);
    } else {
      newSelected = [key];
      if (immediate) setShowFeedback(true);
    }
    setAnswer(answerKey, newSelected);
  }, [isGraded, isMulti, immediate, question.answer.length, selected, answerKey, setAnswer]);

  const handleShortInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAnswer(answerKey, e.target.value ? [e.target.value] : []);
  };

  const correct = isQuestionCorrect(question.answer, selected, question.type);
  const answerDisplay = isShort || isTrueFalse
    ? question.answer.join(', ').toUpperCase()
    : question.answer.join(', ').toUpperCase();

  // figure 필드와 stem 내 이미지가 같은 파일을 가리키면 중복 렌더 방지(#2).
  const stemHasFigure =
    !!question.figure && JSON.stringify(question.stem ?? '').includes(question.figure);

  return (
    <>
      <div id="questionStem" className="question-stem">
        <RichText content={question.stem} />
      </div>

      {question.figure && !stemHasFigure && (
        <div id="questionFigure" className="question-figure">
          <img
            src={question.figure}
            alt="문제 참고 이미지 (클릭하면 확대)"
            role="button"
            tabIndex={0}
            onClick={() => openImageLightbox(question.figure as string)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openImageLightbox(question.figure as string);
              }
            }}
          />
        </div>
      )}

      <div id="options" className="options">
        {isMulti && (
          <div className="multi-answer-badge">
            <span className="badge-icon">⚠️</span> {question.answer.length}개 선택 문제 — 정답을 <strong>{question.answer.length}개</strong> 모두 고르세요.
          </div>
        )}

        {displayOptions.map((opt) => {
          const isSelected = selected.includes(opt.key);
          const isCorrectAnswer = question.answer.map((a) => a.toLowerCase()).includes(opt.key.toLowerCase());
          return (
            <OptionItem
              key={opt.key}
              opt={opt}
              isSelected={isSelected}
              showFeedback={reveal}
              isCorrectAnswer={isCorrectAnswer}
              locked={locked}
              handleSelect={handleSelect}
            />
          );
        })}

        {isShort && (
          <div className="short-answer">
            <input
              type="text"
              className="short-answer-input"
              value={selected[0] || ''}
              disabled={locked}
              placeholder="정답을 입력하세요"
              aria-label="단답형 정답 입력"
              onChange={handleShortInput}
            />
            {immediate && !reveal && (
              <button
                type="button"
                className="short-answer-check"
                onClick={() => setShowFeedback(true)}
              >
                정답 확인
              </button>
            )}
          </div>
        )}
      </div>

      {reveal && (
        <div
          id="feedback"
          className={`feedback ${correct ? 'correct' : 'wrong'}`}
          role="status"
          aria-live="polite"
        >
          <strong>
            {correct ? '✅ 정답입니다' : '❌ 오답입니다'} · 정답 {answerDisplay}
          </strong>
          <div className="feedback-body">
            <RichText content={question.explanation || '해설이 없습니다.'} />
          </div>
        </div>
      )}
    </>
  );
});
