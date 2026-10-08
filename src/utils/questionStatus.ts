import { isQuestionCorrect } from './answer';
import { isAnsweredInMode, type QuickScorable } from './quickStats';

/**
 * 문항 목록 시트·진행 스트립이 그리는 문항 상태 — 순수 계층.
 *
 * 모바일 하단 바의 진행 스트립과 '문항 목록' 시트는 같은 사실(어느 문항을 풀었고, 맞았고,
 * 틀렸는가)을 서로 다른 모양으로 보여 준다. 컴포넌트마다 판정을 따로 들면 "스트립은 초록인데
 * 시트는 파랑" 같은 어긋남이 생기고, 컴포넌트 안에 두면 유닛이 닿지 못한다
 * (sessionDerive·roundHistory를 꺼낸 것과 같은 이유다). 그래서 상태 파생을 여기 한 곳에 둔다.
 *
 * 판정 자체는 새로 만들지 않는다 — `isAnsweredInMode`(답함)와 `isQuestionCorrect`(정오)가
 * 각각 단일 원천이고, 이 모듈이 정하는 것은 **정오를 언제 보여도 되는가**뿐이다.
 */

/** 문항 하나의 표시 상태. 정오를 보여선 안 되는 단계에서는 correct·wrong이 나오지 않는다. */
export type QuestionState = 'correct' | 'wrong' | 'answered' | 'unanswered';

export interface QuestionStatus {
  state: QuestionState;
  /**
   * 사용자가 실제로 답을 했는가. 채점으로 오답 처리된 미응답은 state가 'wrong'이어도
   * 이 값은 false다 — '안 푼 문제' 필터와 '풀이 N' 집계가 이 값을 쓴다.
   */
  answered: boolean;
}

/** 진행 스트립 한 칸의 색 — 상태에 '지금 문제'가 더해진다. */
export type SegmentTone = QuestionState | 'current';

/** 문항 목록 시트의 필터 칩. */
export type ListFilter = 'all' | 'unsolved' | 'wrong';

export interface StatusSummary {
  total: number;
  /** 답한 문항 수('풀이'). */
  solved: number;
  unsolved: number;
  correct: number;
  wrong: number;
  /** 답은 했지만 정오를 아직 보여 주지 않는 문항(시험 응시 중·서답형 확인 전). */
  pending: number;
}

/** 보기를 고르는 즉시 정답을 보여 주는 모드 — 연습·오답. 시험·랜덤은 채점 뒤, 퀵은 문항을 채점한 뒤다. */
export function isImmediateFeedbackMode(mode: string): boolean {
  return mode === 'practice' || mode === 'review';
}

/**
 * 연습·오답에서 이 답안이 정답 피드백을 **여는 답안인가**.
 *
 * QuestionCard는 보기를 고르는 즉시 피드백을 열되, 복수정답은 정답 개수만큼 다 골랐을 때,
 * 서답형은 사용자가 '정답 확인'을 누를 때 연다. 그 열림 여부는 카드의 로컬 상태라 저장되지
 * 않으므로, 같은 조건을 저장된 답안에서 다시 읽는다. 서답형은 확인 시점을 알 수 없어
 * 늘 '아직'으로 본다 — 입력 도중의 글자를 오답(✕)으로 먼저 보여 주지 않기 위해서다.
 *
 * 이 판정을 읽는 곳은 둘이다: 목록·스트립(✓/✕를 칠할지)과 카드(열릴 때 피드백을 미리 펼칠지,
 * `feedbackOpenOnEntry`). 둘이 **같은 함수**를 써야 "목록은 ✕인데 열어 보니 정오가 없는" 어긋남이 없다.
 */
export function isFeedbackConfirmed(q: QuickScorable, selected: string[]): boolean {
  if (!selected.length) return false;
  if (q.options?.length) return selected.length >= q.answer.length;
  return q.type === 'true_false';
}

