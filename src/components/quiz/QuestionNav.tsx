export function QuestionNav({ index, total, onPrev, onNext }: { index: number; total: number; onPrev: () => void; onNext: () => void }) {
  return <nav className="question-actions"><button data-testid="previous-question-button" disabled={index <= 0} onClick={onPrev}>이전</button><span>{index + 1} / {total}</span><button data-testid="next-question-button" disabled={index >= total - 1} onClick={onNext}>다음</button></nav>;
}
