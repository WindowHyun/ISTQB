import type { QuestionOption } from "../../features/quiz/quiz.types";

export function OptionList({ options, selected, onSelect }: { options: QuestionOption[]; selected: string[]; onSelect: (key: string) => void }) {
  return <div className="options">{options.map((option) => <button key={option.key} type="button" data-testid={`question-option-${option.key}`} className={selected.includes(option.key) ? "option selected" : "option"} onClick={() => onSelect(option.key)}><strong>{option.key.toUpperCase()}.</strong> {option.text}</button>)}</div>;
}
