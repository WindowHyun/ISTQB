import React, { useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../../store/useQuizStore';
import { answerKeyFor, gradeKeyFor } from '../../utils/answerKey';
import { Question } from '../../hooks/useQuestions';
import { isQuestionCorrect } from '../../utils/answer';
import { isQuickCommitted } from '../../utils/quickStats';
import { formatAnswerList } from '../../utils/answerDisplay';
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
        {/* inline: 보기 값("33.3%", "10.5 M/D")이 하위 번호 마커로 오인·강조되지 않게 */}
        <RichText content={opt.text} inline />
      </span>
    </button>
  );
});

const TF_OPTIONS = [
  { key: 'o', text: 'O (맞다 / 참)' },
  { key: 'x', text: 'X (틀리다 / 거짓)' },
];

export const QuestionCard = React.memo(({ question }: { question: Question }) => {
  // 슬라이스 구독(O1) — 타이머 틱에 리렌더되지 않아 React.memo가 실효를 갖는다.
  const { mode, setId, answers, setAnswer, graded } = useQuizStore(useShallow((s) => ({
    mode: s.mode, setId: s.setId, answers: s.answers, setAnswer: s.setAnswer, graded: s.graded,
  })));
  const [showFeedback, setShowFeedback] = useState(false);

  const answerKey = answerKeyFor(setId, mode, question);
  // `|| []` 폴백을 useMemo로 감싸 참조를 안정화 — handleSelect(useCallback) 의존성이
  // 매 렌더 바뀌는 것을 막는다(react-hooks/exhaustive-deps 경고 해소).
  const selected = React.useMemo(() => answers[answerKey] || [], [answers, answerKey]);

  const hasOptions = question.options.length > 0;
  const isTrueFalse = !hasOptions && question.type === 'true_false';
  const isShort = !hasOptions && question.type === 'short_answer';
  // 다답형 서답형(서로 다른 답을 여러 칸에서 요구) — 라벨별 입력 칸을 렌더한다.
  const parts = question.answerParts;
  const isMultiPart = isShort && !!parts && parts.length > 0;
  const displayOptions = hasOptions
    ? question.options
    : isTrueFalse
      ? TF_OPTIONS
      : [];

  const isMulti = hasOptions && question.answer.length > 1;
  const isGraded = Boolean(graded[gradeKeyFor(setId, mode)]);
  const isQuick = mode === 'quick';
  // 연습·오답·퀵은 즉시 피드백, 시험만 채점 후 공개.
  const immediate = mode === 'practice' || mode === 'review' || isQuick;
  // 퀵의 공개·잠금은 로컬 상태가 아니라 저장된 답안에서 판정한다. showFeedback은 새로고침에
  // 사라지는데, 퀵은 진행·연속 정답을 답안에서 파생하므로(quickStats) 화면만 되돌아가면
  // "센 것은 그대로인데 다시 고를 수 있는" 상태가 된다 — 그 순간 수치가 흔들린다.
  const quickCommitted = isQuick && isQuickCommitted(question, selected);
  const reveal = showFeedback || isGraded || quickCommitted;
  // 채점 후 잠금(시험) · 답을 확정한 뒤 잠금(퀵).
  // 연습·오답은 집계 대상이 아니라 종전대로 몇 번이든 다시 고를 수 있다.
  const locked = isGraded || quickCommitted;

  const handleSelect = useCallback((key: string) => {
    // 현재 선택·채점 상태는 이벤트 시점에 스토어에서 직접 읽는다 — selected를 의존성에
    // 넣으면 답을 고를 때마다 핸들러 참조가 바뀌어 모든 OptionItem이 리렌더되고
    // React.memo가 실효를 잃는다(파일 상단 주석의 O1 의도 유지).
    const state = useQuizStore.getState();
    if (state.graded[gradeKeyFor(state.setId, state.mode)]) return;
    const current = state.answers[answerKey] || [];
    let newSelected = [...current];
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
    state.setAnswer(answerKey, newSelected);
  }, [isMulti, immediate, question.answer.length, answerKey]);

  // 퀵의 서답형은 타이핑 중에 저장하지 않는다. 퀵에서는 "저장됨 = 확정됨"이라(위 quickCommitted)
  // 한 글자만 쳐도 정답·해설이 펼쳐지고 입력칸이 잠겨 버린다. '정답 확인'을 누를 때 한 번에 넘긴다.
  // 다른 모드는 종전대로 즉시 저장한다 — 새로고침에도 입력이 남아야 한다.
  const [draft, setDraft] = useState<string[]>([]);
  const shortValue = (i: number) => (isQuick && !quickCommitted ? (draft[i] || '') : (selected[i] || ''));

  const handleShortInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (isQuick) { setDraft(value ? [value] : []); return; }
    setAnswer(answerKey, value ? [value] : []);
  };

  // 다답형: 파트 i의 입력만 바꾸고 나머지 칸 값은 보존한다(밀집 배열로 저장 — 구멍/undefined 방지).
  // 모든 칸이 비면 빈 배열로 저장해 '답함' 집계에서 빠지게 한다.
  const handlePartInput = (i: number, value: string) => {
    const len = parts?.length ?? 0;
    const base = isQuick ? draft : selected;
    const next = Array.from({ length: len }, (_, k) => (k === i ? value : (base[k] || '')));
    const cleaned = next.every((v) => v === '') ? [] : next;
    if (isQuick) { setDraft(cleaned); return; }
    setAnswer(answerKey, cleaned);
  };

  // '정답 확인' — 퀵에서는 이 순간이 곧 답 확정이므로 초안을 저장소에 넘긴 뒤 공개한다.
  const handleCheck = () => {
    if (isQuick) setAnswer(answerKey, draft);
    setShowFeedback(true);
  };

  const correct = isQuestionCorrect(question.answer, selected, question.type, parts);
  const answerDisplay = isMultiPart
    ? parts!.map((p) => `${p.label} ${p.answer[0] ?? ''}`).join(' · ')
    : formatAnswerList(question.answer);

  // figure 필드와 stem 내 이미지가 같은 파일을 가리키면 중복 렌더 방지(#2).
  const stemHasFigure =
    !!question.figure && JSON.stringify(question.stem ?? '').includes(question.figure);

  return (
    <>
      {/* tabIndex=-1: 스킵 링크(#questionStem)의 포커스 이동 대상 — 구형 브라우저/VO 견고성. */}
      <div id="questionStem" className="question-stem" tabIndex={-1}>
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

        {isMultiPart && (
          // 다답형: 파트(라벨)별 입력 칸. 지문이 이미 항목을 명시하므로 라벨 노출은 스포일러가 아니다.
          <div className="short-answer short-answer-multi" data-testid="short-answer-multi">
            {parts!.map((p, i) => (
              <label key={p.label} className="short-answer-part">
                <span className="sap-label">{p.label}</span>
                <input
                  type="text"
                  className="short-answer-input"
                  value={shortValue(i)}
                  disabled={locked}
                  placeholder="정답 입력"
                  aria-label={`${p.label} 정답 입력`}
                  onChange={(e) => handlePartInput(i, e.target.value)}
                />
              </label>
            ))}
            {immediate && !reveal && (
              <button
                type="button"
                className="short-answer-check"
                onClick={handleCheck}
              >
                정답 확인
              </button>
            )}
          </div>
        )}

        {isShort && !isMultiPart && (
          <div className="short-answer">
            <input
              type="text"
              className="short-answer-input"
              value={shortValue(0)}
              disabled={locked}
              placeholder="정답을 입력하세요"
              aria-label="단답형 정답 입력"
              onChange={handleShortInput}
            />
            {immediate && !reveal && (
              <button
                type="button"
                className="short-answer-check"
                onClick={handleCheck}
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
