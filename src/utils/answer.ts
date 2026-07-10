// 정답 판정 — 대소문자 무시, 순서 무관, 개수 일치.
// QuestionCard / QuestionWorkspace가 공유(중복 제거 + 유닛 테스트 대상, #76).
export function isAnswerCorrect(answer: string[], selected: string[]): boolean {
  // 손상 데이터 방어 — answer 필드가 누락/비배열/빈 배열인 문항은 판정 불가이므로 오답 처리.
  // (빈 정답키 + 빈 선택이 "정답"으로 집계되는 것도 함께 차단)
  if (!Array.isArray(answer) || answer.length === 0) return false;
  if (selected.length !== answer.length) return false;
  // 중복 키(예: ['a','a'])는 개수만 맞아도 오답 — UI는 못 만들지만 가져오기 데이터로 유입될 수 있다.
  const chosen = selected.map((s) => s.toLowerCase());
  if (new Set(chosen).size !== chosen.length) return false;
  const expected = answer.map((a) => a.toLowerCase());
  return chosen.every((s) => expected.includes(s));
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
    return Array.isArray(answer) && answer.some((a) => a.trim() !== '' && normalizeText(a) === got);
  }
  return isAnswerCorrect(answer, selected);
}

