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
