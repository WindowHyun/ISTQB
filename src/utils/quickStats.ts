import { isAnswered, isQuestionCorrect, AnswerPart } from './answer';

/**
 * 퀵 모드의 진행 집계.
 *
 * 별도 카운터를 스토어에 두지 않고 "출제 순서 + 답안 + 커서"에서 매번 계산한다.
 * 카운터를 따로 들면 올리는 시점(답을 고른 순간? 정답을 확인한 순간? '다음'을 누른
 * 순간?)마다 한 번씩만 올린다는 보장이 필요해지고, 새로고침·중복 렌더에서 그 보장이
 * 깨지면 수치가 조용히 어긋난다. 파생값이면 그런 상태가 아예 없다.
 *
 * 퀵은 커서가 앞으로만 가고 지나간 문항은 잠기므로(QuestionCard), 같은 문항이 두 번
 * 세어지거나 뒤늦게 답이 바뀌는 일이 없다 — 파생이 성립하는 근거다.
 */

/** 집계에 필요한 최소 형태. Question 전체를 받지 않아 utils → hooks 역참조를 만들지 않는다. */
export interface QuickScorable {
  id?: string;
  number: number;
  type?: string;
  answer: string[];
  answerParts?: AnswerPart[];
  /** 복수정답 판정에만 쓴다 — 보기가 있고 정답이 둘 이상이면 다 고를 때까지 미확정이다. */
  options?: { key: string; text: string }[];
}

/**
 * 퀵에서 이 문항의 답이 확정됐는가.
 *
 * 확정은 세 가지를 동시에 뜻한다 — 보기가 잠기고, 집계(solved/정답/연속)에 들어가고,
 * '다음 문제'가 열린다. 세 곳이 각자 판정하면 "잠겼는데 다음이 안 열린다"처럼 서로
 * 어긋나는 상태가 생기므로 여기 하나로 모은다.
 *
 * 복수정답만 예외적으로 '전부 고름'을 요구한다. isAnswered는 하나만 골라도 참이라
 * 그대로 쓰면 3개짜리 문항이 첫 클릭에 오답으로 확정돼 버린다.
 */
export function isQuickCommitted(q: QuickScorable, selected: string[]): boolean {
  const isMulti = !!q.options?.length && q.answer.length > 1;
  if (isMulti) return selected.length === q.answer.length;
  return isAnswered(selected, q.answerParts);
}

export interface QuickStats {
  /** 지금까지 답을 확정한 문항 수. */
  solved: number;
  correct: number;
  wrong: number;
  /** 현재 연속 정답 — 틀리는 순간 0으로 끊긴다. */
  streak: number;
  /** 이번 세션의 최고 연속 정답. */
  best: number;
  /** 아직 나오지 않은 문항 수(출제 순서에 남은 것). */
  remaining: number;
}

export const EMPTY_QUICK_STATS: QuickStats = {
  solved: 0, correct: 0, wrong: 0, streak: 0, best: 0, remaining: 0,
};

/**
 * @param questions 이번 세션의 출제 순서(제품 전 세트를 섞은 목록)
 * @param cursor    현재 문항의 인덱스. 여기까지(포함)만 센다 — 아직 안 나온 문항은 집계 밖이다.
 */
export function computeQuickStats(
  questions: QuickScorable[],
  answers: Record<string, string[]>,
  keyOf: (q: QuickScorable) => string,
  cursor: number,
): QuickStats {
  let solved = 0;
  let correct = 0;
  let wrong = 0;
  let streak = 0;
  let best = 0;
  const last = Math.min(cursor, questions.length - 1);
  for (let i = 0; i <= last; i += 1) {
    const q = questions[i];
    if (!q) break;
    const selected = answers[keyOf(q)] || [];
    // 현재 문항을 아직 안 풀었으면 세지 않는다 — 화면에 뜬 것만으로 '진행'이 오르면
    // 답을 고르기도 전에 카운터가 먼저 움직인다.
    if (!isQuickCommitted(q, selected)) continue;
    solved += 1;
    if (isQuestionCorrect(q.answer, selected, q.type, q.answerParts)) {
      correct += 1;
      streak += 1;
      if (streak > best) best = streak;
    } else {
      wrong += 1;
      streak = 0;
    }
  }
  return { solved, correct, wrong, streak, best, remaining: Math.max(0, questions.length - solved) };
}
