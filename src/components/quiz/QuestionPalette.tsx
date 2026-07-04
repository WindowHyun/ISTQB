import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { isQuestionCorrect } from '../../utils/answer';

interface QuestionPaletteProps {
  /** 인라인(데스크톱 본문) 팔레트엔 id="questionNav"를 부여(E2E·레거시 선택자 유지). */
  withId?: boolean;
  /** 문항 선택 후 콜백(모달에선 닫기 등). */
  onJump?: () => void;
}

// 문제 번호 팔레트(답함/정답/오답/현재 색상). 본문 인라인과 "문항 이동" 모달이 공유한다.
export const QuestionPalette = ({ withId, onJump }: QuestionPaletteProps) => {
  // 슬라이스 구독(O1) — 40버튼 팔레트가 타이머 틱마다 리렌더되지 않게 한다.
  const { index, answers, setIndex } = useQuizStore(useShallow((s) => ({
    index: s.index, answers: s.answers, setIndex: s.setIndex,
  })));
  const { currentQuestions, answerKeyOf, isGraded } = useQuizSession();

  const total = currentQuestions.length;
  const safeIndex = Math.min(Math.max(index, 0), Math.max(0, total - 1));

  return (
    <nav
      id={withId ? 'questionNav' : undefined}
      className="question-nav"
      aria-label="문제 번호"
    >
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
            onClick={() => { setIndex(i); onJump?.(); }}
          >
            {i + 1}
          </button>
        );
      })}
    </nav>
  );
};
