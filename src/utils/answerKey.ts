/**
 * 답안·채점 키의 단일 원천.
 *
 * 종전에는 같은 규칙을 여러 곳이 각자 조립했다 — 답안 키는 QuestionCard와 useQuizSession
 * 두 곳, 채점 키는 다섯 곳이다. 한쪽만 고치면 "답을 눌러도 진행률이 오르지 않는다"처럼
 * 원인이 보이지 않는 어긋남이 생긴다(입력은 저장되는데 읽는 쪽이 다른 키를 본다).
 * 새 모드를 추가할 때 규칙이 갈라지지 않도록 여기로 모은다.
 *
 * 키 규약(영속 데이터의 계약이므로 바꾸면 기존 답안이 유실된다):
 *   답안 키 = `${setId}-${mode}-${qid}`,  qid = question.id ?? question.number
 *   채점 키 = `${setId}-${mode}`
 *
 * qid 폴백이 chapterStats의 `legacy-${number}`와 다른 점에 주의 — 이쪽은 영속화된
 * 답안 키라 형식을 바꿀 수 없다. 두 키 공간은 용도가 달라 일부러 분리해 둔다.
 */

/** 키 조립에 필요한 최소 형태. Question 전체를 받지 않아 utils → hooks 역참조를 만들지 않는다. */
export interface QuestionIdentity {
  id?: string;
  number: number;
}

/** 답안 키의 문항 부분. 세트 내 순번(number)은 세트가 다르면 겹치므로 id가 있으면 id를 쓴다. */
export function questionIdOf(q: QuestionIdentity): string {
  return String(q.id || q.number);
}

/** 채점 키 — 세트·모드 단위. graded / reviewIds가 이 키를 쓴다. */
export function gradeKeyFor(setId: string, mode: string): string {
  return `${setId}-${mode}`;
}

/**
 * 답안 키 접두 — 세트·모드 단위 일괄 조회/삭제용.
 *
 * 끝의 '-'까지 포함하는 것이 중요하다. 빼면 `A`가 `AB`의 답안까지 지운다
 * (문항 id가 세트 id로 시작하는 현 데이터에서 접두 관계는 실재한다).
 */
export function answerKeyPrefix(setId: string, mode: string): string {
  return `${gradeKeyFor(setId, mode)}-`;
}

/** 답안 키 — 문항 단위. 모드마다 네임스페이스가 갈려 오답 재풀이가 원본 답안을 덮지 않는다. */
export function answerKeyFor(setId: string, mode: string, q: QuestionIdentity): string {
  return `${answerKeyPrefix(setId, mode)}${questionIdOf(q)}`;
}


/**
 * 오답 대상(reviewIds) 키 — 채점 키에 **챕터**를 덧붙인다.
 *
 * 챕터 미니 시험은 내부 모드가 `random`이라 세트 전체 랜덤과 채점 키가 같았다. 그런데
 * 채점은 `setReviewIds(key, wrongIds)`로 **덮어쓴다.** 그래서 40문항 랜덤을 채점해 오답
 * 12개가 잡힌 뒤 10문항짜리 미니 시험을 한 번 채점하면, 오답 모드가 출제할 목록이 미니의
 * 오답 두어 개로 교체됐다 — 오답 노트(이력 합집합)에는 12개가 그대로 보이므로
 * "노트에는 있는데 오답 풀이에는 안 나온다"가 된다.
 *
 * 저장소는 다른 곳에서는 이 둘을 일관되게 갈라 놓는다(`isSetLevelRound`·
 * `latestAttemptComparison`·`findGradedRoundMatch`·`buildMiniTestRounds`가 모두 `chapter`로
 * 나눈다). `reviewIds`만 예외였다. 같은 분리 기준을 이 키에도 세운다.
 *
 * `graded` 키는 종전 그대로 챕터를 붙이지 않는다 — 미니 진입이 `clearAnswers(setId,'random')`로
 * 그 세트의 랜덤 채점 상태를 어차피 함께 되돌리므로, 나누면 오히려 두 규칙이 갈린다.
 *
 * 구분자로 '#'을 쓰는 이유: 세트 id·모드·챕터명 어디에도 나타나지 않아 base를 되찾을 수 있다
 * (`resetProgressForSets`가 접두가 아니라 base 일치로 지운다).
 */
export function reviewKeyFor(setId: string, mode: string, chapter?: string | null): string {
  const base = gradeKeyFor(setId, mode);
  return chapter ? `${base}#${chapter}` : base;
}

/** 이 키가 (세트, 모드)의 오답 대상 키인가 — 챕터 접미가 붙은 미니 회차 키까지 포함한다. */
export function isReviewKeyOf(key: string, setId: string, mode: string): boolean {
  const base = gradeKeyFor(setId, mode);
  return key === base || key.startsWith(`${base}#`);
}
