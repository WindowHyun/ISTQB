// 정답 판정 — 대소문자 무시, 순서 무관, 개수 일치.
// QuestionCard / QuestionWorkspace가 공유(중복 제거 + 유닛 테스트 대상, #76).
export function isAnswerCorrect(answer: string[], selected: string[]): boolean {
  if (selected.length !== answer.length) return false;
  const expected = answer.map((a) => a.toLowerCase());
  return selected.every((s) => expected.includes(s.toLowerCase()));
}