/**
 * 카드를 (다시) 열 때 정답 피드백을 미리 펼쳐 둘 것인가.
 *
 * 카드는 문항을 옮기면 새로 만들어져(세트·모드·문항이 key — 다음 문항으로 피드백이 새지 않게 한다) 열림
 * 상태가 닫힌 채 시작한다. 그러면 이미 푼 문항으로 돌아왔을 때, 목록은 저장된 답안에서 ✓/✕를 칠하는데
 * 카드에는 정오도 해설도 없다 — 오답만 모아 눌러 보는 필터의 쓸모가 사라진다. 그래서 카드도 같은 판정
 * (`isFeedbackConfirmed`)으로 시작 상태를 정한다. 아직 안 푼 문항은 닫힌 채 시작하므로 새는 것이 없다.
 * 채점이 공개를 정하는 모드(시험·랜덤·퀵)에는 해당 없다 — 거기서는 graded·quickGraded가 맡는다.
 */
export function feedbackOpenOnEntry(mode: string, q: QuickScorable, selected: string[]): boolean {
  return isImmediateFeedbackMode(mode) && isFeedbackConfirmed(q, selected);
}

/**
 * 이 문항의 정오를 목록에 보여도 되는가.
 *
 * - 연습·오답: 피드백이 열린 문항만(위 함수).
 * - 시험·랜덤(챕터 미니 시험): **채점한 뒤에만.** 응시 중에 정오가 새면 시험이 아니다.
 *   채점 전에는 '푼 / 안 푼'만 보인다.
 * - 퀵: 문항 단위로 채점하므로 호출부가 그 문항의 채점 여부를 `graded`로 넘긴다.
 */
export function isCorrectnessRevealed(
  mode: string,
  q: QuickScorable,
  selected: string[],
  graded: boolean,
): boolean {
  if (isImmediateFeedbackMode(mode)) return isFeedbackConfirmed(q, selected);
  return graded;
}

/**
 * 이 목록이 정오를 보여 주는 단계인가 — 범례·필터 칩·'오답 다시 풀기' 노출의 기준.
 * 연습·오답은 문항마다 열리므로 늘 참이고, 시험·랜덤은 채점 뒤에만 참이다.
 */
export function isCorrectnessVisible(mode: string, graded: boolean): boolean {
  return isImmediateFeedbackMode(mode) || graded;
}

/**
 * 문항별 표시 상태. `graded`는 세트 단위 채점 여부(시험·랜덤)다.
 *
 * 채점된 시험은 미응답도 오답으로 센다(채점 규칙과 같다) — 그래서 `state`는 'wrong'이고
 * `answered`는 false로 남는다.
 */
export function deriveQuestionStatuses<Q extends QuickScorable>(input: {
  mode: string;
  questions: Q[];
  answers: Record<string, string[]>;
  answerKeyOf: (q: Q) => string;
  graded: boolean;
}): QuestionStatus[] {
  const { mode, questions, answers, answerKeyOf, graded } = input;
  return questions.map((q) => {
    const selected = answers[answerKeyOf(q)] || [];
    const answered = isAnsweredInMode(mode, q, selected);
    if (!isCorrectnessRevealed(mode, q, selected, graded)) {
      return { state: answered ? 'answered' : 'unanswered', answered };
    }
    const correct = isQuestionCorrect(q.answer, selected, q.type, q.answerParts, q.acceptedAnswers);
    return { state: correct ? 'correct' : 'wrong', answered };
  });
}

export function summarizeStatuses(statuses: QuestionStatus[]): StatusSummary {
  const s: StatusSummary = { total: statuses.length, solved: 0, unsolved: 0, correct: 0, wrong: 0, pending: 0 };
  for (const { state, answered } of statuses) {
    if (answered) s.solved += 1;
    else s.unsolved += 1;
    if (state === 'correct') s.correct += 1;
    else if (state === 'wrong') s.wrong += 1;
    else if (state === 'answered') s.pending += 1;
  }
  return s;
}

