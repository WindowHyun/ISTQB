import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../../store/useQuizStore';
import { useQuizSession } from '../../hooks/useQuizSession';
import { isQuestionCorrect, isAnswered } from '../../utils/answer';

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
        // 원본 문항 번호로 표시한다. 종전에는 순번(i+1)을 찍어, 출제 목록이 세트 순서와
        // 다른 모드(오답 등)에서 헤더가 "문제 39"인데 팔레트에는 39가 없는 상태가 됐다
        // (연습·시험에서만 우연히 일치했다).
        // 오답노트·해설이 모두 원본 번호를 쓰므로 그쪽에 맞춘다.
        const label = q.number ?? i + 1;
        const selected = answers[answerKeyOf(q)] || [];
        const classes: string[] = [];
        if (i === safeIndex) classes.push('current');
        if (isGraded) classes.push(isQuestionCorrect(q.answer, selected, q.type, q.answerParts) ? 'correct' : 'missed');
        else classes.push(isAnswered(selected, q.answerParts) ? 'answered' : 'unanswered');
        return (
          <button
            key={q.id || i}
            type="button"
            className={classes.join(' ')}
            aria-label={`문제 ${label}${i === safeIndex ? ', 현재 문제' : ''}`}
            aria-current={i === safeIndex ? 'true' : undefined}
            onClick={() => { setIndex(i); onJump?.(); }}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
};
