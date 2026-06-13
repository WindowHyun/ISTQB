import type { QuizQuestion } from "../../features/quiz/quiz.types";
import { QuestionStem } from "./QuestionStem";
import { OptionList } from "./OptionList";

export function QuestionCard({ question, selected, onSelect }: { question: QuizQuestion; selected: string[]; onSelect: (key: string) => void }) {
  return <article className="question-card" data-testid="question-card"><div className="question-meta">문제 {question.number}</div><QuestionStem blocks={question.stem} /><OptionList options={question.options ?? []} selected={selected} onSelect={onSelect} /></article>;
}
