import type { QuizQuestion, SavedAnswer } from "./quiz.types";

export function clampQuestionIndex(index: number, questions: QuizQuestion[]): number {
  if (questions.length === 0) return 0;
  return Math.min(Math.max(index, 0), questions.length - 1);
}

export function isCorrectAnswer(question: QuizQuestion, selected: string[]): boolean {
  const expected = [...question.answer].sort().join("|");
  return [...selected].sort().join("|") === expected;
}

export function toSavedAnswer(question: QuizQuestion, mode: SavedAnswer["mode"], selected: string[]): SavedAnswer {
  return {
    questionId: question.id,
    mode,
    selected,
    isCorrect: isCorrectAnswer(question, selected),
    updatedAt: Date.now(),
  };
}
