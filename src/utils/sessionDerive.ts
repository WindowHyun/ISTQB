import type { Question } from '../hooks/useQuestions';
import { isQuestionCorrect } from './answer';
import { isQuickCommitted, isAnsweredInMode } from './quickStats';
import { isGradedMode } from './modeLabel';

/**
 * 세션 파생 상태 — 순수 계층.
 *
 * 종전에는 이 계산이 전부 `useQuizSession` 안에 있었다. 훅 안에 있으니 유닛이 닿지 못했고
 * (커버리지 **0% · 284줄**), 검증은 E2E가 화면 너머로 스쳐 지나가는 것뿐이었다.
 * 그런데 여기서 나오는 값들은 화면의 잠금·버튼 가용성·회차에 담기는 범위를 결정한다 —
 * 틀리면 "채점 버튼이 보이는데 안 눌린다", "안 푼 문항이 오답으로 기록된다" 같은 모양이 된다.
 *
 * `roundHistory`가 같은 이유로 먼저 꺼내진 자리이고(그 파일 주석 참고), 이 모듈은 그 나머지다.
 * 훅은 이제 이 함수들을 조립하고 React 배선(구독·메모)만 맡는다.
 *
 * 판정 자체는 여기서 새로 만들지 않는다 — `isAnsweredInMode`·`isQuickCommitted`·
 * `isQuestionCorrect`·`isGradedMode`가 각각 단일 원천이고, 이 파일은 **그것들을 어떤 범위에
 * 적용하는가**만 정한다. 저장소가 반복해서 겪은 결함이 "술어는 같은데 범위가 갈린" 것이었다.
 */

/** 문항 하나와 그 목록에서의 위치 — 오답 목록이 네비게이션에 쓰므로 index를 함께 든다. */
export interface WrongEntry {
  q: Question;
  i: number;
}

export interface SessionTally {
  /** '답함'으로 센 문항 수 — 기준은 모드가 정한다(퀵은 복수정답을 다 골라야 답함). */
  answered: number;
  correctCount: number;
  wrongQuestions: WrongEntry[];
}

/**
 * 회차로 기록할 문항을 고른다.
 *
 * 퀵만 다르다 — **채점을 마친 문항까지만** 담는다. 다른 모드는 회차가 곧 세트(또는 추첨분)
 * 전체라 미응답을 오답으로 세는 것이 맞지만, 퀵은 끝을 정해 놓지 않고 전 세트를 뽑아 두는
 * 모드다. 그대로 채점하면 한 문항만 풀고 눌러도 뽑아 둔 수백 문항이 통째로 회차에 들어가고
 * 나머지가 전부 오답으로 기록된다 — 챕터 분모가 첫 채점에 제품 전체로 뛰고, 24시간 퀵 오답
 * 목록에는 본 적도 없는 문항이 쌓인다.
 */
export function selectGradableQuestions(
  mode: string,
  questions: Question[],
  quickGraded: Record<string, true>,
  answerKeyOf: (q: Question) => string,
): Question[] {
  if (mode !== 'quick') return questions;
  return questions.filter((q) => quickGraded[answerKeyOf(q)]);
}

/**
 * 한 번의 순회로 답함·정답·오답을 함께 센다.
 *
 * 셋을 따로 돌면 판정 규칙이 갈릴 수 있고(실제로 팔레트만 `isAnswered`를 쓰던 결함이 있었다),
 * 이 훅을 5개 컴포넌트가 호출하므로 순회 비용도 그만큼 곱해진다.
 */
export function tallySession(
  mode: string,
  questions: Question[],
  answers: Record<string, string[]>,
  answerKeyOf: (q: Question) => string,
): SessionTally {
  let answered = 0;
  let correctCount = 0;
  const wrongQuestions: WrongEntry[] = [];
  questions.forEach((q, i) => {
    const selected = answers[answerKeyOf(q)] || [];
    if (isAnsweredInMode(mode, q, selected)) answered += 1;
    if (isQuestionCorrect(q.answer, selected, q.type, q.answerParts)) correctCount += 1;
    else wrongQuestions.push({ q, i });
  });
  return { answered, correctCount, wrongQuestions };
}

/** 정답인 문항만 고른다 — 결과 요약의 분자와 오답 모드의 '복습 완료' 대상이 같은 규칙을 쓴다. */
export function selectCorrectQuestions(
  questions: Question[],
  answers: Record<string, string[]>,
  answerKeyOf: (q: Question) => string,
): Question[] {
  return questions.filter((q) =>
    isQuestionCorrect(q.answer, answers[answerKeyOf(q)] || [], q.type, q.answerParts));
}

