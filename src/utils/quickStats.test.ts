import { describe, it, expect } from 'vitest';
import { computeQuickStats, isQuickCommitted, type QuickScorable } from './quickStats';

/**
 * quickStats는 커버리지 0%였다 — 측정 대상(src/utils/**)에 들어 있는데 값이 0이라,
 * '낮은 것'이 아니라 **아무도 안 재는 것**이었다. 이 파일이 정하는 것은 두 가지다.
 *
 *  - isQuickCommitted: 퀵에서 답이 확정됐는가. 확정은 세 가지를 동시에 뜻한다 —
 *    보기가 잠기고, 점수판에 잡히고, **회차에 기록된다**(useQuizSession의 gradableQuestions).
 *    복수정답을 하나만 눌러도 확정으로 보면 3개짜리 문항이 첫 클릭에 오답으로 굳는다.
 *  - computeQuickStats: 퀵의 유일한 진행 표시(헤더 점수판)에 뜨는 숫자 전부.
 *
 * 실제로 이 파일에서 결함이 두 번 나왔다. 하나는 복수정답 확정 규칙을 E2E 헬퍼가 몰라
 * 5%짜리 간헐 실패로 나타났고, 다른 하나는 커서 제한이 만든 점수판 되감김이다.
 * 둘 다 유닛이 한 줄도 닿지 않던 자리라 화면 너머에서만 드러났다.
 */

const mc = (id: string, answer: string[], optionCount = 4): QuickScorable => ({
  id,
  number: Number(id.replace(/\D/g, '')) || 1,
  type: 'multiple_choice',
  answer,
  options: Array.from({ length: optionCount }, (_, i) => ({ key: 'abcd'[i], text: '' })),
});

const short = (id: string, answer: string[]): QuickScorable => ({
  id, number: 1, type: 'short_answer', answer, options: [],
});

const keyOf = (q: QuickScorable) => String(q.id);

describe('isQuickCommitted', () => {
  it('단일 정답은 하나만 고르면 확정이다', () => {
    expect(isQuickCommitted(mc('q1', ['a']), ['a'])).toBe(true);
    expect(isQuickCommitted(mc('q1', ['a']), ['b'])).toBe(true); // 오답이어도 '답한 것'은 맞다
    expect(isQuickCommitted(mc('q1', ['a']), [])).toBe(false);
  });

  // 이 규칙이 뒤집히면 3개짜리 문항이 첫 클릭에 오답으로 굳고, 나머지 보기는 잠긴다.
  it('복수정답은 정답 개수만큼 다 골라야 확정이다', () => {
    const q = mc('q2', ['a', 'b', 'c']);
    expect(isQuickCommitted(q, [])).toBe(false);
    expect(isQuickCommitted(q, ['a'])).toBe(false);
    expect(isQuickCommitted(q, ['a', 'b'])).toBe(false);
    expect(isQuickCommitted(q, ['a', 'b', 'c'])).toBe(true);
    // 개수만 맞으면 확정이다(정오답 판정은 isQuestionCorrect의 몫).
    expect(isQuickCommitted(q, ['b', 'c', 'd'])).toBe(true);
    // 정답 개수를 넘긴 선택은 확정이 아니다. UI는 상한에서 막지만 답안은 백업 가져오기로도
    // 들어온다 — '이상 이면 확정'(>=)으로 완화하면 손상된 답안이 조용히 회차에 실린다.
    expect(isQuickCommitted(q, ['a', 'b', 'c', 'd'])).toBe(false);
  });

  // 보기가 없는 문항은 정답이 여럿이어도 '동의어'라 복수 선택이 아니다 — 보기 유무로 가른다.
  it('보기가 없으면 정답이 여럿이어도 복수정답으로 보지 않는다', () => {
    expect(isQuickCommitted(short('q3', ['로그', 'Log']), ['로그'])).toBe(true);
    expect(isQuickCommitted(short('q3', ['로그', 'Log']), [])).toBe(false);
  });

  // options 필드가 아예 없는 문항(구버전·외부 데이터)에서도 죽지 않아야 한다.
  it('보기 필드가 없어도 판정한다', () => {
    const noOptions = { id: 'q5', number: 5, answer: ['로그'] } as QuickScorable;
    expect(isQuickCommitted(noOptions, ['로그'])).toBe(true);
    expect(isQuickCommitted(noOptions, [])).toBe(false);
  });

  // 단일 정답에 선택이 둘 저장된 상태(가져온 백업의 손상 답안)는 '답한 것'으로 본다 —
  // 확정해서 오답으로 세는 쪽이 맞다. 미확정으로 두면 화면에서 손댈 수 없는 문항이 되어
  // 점수판이 영영 그 문항을 기다린다.
  it('단일 정답에 선택이 여럿 저장돼 있어도 확정으로 본다', () => {
    expect(isQuickCommitted(mc('q6', ['a']), ['a', 'b'])).toBe(true);
  });

  it('다답형 서답형은 모든 칸이 채워져야 확정이다', () => {
    const q: QuickScorable = {
      id: 'q4', number: 4, type: 'short_answer', answer: [], options: [],
      answerParts: [
        { label: '동등분할', answer: ['4'] },
        { label: '경계값', answer: ['7'] },
      ],
    };
    expect(isQuickCommitted(q, ['4'])).toBe(false);
    expect(isQuickCommitted(q, ['4', ' '])).toBe(false); // 공백만 채운 칸은 답이 아니다
    expect(isQuickCommitted(q, ['4', '7'])).toBe(true);
  });
});