/** 필터에 걸리는 문항의 위치(index). 'all'은 전부다. */
export function indicesForFilter(statuses: QuestionStatus[], filter: ListFilter): number[] {
  const out: number[] = [];
  statuses.forEach((st, i) => {
    if (filter === 'all' || (filter === 'unsolved' && !st.answered) || (filter === 'wrong' && st.state === 'wrong')) {
      out.push(i);
    }
  });
  return out;
}

/** 진행 스트립의 칸 색 — 지금 문제가 상태 색을 덮는다. */
export function stripTones(statuses: QuestionStatus[], currentIndex: number): SegmentTone[] {
  return statuses.map((st, i) => (i === currentIndex ? 'current' : st.state));
}

/**
 * 진행 스트립의 읽는 말. 색만으로는 상태가 전달되지 않으므로 수치를 함께 준다.
 * 정오를 보여 줄 수 없는 단계(시험 응시 중)에서는 정답·오답 대신 푼 문항 수만 말한다.
 */
export function stripLabel(input: {
  summary: StatusSummary;
  currentIndex: number;
  showCorrectness: boolean;
}): string {
  const { summary, currentIndex, showCorrectness } = input;
  if (!summary.total) return '진행 상황: 문항 없음';
  const head = `진행 상황: ${summary.total}문항 중 ${currentIndex + 1}번째`;
  if (!showCorrectness) return `${head}, 푼 문제 ${summary.solved}`;
  const tail = summary.pending ? `, 확인 전 ${summary.pending}` : '';
  return `${head}, 정답 ${summary.correct}, 오답 ${summary.wrong}${tail}`;
}

/** 문항 목록 시트 제목 아래 요약 — 예: `11 / 20 풀이 · 정답 7 · 오답 4`. */
export function listSummaryText(summary: StatusSummary, showCorrectness: boolean): string {
  const base = `${summary.solved} / ${summary.total} 풀이`;
  return showCorrectness ? `${base} · 정답 ${summary.correct} · 오답 ${summary.wrong}` : base;
}

const STATE_TEXT: Record<QuestionState, string> = {
  correct: '정답',
  wrong: '오답',
  answered: '푼 문제',
  unanswered: '안 푼 문제',
};

/** 문항 칸의 읽는 말 — 예: `문제 12, 지금 문제`, `문제 3, 오답`. */
export function cellAriaLabel(label: number | string, state: QuestionState, isCurrent: boolean): string {
  if (!isCurrent) return `문제 ${label}, ${STATE_TEXT[state]}`;
  // 지금 문제가 아직 안 푼 문제면 그 사실은 말하지 않는다 — '지금 문제'가 이미 위치를 말한다.
  return state === 'unanswered' ? `문제 ${label}, 지금 문제` : `문제 ${label}, 지금 문제, ${STATE_TEXT[state]}`;
}

/**
 * '오답 N문제 다시 풀기'를 내놓아도 되는가.
 *
 * - 오답이 있어야 한다.
 * - **채점형 세션이 진행 중이면 안 된다**(시험 응시 중·채점 전 랜덤). 오답 모드로 넘어가면
 *   풀던 세션이 버려지고 시험은 타이머·잠금도 깨진다. 목록 시트는 풀이 도중에 열리는 화면이라,
 *   '다시 풀기'를 가장 눈에 띄는 버튼으로 내놓는 순간 그 길이 실수로 눌리기 쉬워진다.
 * - 이미 오답 모드면 내놓지 않는다 — 같은 목록을 다시 여는 것이라 풀던 답안만 지워진다.
 * - 퀵은 오답이 세트 버킷에 담기지 않으므로 대상이 구조적으로 없다.
 */
export function canOfferRetryWrong(input: {
  mode: string;
  /** 시험 응시 중이거나 채점 전 랜덤 — 오답 모드로 넘어가면 버려질 세션이 있는가. */
  sessionInProgress: boolean;
  count: number;
}): boolean {
  const { mode, sessionInProgress, count } = input;
  if (count <= 0 || sessionInProgress) return false;
  return mode === 'practice' || mode === 'exam' || mode === 'random';
}
