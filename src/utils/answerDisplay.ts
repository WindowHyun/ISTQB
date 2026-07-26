// 정답·"내 답" 표시 포맷의 단일 원천.
//
// 선택형 보기 키(a~e)와 진위형(o/x)은 대문자로 보여주는 게 관례지만, 서답형은 입력한
// 문자열 자체가 정답이라 대문자로 강제하면 표기가 왜곡된다:
//   "회귀(Regression) 테스트"  → "회귀(REGRESSION) 테스트"
//   "동등 분할, Equivalence partitioning" → "… EQUIVALENCE PARTITIONING"
// (서답형 63건 중 27건이 이 영향을 받았다. 채점은 정상이고 표시만 틀렸다.)
//
// 유형(question.type)이 아니라 값의 모양으로 판정하는 이유: 오답노트 목록은 회차
// 기록(ExamHistory.wrongItems)만 갖고 있어 문항 유형을 알 수 없다. 데이터상 보기 키는
// a~e, 진위형은 o/x이고 한 글자짜리 서답형 정답은 없으므로 "한 글자 ASCII 알파벳"이
// 보기 키와 서답형을 정확히 가른다.

/** 한 글자 보기 키(a~e·o/x)만 대문자로. 그 외(서답형 등)는 원문 표기를 유지한다. */
export function formatAnswerToken(value: string): string {
  const v = String(value ?? '').trim();
  return /^[a-z]$/i.test(v) ? v.toUpperCase() : v;
}

/**
 * 표시용 정답 문자열. 빈 값(미입력 칸)은 걸러내고, 남는 게 없으면 emptyLabel을 돌려준다.
 * 다답형은 칸별 값이 배열로 들어오므로 쉼표로 잇는다.
 */
export function formatAnswerList(
  values: readonly string[] | null | undefined,
  emptyLabel = '',
): string {
  const parts = (values ?? []).map(formatAnswerToken).filter((v) => v !== '');
  return parts.length ? parts.join(', ') : emptyLabel;
}
