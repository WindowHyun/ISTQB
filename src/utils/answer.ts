// 정답 판정 — 대소문자 무시, 순서 무관, 개수 일치.
// QuestionCard / QuestionWorkspace가 공유(중복 제거 + 유닛 테스트 대상, #76).
export function isAnswerCorrect(answer: string[], selected: string[]): boolean {
  if (selected.length !== answer.length) return false;
  const expected = answer.map((a) => a.toLowerCase());
  return selected.every((s) => expected.includes(s.toLowerCase()));
}

// 단답형 비교용 정규화: 공백 제거 + 소문자.
export function normalizeText(value: string): string {
  return (value || '').replace(/\s+/g, '').toLowerCase();
}

// 문제 유형별 정답 판정.
// - short_answer: 입력 텍스트를 정규화해 정답 중 하나와 일치하면 정답.
// - 그 외(multiple_choice / true_false): 키 배열 비교(isAnswerCorrect).
export function isQuestionCorrect(answer: string[], selected: string[], type?: string): boolean {
  if (type === 'short_answer') {
    const got = normalizeText(selected[0] || '');
    if (!got) return false;
    return answer.some((a) => a.trim() !== '' && normalizeText(a) === got);
  }
  return isAnswerCorrect(answer, selected);
}