describe('computeQuickStats', () => {
  const qs = [mc('q1', ['a']), mc('q2', ['a']), mc('q3', ['a']), mc('q4', ['a'])];

  it('아무것도 안 풀었으면 전부 0이다', () => {
    expect(computeQuickStats(qs, {}, keyOf)).toEqual({
      solved: 0, correct: 0, wrong: 0, streak: 0, best: 0,
    });
  });

  it('확정한 문항만 세고 정오답을 가른다', () => {
    const stats = computeQuickStats(qs, { q1: ['a'], q2: ['b'] }, keyOf);
    expect(stats.solved).toBe(2);
    expect(stats.correct).toBe(1);
    expect(stats.wrong).toBe(1);
  });

  // 하나만 고른 복수정답은 화면상 '답함'으로 보이지만 확정이 아니다 — 점수판에도,
  // 채점 회차에도 들어가지 않는다(두 곳이 같은 술어를 쓴다).
  it('미확정 복수정답은 진행에 세지 않는다', () => {
    const multi = [mc('m1', ['a', 'b'])];
    expect(computeQuickStats(multi, { m1: ['a'] }, keyOf).solved).toBe(0);
    expect(computeQuickStats(multi, { m1: ['a', 'b'] }, keyOf).solved).toBe(1);
  });

  it('연속은 틀리는 순간 끊기고, 최고 기록은 남는다', () => {
    const stats = computeQuickStats(
      qs,
      { q1: ['a'], q2: ['a'], q3: ['b'], q4: ['a'] },
      keyOf,
    );
    expect(stats.correct).toBe(3);
    expect(stats.streak).toBe(1); // q3에서 끊기고 q4로 다시 1
    expect(stats.best).toBe(2); // q1·q2
  });

  /**
   * 되감김 회귀 — 이 검사가 결함의 본체다.
   *
   * 종전 서명은 현재 문항 인덱스(cursor)를 받아 거기까지만 셌다. 그래서 ‹ 나 팔레트로 앞
   * 문항에 돌아가면 이미 푼 문항이 집계에서 빠져 점수판이 뒤로 감겼다(진행 3 → 1).
   * 지금은 보고 있는 위치가 값에 관여하지 않는다.
   */
  it('보고 있는 위치와 무관하게 같은 값을 낸다(점수판 되감김 방지)', () => {
    const answers = { q1: ['a'], q2: ['b'], q3: ['a'] };
    const stats = computeQuickStats(qs, answers, keyOf);
    expect(stats.solved).toBe(3);
    // 첫 문항으로 되돌아가든 마지막에 있든, 인자가 같으면 결과도 같다.
    expect(computeQuickStats(qs, answers, keyOf)).toEqual(stats);
    // 뒤쪽 문항을 먼저 풀고 앞으로 돌아온 경우에도 빠짐없이 센다.
    expect(computeQuickStats(qs, { q4: ['a'] }, keyOf).solved).toBe(1);
  });

  it('출제 목록에 없는 답안은 세지 않는다(이전 회차 잔재 방어)', () => {
    expect(computeQuickStats(qs, { q1: ['a'], ghost: ['a'] }, keyOf).solved).toBe(1);
  });

  it('빈 출제 목록에서도 안전하다', () => {
    expect(computeQuickStats([], { q1: ['a'] }, keyOf).solved).toBe(0);
  });
});

/**
 * 교차 계약 — 점수판과 회차 기록은 **같은 문항 집합**을 봐야 한다.
 *
 * useQuizSession의 gradableQuestions는 `currentQuestions.filter(isQuickCommitted)`이고,
 * 점수판의 solved는 computeQuickStats가 센 값이다. 종전에는 술어를 공유하면서도 범위가
 * 갈려(점수판만 커서까지) 화면 "진행 1" · 기록 "3문항"이 됐다. 그 관계를 여기서 못 박는다.
 */
describe('점수판 × 채점 범위 교차 계약', () => {
  it('solved는 채점 대상 문항 수와 항상 같다', () => {
    const qs = [mc('q1', ['a']), mc('q2', ['a', 'b']), short('q3', ['로그']), mc('q4', ['a'])];
    const cases: Record<string, string[]>[] = [
      {},
      { q1: ['a'] },
      { q1: ['a'], q2: ['a'] }, // q2는 미확정(2개 중 1개)
      { q1: ['a'], q2: ['a', 'b'], q3: ['로그'] },
      { q4: ['a'] }, // 뒤쪽만 풀고 앞으로 돌아온 상태
      { q1: ['a'], q2: ['a', 'b'], q3: ['로그'], q4: ['b'] },
    ];
    for (const answers of cases) {
      const gradable = qs.filter((q) => isQuickCommitted(q, answers[keyOf(q)] || []));
      expect(
        computeQuickStats(qs, answers, keyOf).solved,
        `answers=${JSON.stringify(answers)}`,
      ).toBe(gradable.length);
    }
  });
});
