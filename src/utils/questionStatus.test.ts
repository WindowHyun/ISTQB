import { describe, it, expect } from 'vitest';
import {
  canOfferRetryWrong,
  cellAriaLabel,
  deriveQuestionStatuses,
  feedbackOpenOnEntry,
  indicesForFilter,
  isCorrectnessRevealed,
  isCorrectnessVisible,
  isFeedbackConfirmed,
  isImmediateFeedbackMode,
  listSummaryText,
  stripLabel,
  stripTones,
  summarizeStatuses,
} from './questionStatus';
import type { QuickScorable } from './quickStats';

/**
 * 문항 목록·진행 스트립의 상태 파생.
 *
 * 이 모듈이 정하는 것은 하나다 — **정오를 언제 보여도 되는가.** 시험 응시 중에 스트립이
 * 초록/빨강으로 물들면 채점 전에 정답이 새는 것이라, 아래 검사의 절반은 "새지 않는다"를
 * 고정한다.
 */

const opts = (...keys: string[]) => keys.map((key) => ({ key, text: key.toUpperCase() }));

const mc = (number: number, answer: string[], over: Partial<QuickScorable> = {}): QuickScorable => ({
  id: `Q${number}`, number, type: 'multiple_choice', answer, options: opts('a', 'b', 'c', 'd'), ...over,
});
const tf = (number: number, answer: string[]): QuickScorable => ({
  id: `Q${number}`, number, type: 'true_false', answer, options: [],
});
const short = (number: number, answer: string[]): QuickScorable => ({
  id: `Q${number}`, number, type: 'short_answer', answer, options: [],
});

const keyOf = (q: QuickScorable) => `K-${q.id}`;
const ans = (pairs: Record<string, string[]>): Record<string, string[]> =>
  Object.fromEntries(Object.entries(pairs).map(([id, v]) => [`K-${id}`, v]));

describe('isFeedbackConfirmed — 연습·오답에서 피드백이 열린 문항인가', () => {
  it('아무것도 고르지 않으면 열리지 않았다', () => {
    expect(isFeedbackConfirmed(mc(1, ['a']), [])).toBe(false);
  });

  it('단일 정답은 하나를 고르는 즉시 열린다', () => {
    expect(isFeedbackConfirmed(mc(1, ['a']), ['b'])).toBe(true);
  });

  it('복수정답은 정답 개수만큼 다 골라야 열린다', () => {
    const q = mc(1, ['a', 'c']);
    expect(isFeedbackConfirmed(q, ['a'])).toBe(false);
    expect(isFeedbackConfirmed(q, ['a', 'c'])).toBe(true);
  });

  it('진위형은 선택하면 열린다', () => {
    expect(isFeedbackConfirmed(tf(1, ['o']), ['x'])).toBe(true);
  });

  it('서답형은 입력 도중에는 열린 것으로 보지 않는다(확인 시점을 알 수 없다)', () => {
    // 글자를 치는 중인 입력을 ✕로 먼저 보여 주지 않기 위해서다.
    expect(isFeedbackConfirmed(short(1, ['테스트']), ['테스'])).toBe(false);
  });
});

/**
 * 카드가 열릴 때의 피드백 — 목록이 ✓/✕를 칠하는 문항은 카드를 열어도 같은 정오가 보여야 한다.
 *
 * QuestionCard는 문항을 옮기면 새로 만들어져 열림 상태가 닫힌 채 시작한다. 시작 상태를 목록과 같은
 * 판정으로 정하지 않으면 "목록은 ✕인데 눌러 보니 정오도 해설도 없다"가 된다.
 */
