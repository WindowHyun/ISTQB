import { isAnswered, isQuestionCorrect, AnswerPart } from './answer';

/**
 * 퀵 모드의 진행 집계.
 *
 * 별도 카운터를 스토어에 두지 않고 "출제 순서 + 답안"에서 매번 계산한다.
 * 카운터를 따로 들면 올리는 시점(답을 고른 순간? 정답을 확인한 순간? '다음'을 누른
 * 순간?)마다 한 번씩만 올린다는 보장이 필요해지고, 새로고침·중복 렌더에서 그 보장이
 * 깨지면 수치가 조용히 어긋난다. 파생값이면 그런 상태가 아예 없다.
 *
 * 확정된 답은 잠겨서 바뀌지 않으므로(QuestionCard) 같은 문항이 두 번 세어지거나 뒤늦게
 * 값이 달라지는 일이 없다 — 파생이 성립하는 근거다.
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
}

/**
 * 확정한 문항을 **전부** 센다 — 현재 보고 있는 위치와 무관하다.
 *
 * 종전에는 현재 문항 인덱스(커서)까지만 셌다. 근거는 "아직 나오지 않은 문항을 세지
 * 않는다"였는데, **확정은 본 문항에서만 참이 될 수 있으므로** 그 커서 제한이 실제로
 * 막는 것은 없었다. 남은 효과는 하나뿐이었다: ‹ 나 팔레트로 앞 문항에 돌아가면 점수판이
 * 뒤로 감겼다(실측 — 3문항을 풀고 두 번 되돌아가면 '진행'이 3에서 1로 줄었다가 다시
 * 앞으로 가면 3으로 돌아온다).
 *
 * 그 되감김은 표시만의 문제가 아니었다. 채점 대상(useQuizSession의 gradableQuestions)은
 * 커서와 무관하게 확정된 문항을 전부 담으므로, 되감긴 상태에서 채점하면 화면은 "진행 1"인데
 * 회차는 3문항으로 기록됐다 — "점수판이 진행 5라고 말했으면 회차도 5문항이어야 한다"는
 * 그쪽의 약속이 이 경로에서 깨져 있었다. 두 곳이 같은 술어(isQuickCommitted)를 쓰면서
 * **세는 범위만** 달랐던 셈이다.
 *
 * 퀵에는 진행률(분모)이 없어 이 점수판이 유일한 진행 표시라, 되감기는 숫자를 사용자가
 * 대조할 곳도 없다. 커서를 빼면 전진 중 동작은 종전과 완전히 같고(뒤에 있는 문항은 아직
 * 확정될 수 없다) 되감김과 기록 불일치가 함께 사라진다.
 *
 * @param questions 이번 세션의 출제 순서(제품 전 세트를 섞은 목록)
 */
export function computeQuickStats(
  questions: QuickScorable[],
  answers: Record<string, string[]>,
  keyOf: (q: QuickScorable) => string,
): QuickStats {
  let solved = 0;
  let correct = 0;
  let wrong = 0;
  let streak = 0;
  let best = 0;
  for (const q of questions) {
    const selected = answers[keyOf(q)] || [];
    // 아직 확정하지 않은 문항은 세지 않는다 — 화면에 뜬 것만으로 '진행'이 오르면
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
  // 연속은 출제 순서로 센다(답한 순서가 아니라) — 건너뛰었다가 나중에 돌아와 맞혀도
  // 화면의 문항 배열과 같은 순서로 읽히는 값이어야 한다.
  return { solved, correct, wrong, streak, best };
}
