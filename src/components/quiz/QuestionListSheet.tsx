import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../../store/useQuizStore';
import { Modal } from '../common/Modal';
import type { AppData, Question } from '../../hooks/useQuestions';
import { useQuestionStatuses } from '../../hooks/useQuestionStatuses';
import { startRetryWrong, useReviewTargetCount } from '../../hooks/useRetryWrong';
import {
  canOfferRetryWrong,
  cellAriaLabel,
  indicesForFilter,
  listSummaryText,
  type ListFilter,
  type QuestionStatus,
  type StatusSummary,
} from '../../utils/questionStatus';
import { clampIndex } from '../../utils/sessionDerive';

interface QuestionListSheetProps {
  /** 칸에 찍는 문항 번호(원본 번호 — 오답·랜덤에서는 순번과 다르다). statuses와 같은 순서·길이. */
  labels: (number | string)[];
  keys: string[];
  statuses: QuestionStatus[];
  summary: StatusSummary;
  currentIndex: number;
  /** 정오(정답/오답 표시·오답 거르기)를 보여도 되는 단계인가 — 시험·랜덤은 채점 뒤에만. */
  showCorrectness: boolean;
  /** '오답 N문제 다시 풀기'. null이면 내지 않는다. */
  retryCount: number | null;
  onJump: (index: number) => void;
  onRetry: () => void;
  onClose: () => void;
}

const CHIPS: { id: ListFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'unsolved', label: '안 푼 문제' },
  { id: 'wrong', label: '오답' },
];

/**
 * 문항 목록 — 모바일에서는 바텀 시트, 데스크톱에서는 '문항 이동' 모달로 같은 내용을 낸다.
 *
 * 번호 칸은 색만으로 상태를 말하지 않는다: 칸마다 읽는 말(aria-label)이 있고 정답/오답에는 기호
 * (✓/✕)가 붙는다. 칸의 글자는 번호뿐이다 — 기호는 CSS가 그린다(E2E가 번호 텍스트로 칸을 집는다).
 *
 * 시험·랜덤은 채점 전에는 정오를 말하지 않는다(showCorrectness=false): '오답' 필터·범례·기호가
 * 모두 빠지고 푼/안 푼만 남는다. 응시 중에 이 시트가 정답을 새게 하는 길이 되면 안 된다.
 */
export const QuestionListSheet = ({
  labels, keys, statuses, summary, currentIndex, showCorrectness, retryCount, onJump, onRetry, onClose,
}: QuestionListSheetProps) => {
  const [filter, setFilter] = useState<ListFilter>('all');
  const currentRef = useRef<HTMLButtonElement | null>(null);

  // 오답 칩이 사라지는 상태(채점 전)로 돌아갔는데 필터가 'wrong'으로 남으면 빈 목록이 된다.
  const activeFilter: ListFilter = filter === 'wrong' && !showCorrectness ? 'all' : filter;
  const indices = indicesForFilter(statuses, activeFilter);
  const counts: Record<ListFilter, number> = {
    all: summary.total, unsolved: summary.unsolved, wrong: summary.wrong,
  };

  // 70문항이면 격자가 화면보다 길다 — 지금 문제가 첫 화면에 보이게 한다.
  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: 'center' });
  }, []);

  const chips = CHIPS.filter((c) => c.id !== 'wrong' || showCorrectness);

  return (
    <Modal
      title="문항 목록"
      variant="sheet"
      subtitle={listSummaryText(summary, showCorrectness)}
      onClose={onClose}
      footer={retryCount != null && retryCount > 0 ? (
        <button type="button" className="primary qretry" data-testid="retry-wrong-cta" onClick={onRetry}>
          오답 {retryCount}문제 다시 풀기
        </button>
      ) : undefined}
    >
      <div className="modal-body qlist" data-testid="palette-jump">
        <div className="qfilters" role="group" aria-label="문항 거르기">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              className="qchip"
              aria-pressed={activeFilter === c.id}
              data-testid={`qfilter-${c.id}`}
              onClick={() => setFilter(c.id)}
            >
              {c.label} {counts[c.id]}
            </button>
          ))}
        </div>
        {indices.length === 0 ? (
          <p className="qempty">해당하는 문항이 없습니다.</p>
        ) : (
          <nav className="qgrid" aria-label="문제 번호">
            {indices.map((i) => {
              const isCurrent = i === currentIndex;
              return (
                <button
                  key={keys[i]}
                  ref={isCurrent ? currentRef : undefined}
                  type="button"
                  className="qcell"
                  data-state={statuses[i].state}
                  aria-current={isCurrent ? 'true' : undefined}
                  aria-label={cellAriaLabel(labels[i], statuses[i].state, isCurrent)}
                  onClick={() => onJump(i)}
                >
                  {labels[i]}
                </button>
              );
            })}
          </nav>
        )}
        <ul className="qlegend" aria-label="범례">
          {showCorrectness && <li><em data-state="correct" />정답</li>}
          {showCorrectness && <li><em data-state="wrong" />오답</li>}
          {(!showCorrectness || summary.pending > 0) && <li><em data-state="answered" />푼 문제</li>}
          <li><em data-current="true" />지금 문제</li>
          <li><em data-state="unanswered" />안 푼 문제</li>
        </ul>
      </div>
    </Modal>
  );
};

/**
 * 시트에 세션 값을 이어 주는 연결부. 시트가 열려 있을 때만 마운트되므로(AppModals) 상태 파생·
 * 오답 문항 수 로딩이 닫혀 있는 동안에는 돌지 않는다.
 *
 * 세션 값은 AppModals가 이미 들고 있는 것을 받는다 — 여기서 useQuizSession을 다시 부르면 문항
 * 로더 인스턴스가 하나 더 생긴다.
 */
export const QuestionListHost = ({
  appData, currentQuestions, answerKeyOf, isGraded, examLocked, onClose,
}: {
  appData: AppData | null;
  currentQuestions: Question[];
  answerKeyOf: (q: Question) => string;
  isGraded: boolean;
  examLocked: boolean;
  onClose: () => void;
}) => {
  const { mode, index, setIndex } = useQuizStore(useShallow((s) => ({
    mode: s.mode, index: s.index, setIndex: s.setIndex,
  })));
  const { statuses, summary, showCorrectness } = useQuestionStatuses({ mode, currentQuestions, answerKeyOf, isGraded });
  const reviewCount = useReviewTargetCount(appData, true);

  // 오답 모드로 넘어가면 버려질 세션이 있는가 — 시험 응시 중이거나 채점 전 랜덤.
  const sessionInProgress = (mode === 'exam' || mode === 'random') && !isGraded;
  const offer = canOfferRetryWrong({ mode, sessionInProgress, count: reviewCount ?? 0 });

  return (
    <QuestionListSheet
      labels={currentQuestions.map((q, i) => q.number ?? i + 1)}
      keys={currentQuestions.map((q, i) => q.id || String(i))}
      statuses={statuses}
      summary={summary}
      currentIndex={clampIndex(index, currentQuestions.length)}
      showCorrectness={showCorrectness}
      retryCount={offer ? reviewCount : null}
      onJump={(i) => { setIndex(i); onClose(); }}
      onRetry={() => { if (startRetryWrong(examLocked)) onClose(); }}
      onClose={onClose}
    />
  );
};