export interface ExamStage {
  /** 완전히 새로 시작하는 시험에서만 응시 게이트를 보여준다. */
  showExamGate: boolean;
  /** 응시 중(시작 후 미채점)에는 세트·모드 전이를 잠근다. */
  examLocked: boolean;
  /** 응시를 개시했는가 — 시험이 아니면 항상 참이다. */
  examUnderway: boolean;
}

/**
 * 시험 단계 파생 상태의 단일 원천 — 게이트(QuestionWorkspace)·잠금(Sidebar)·
 * 통계의 연습 진입(AppModals)이 모두 이 값을 쓴다.
 *
 * `examUnderway`가 필요한 이유: 게이트는 워크스페이스만 가리므로, 이 조건이 없으면
 * 사이드바의 '채점하기'로 **응시한 적 없는 시험이 0/N 유령 회차로 기록된다.**
 * `answered > 0`을 개시로 보는 것은 이어풀기 복원을 응시 중으로 취급하기 위함이다.
 */
export function deriveExamStage(input: {
  mode: string;
  examStarted: boolean | undefined;
  isGraded: boolean;
  answered: number;
}): ExamStage {
  const { mode, examStarted, isGraded, answered } = input;
  return {
    showExamGate: mode === 'exam' && !examStarted && !isGraded && answered === 0,
    examLocked: mode === 'exam' && !!examStarted && !isGraded,
    examUnderway: mode !== 'exam' || !!examStarted || answered > 0,
  };
}

/**
 * 커서를 목록 범위 안으로 가둔다.
 *
 * 목록은 비동기로 바뀌는데 index는 즉시 바뀐다 — 세트를 줄이거나 오답 모드로 옮기면
 * 잠깐 `index >= total`인 구간이 생기고, 가두지 않으면 `undefined` 문항을 그리려다 깨진다.
 * 목록이 비었을 때 -1이 되지 않도록 상한도 0에서 멈춘다.
 */
export function clampIndex(index: number, total: number): number {
  return Math.min(Math.max(index, 0), Math.max(0, total - 1));
}

export interface QuickControls {
  /** 이 문항을 채점했는가 — 정답·해설 공개와 집계의 기준. */
  currentQuickGraded: boolean;
  /** 채점 버튼을 열어도 되는가 — 답을 다 골랐고 아직 채점하지 않았다. */
  canGradeQuestion: boolean;
  hasNextQuestion: boolean;
}

/** 퀵의 문항 단위 흐름 — 채점 버튼과 '다음 문제' 버튼의 가용 여부. */
export function deriveQuickControls(input: {
  mode: string;
  currentQuestion: Question | undefined;
  currentKey: string;
  quickGraded: Record<string, true>;
  answers: Record<string, string[]>;
  index: number;
  total: number;
}): QuickControls {
  const { mode, currentQuestion, currentKey, quickGraded, answers, index, total } = input;
  const currentQuickGraded = mode === 'quick' && !!quickGraded[currentKey];
  return {
    currentQuickGraded,
    canGradeQuestion: mode === 'quick' && !!currentQuestion && !currentQuickGraded
      && isQuickCommitted(currentQuestion, answers[currentKey] || []),
    hasNextQuestion: index < total - 1,
  };
}

/**
 * 채점 버튼을 열어도 되는가.
 *
 * 퀵에는 '세션 채점'이 없다 — 그 자리는 문항 단위 채점이 쓴다.
 * 나머지 모드는 채점이 있는 모드이면서, 아직 채점 전이고, 문항이 실제로 실려 있고,
 * 응시를 개시했어야 한다. 네 조건 중 하나만 빠져도 유령 회차가 남는다.
 */
export function deriveCanGrade(input: {
  mode: string;
  canGradeQuestion: boolean;
  isGraded: boolean;
  total: number;
  examUnderway: boolean;
}): boolean {
  const { mode, canGradeQuestion, isGraded, total, examUnderway } = input;
  if (mode === 'quick') return canGradeQuestion;
  return isGradedMode(mode) && !isGraded && total > 0 && examUnderway;
}

/** 진행률(%) — 문항이 없으면 0이다(0으로 나누지 않는다). */
export function progressPercentOf(answered: number, total: number): number {
  return total ? Math.round((answered / total) * 100) : 0;
}
