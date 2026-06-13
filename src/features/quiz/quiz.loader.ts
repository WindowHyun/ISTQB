import type { QuestionIndex, QuestionSet, QuestionSetSummary } from "./quiz.types";

const normalizePath = (path: string) => path.replace(/^\.\//, "/data/");

export async function loadQuestionIndex(): Promise<QuestionIndex> {
  const response = await fetch("/data/index.json");
  if (!response.ok) throw new Error(`문제 세트 목록을 불러오지 못했습니다. (${response.status})`);
  return response.json();
}

export async function loadQuestionSet(set: QuestionSetSummary): Promise<QuestionSet> {
  const response = await fetch(normalizePath(set.path));
  if (!response.ok) throw new Error(`${set.title} 문제를 불러오지 못했습니다. (${response.status})`);
  return response.json();
}