describe('feedbackOpenOnEntry — 카드가 열릴 때 피드백을 미리 펼치는가', () => {
  const q = mc(1, ['a']);

  it('연습·오답에서 이미 푼(피드백이 열리는) 문항은 펼친 채 시작한다', () => {
    expect(feedbackOpenOnEntry('practice', q, ['b'])).toBe(true);
    expect(feedbackOpenOnEntry('review', q, ['a'])).toBe(true);
    expect(feedbackOpenOnEntry('practice', tf(2, ['o']), ['x'])).toBe(true);
  });

  it('안 푼 문항은 닫힌 채 시작한다(다음 문항으로 피드백이 새지 않는다)', () => {
    expect(feedbackOpenOnEntry('practice', q, [])).toBe(false);
    expect(feedbackOpenOnEntry('review', q, [])).toBe(false);
  });

  it('복수정답을 덜 골랐거나 서답형이면 닫힌 채 시작한다(목록도 정오를 칠하지 않는 문항)', () => {
    expect(feedbackOpenOnEntry('practice', mc(3, ['a', 'c']), ['a'])).toBe(false);
    expect(feedbackOpenOnEntry('practice', short(4, ['테스트']), ['테스트'])).toBe(false);
  });

  it('시험·랜덤·퀵은 답이 있어도 닫힌 채 시작한다(공개는 채점이 정한다)', () => {
    for (const mode of ['exam', 'random', 'quick']) {
      expect(feedbackOpenOnEntry(mode, q, ['a']), mode).toBe(false);
    }
  });

  // 목록과 카드가 같은 판정을 쓴다는 것을 고정한다 — 한쪽 판정만 바꾸면 여기서 갈라진다.
  it('모든 모드·답안에서 목록이 정오를 칠하는 문항과 카드가 펼치는 문항이 같다', () => {
    const cases = [q, mc(5, ['a', 'c']), tf(6, ['o']), short(7, ['가'])];
    const picks = [[], ['a'], ['b'], ['a', 'c'], ['o'], ['가']];
    for (const mode of ['practice', 'review', 'exam', 'random', 'quick']) {
      for (const c of cases) {
        for (const selected of picks) {
          expect(feedbackOpenOnEntry(mode, c, selected), `${mode} ${c.id} [${selected}]`)
            .toBe(isCorrectnessRevealed(mode, c, selected, false));
        }
      }
    }
  });

  it('isImmediateFeedbackMode: 연습·오답만 즉시 피드백 모드다', () => {
    expect(isImmediateFeedbackMode('practice')).toBe(true);
    expect(isImmediateFeedbackMode('review')).toBe(true);
    for (const mode of ['exam', 'random', 'quick', '']) expect(isImmediateFeedbackMode(mode), mode).toBe(false);
  });
});

describe('isCorrectnessRevealed · isCorrectnessVisible', () => {
  const q = mc(1, ['a']);

  it('연습은 고른 즉시 정오가 보인다', () => {
    expect(isCorrectnessRevealed('practice', q, ['a'], false)).toBe(true);
    expect(isCorrectnessRevealed('review', q, ['b'], false)).toBe(true);
  });

  it('시험·랜덤은 채점 전에는 맞게 골랐어도 정오가 보이지 않는다', () => {
    expect(isCorrectnessRevealed('exam', q, ['a'], false)).toBe(false);
    expect(isCorrectnessRevealed('random', q, ['a'], false)).toBe(false);
  });

  it('시험은 채점 뒤에 보인다', () => {
    expect(isCorrectnessRevealed('exam', q, ['a'], true)).toBe(true);
  });

  it('목록 단위 가시성: 연습·오답은 늘, 시험·랜덤은 채점 뒤에만', () => {
    expect(isCorrectnessVisible('practice', false)).toBe(true);
    expect(isCorrectnessVisible('review', false)).toBe(true);
    expect(isCorrectnessVisible('exam', false)).toBe(false);
    expect(isCorrectnessVisible('random', false)).toBe(false);
    expect(isCorrectnessVisible('exam', true)).toBe(true);
  });
});

describe('deriveQuestionStatuses', () => {
  const questions = [mc(1, ['a']), mc(2, ['b']), mc(3, ['c']), mc(4, ['a', 'b'])];

  it('연습: 맞음·틀림·안 풂, 복수정답은 덜 골랐으면 아직 정오 없이 푼 문제다', () => {
    const got = deriveQuestionStatuses({
      mode: 'practice',
      questions,
      answers: ans({ Q1: ['a'], Q2: ['d'], Q4: ['a'] }),
      answerKeyOf: keyOf,
      graded: false,
    });
    expect(got.map((s) => s.state)).toEqual(['correct', 'wrong', 'unanswered', 'answered']);
    expect(got.map((s) => s.answered)).toEqual([true, true, false, true]);
  });

  it('시험 채점 전: 정오를 내지 않는다 — 푼 문제와 안 푼 문제뿐이다', () => {
    const got = deriveQuestionStatuses({
      mode: 'exam',
      questions,
      answers: ans({ Q1: ['a'], Q2: ['d'] }),
      answerKeyOf: keyOf,
      graded: false,
    });
    expect(got.map((s) => s.state)).toEqual(['answered', 'answered', 'unanswered', 'unanswered']);
    expect(got.some((s) => s.state === 'correct' || s.state === 'wrong')).toBe(false);
  });

  it('시험 채점 후: 미응답도 오답으로 센다. 그래도 "답함"은 거짓으로 남는다', () => {
    const got = deriveQuestionStatuses({
      mode: 'exam',
      questions,
      answers: ans({ Q1: ['a'], Q2: ['d'] }),
      answerKeyOf: keyOf,
      graded: true,
    });
    expect(got.map((s) => s.state)).toEqual(['correct', 'wrong', 'wrong', 'wrong']);
    // '안 푼 문제' 필터가 채점 뒤에도 실제로 안 푼 문항을 가려낼 수 있어야 한다.
    expect(got.map((s) => s.answered)).toEqual([true, true, false, false]);
  });

  it('퀵은 복수정답을 덜 골랐으면 답한 것으로 세지 않는다(점수판과 같은 기준)', () => {
    const got = deriveQuestionStatuses({
      mode: 'quick',
      questions: [mc(1, ['a', 'b'])],
      answers: ans({ Q1: ['a'] }),
      answerKeyOf: keyOf,
      graded: false,
    });
    expect(got[0]).toEqual({ state: 'unanswered', answered: false });
  });

  it('서답형 연습: 입력은 푼 문제로 세되 정오는 아직 내지 않는다', () => {
    const got = deriveQuestionStatuses({
      mode: 'practice',
      questions: [short(1, ['테스트'])],
      answers: ans({ Q1: ['테스트'] }),
      answerKeyOf: keyOf,
      graded: false,
    });
    expect(got[0]).toEqual({ state: 'answered', answered: true });
  });

  it('서답형 시험 채점 후: 동의어·정규화를 거친 정답 판정을 그대로 쓴다', () => {
    const got = deriveQuestionStatuses({
      mode: 'exam',
      questions: [short(1, ['테스트'])],
      answers: ans({ Q1: [' 테스트 '] }),
      answerKeyOf: keyOf,
      graded: true,
    });
    expect(got[0].state).toBe('correct');
  });
});

describe('요약·필터·스트립', () => {
  const statuses = [
    { state: 'correct', answered: true },
    { state: 'wrong', answered: true },
    { state: 'wrong', answered: false }, // 채점으로 오답 처리된 미응답
    { state: 'answered', answered: true },
    { state: 'unanswered', answered: false },
  ] as const;
  const list = [...statuses];

  it('summarizeStatuses: 풀이는 실제로 답한 문항, 오답은 채점 오답까지 센다', () => {
    expect(summarizeStatuses(list)).toEqual({
      total: 5, solved: 3, unsolved: 2, correct: 1, wrong: 2, pending: 1,
    });
  });

  it('indicesForFilter: 전체·안 푼 문제·오답', () => {
    expect(indicesForFilter(list, 'all')).toEqual([0, 1, 2, 3, 4]);
    // 채점 오답 처리된 미응답(2)도 안 푼 문제다.
    expect(indicesForFilter(list, 'unsolved')).toEqual([2, 4]);
    expect(indicesForFilter(list, 'wrong')).toEqual([1, 2]);
  });

  it('stripTones: 지금 문제가 상태 색을 덮는다', () => {
    expect(stripTones(list, 3)).toEqual(['correct', 'wrong', 'wrong', 'current', 'unanswered']);
  });

  it('stripLabel: 정오를 보여 줄 수 없는 단계에서는 푼 수만 말한다', () => {
    const summary = summarizeStatuses(list);
    expect(stripLabel({ summary, currentIndex: 3, showCorrectness: false }))
      .toBe('진행 상황: 5문항 중 4번째, 푼 문제 3');
    expect(stripLabel({ summary, currentIndex: 3, showCorrectness: true }))
      .toBe('진행 상황: 5문항 중 4번째, 정답 1, 오답 2, 확인 전 1');
    expect(stripLabel({ summary: summarizeStatuses([]), currentIndex: 0, showCorrectness: true }))
      .toBe('진행 상황: 문항 없음');
  });

  it('listSummaryText', () => {
    const summary = summarizeStatuses(list);
    expect(listSummaryText(summary, true)).toBe('3 / 5 풀이 · 정답 1 · 오답 2');
    expect(listSummaryText(summary, false)).toBe('3 / 5 풀이');
  });
});

describe('cellAriaLabel — 색에만 기대지 않는 읽는 말', () => {
  it('상태를 말로 준다', () => {
    expect(cellAriaLabel(3, 'wrong', false)).toBe('문제 3, 오답');
    expect(cellAriaLabel(5, 'correct', false)).toBe('문제 5, 정답');
    expect(cellAriaLabel(13, 'unanswered', false)).toBe('문제 13, 안 푼 문제');
    expect(cellAriaLabel(7, 'answered', false)).toBe('문제 7, 푼 문제');
  });

  it('지금 문제는 위치를 먼저 말하고, 풀었다면 상태를 덧붙인다', () => {
    expect(cellAriaLabel(12, 'unanswered', true)).toBe('문제 12, 지금 문제');
    expect(cellAriaLabel(12, 'wrong', true)).toBe('문제 12, 지금 문제, 오답');
  });
});

describe('canOfferRetryWrong', () => {
  it('오답이 있고 버려질 세션이 없을 때만 낸다', () => {
    expect(canOfferRetryWrong({ mode: 'practice', sessionInProgress: false, count: 4 })).toBe(true);
    expect(canOfferRetryWrong({ mode: 'exam', sessionInProgress: false, count: 4 })).toBe(true); // 채점 뒤
    expect(canOfferRetryWrong({ mode: 'random', sessionInProgress: false, count: 4 })).toBe(true); // 채점 뒤
    expect(canOfferRetryWrong({ mode: 'practice', sessionInProgress: false, count: 0 })).toBe(false);
  });

  it('시험 응시 중·채점 전 랜덤에서는 내지 않는다(풀던 세션이 버려지고 잠금이 깨진다)', () => {
    expect(canOfferRetryWrong({ mode: 'exam', sessionInProgress: true, count: 4 })).toBe(false);
    expect(canOfferRetryWrong({ mode: 'random', sessionInProgress: true, count: 4 })).toBe(false);
  });

  it('오답 모드 안에서는 내지 않는다(같은 목록을 다시 열 뿐 풀던 답안만 지워진다)', () => {
    expect(canOfferRetryWrong({ mode: 'review', sessionInProgress: false, count: 4 })).toBe(false);
  });

  it('퀵에서는 내지 않는다(퀵 오답은 세트 버킷에 담기지 않는다)', () => {
    expect(canOfferRetryWrong({ mode: 'quick', sessionInProgress: false, count: 4 })).toBe(false);
  });
});
