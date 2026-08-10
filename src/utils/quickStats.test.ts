import { describe, it, expect } from 'vitest';
import { computeQuickStats, isQuickCommitted, type QuickScorable } from './quickStats';

/**
 * 퀵 집계는 파생값이다 — 출제 순서 + 답안 + 커서에서 매번 계산한다.
 * 카운터를 따로 들지 않기로 한 결정의 근거가 여기 있다: 아래 성질들이 성립하려면
 * "한 번만 올린다"는 보장이 필요 없어야 한다.
 */

const keyOf = (q: QuickScorable) => `QUICK-quick-${q.id}`;

const mc = (id: string, answer = ['a']): QuickScorable => ({
  id, number: Number(id.replace(/\D/g, '')) || 1, type: 'multiple_choice',
  answer, options: [{ key: 'a', text: '' }, { key: 'b', text: '' }, { key: 'c', text: '' }],
});
const short = (id: string, answer = ['정답']): QuickScorable => ({
  id, number: 1, type: 'short_answer', answer,
});

describe('isQuickCommitted', () => {
  it('단일 선택은 하나만 고르면 확정이다', () => {
    expect(isQuickCommitted(mc('q1'), [])).toBe(false);
    expect(isQuickCommitted(mc('q1'), ['b'])).toBe(true);
  });

  // 복수정답을 isAnswered로 판정하면 첫 클릭에 확정돼 버린다 — 3개짜리 문항이
  // 하나만 고른 상태로 잠기고 오답으로 집계된다.
  it('복수정답은 정답 개수만큼 골라야 확정이다', () => {
    const q = mc('q2', ['a', 'c']);
    expect(isQuickCommitted(q, ['a'])).toBe(false);
    expect(isQuickCommitted(q, ['a', 'c'])).toBe(true);
  });

  // 빈 입력은 저장 자체가 되지 않는다 — QuestionCard가 `value ? [value] : []`로 쓰므로
  // 여기 도달하는 배열은 항상 비었거나 내용이 있다.
  it('서답형은 입력이 있으면 확정이다', () => {
    expect(isQuickCommitted(short('q3'), [])).toBe(false);
    expect(isQuickCommitted(short('q3'), ['오답'])).toBe(true);
  });

  it('다답형 서답형은 모든 칸이 차야 확정이다', () => {
    const q: QuickScorable = {
      id: 'q4', number: 4, type: 'short_answer', answer: ['x'],
      answerParts: [{ label: 'A', answer: ['가'] }, { label: 'B', answer: ['나'] }],
    };
    expect(isQuickCommitted(q, ['가'])).toBe(false);
    expect(isQuickCommitted(q, ['가', ''])).toBe(false);
    expect(isQuickCommitted(q, ['가', '나'])).toBe(true);
  });

  it('보기가 없는 진위형은 정답이 하나라 첫 선택이 확정이다', () => {
    const tf: QuickScorable = { id: 'q5', number: 5, type: 'true_false', answer: ['o'] };
    expect(isQuickCommitted(tf, ['x'])).toBe(true);
  });
});

describe('computeQuickStats', () => {
  const qs = [mc('q1'), mc('q2'), mc('q3'), mc('q4'), mc('q5')];

  it('아직 아무것도 안 풀었으면 전부 0이다', () => {
    expect(computeQuickStats(qs, {}, keyOf, 0)).toMatchObject({
      solved: 0, correct: 0, wrong: 0, streak: 0, best: 0,
    });
  });

  it('커서 뒤의 문항은 답이 있어도 세지 않는다', () => {
    // 아직 나오지 않은 문항을 세면 "진행 5"인데 화면은 1번 문항인 상태가 된다.
    const answers = { [keyOf(qs[0])]: ['a'], [keyOf(qs[3])]: ['a'] };
    expect(computeQuickStats(qs, answers, keyOf, 0).solved).toBe(1);
  });

  it('현재 문항을 아직 안 풀었으면 진행에 넣지 않는다', () => {
    // 화면에 떴다는 것만으로 진행이 오르면 답을 고르기도 전에 숫자가 먼저 움직인다.
    const answers = { [keyOf(qs[0])]: ['a'] };
    expect(computeQuickStats(qs, answers, keyOf, 1).solved).toBe(1);
  });

  it('정답·오답을 나눠 세고 진행은 그 합이다', () => {
    const answers = {
      [keyOf(qs[0])]: ['a'], // 정답
      [keyOf(qs[1])]: ['b'], // 오답
      [keyOf(qs[2])]: ['a'], // 정답
    };
    const s = computeQuickStats(qs, answers, keyOf, 2);
    expect(s).toMatchObject({ solved: 3, correct: 2, wrong: 1 });
    expect(s.correct + s.wrong).toBe(s.solved);
  });

  it('연속 정답은 틀리는 순간 끊기고 최고 기록은 남는다', () => {
    const answers = {
      [keyOf(qs[0])]: ['a'], // 정답 → streak 1
      [keyOf(qs[1])]: ['a'], // 정답 → streak 2 (best 2)
      [keyOf(qs[2])]: ['b'], // 오답 → streak 0
      [keyOf(qs[3])]: ['a'], // 정답 → streak 1
    };
    const s = computeQuickStats(qs, answers, keyOf, 3);
    expect(s.streak).toBe(1);
    expect(s.best).toBe(2);
  });

  it('건너뛴(미응답) 문항은 연속을 끊지 않고 그냥 빠진다', () => {
    // '다음'은 답을 확정해야 열리므로 정상 경로에선 생기지 않지만, 새로고침 등으로
    // 구멍이 생겨도 오답으로 둔갑시키지 않는다 — 풀지 않은 것은 틀린 것이 아니다.
    const answers = { [keyOf(qs[0])]: ['a'], [keyOf(qs[2])]: ['a'] };
    const s = computeQuickStats(qs, answers, keyOf, 2);
    expect(s).toMatchObject({ solved: 2, correct: 2, wrong: 0, streak: 2 });
  });

  it('복수정답을 덜 고른 문항은 확정 전이라 세지 않는다', () => {
    const multi = [mc('m1', ['a', 'b'])];
    expect(computeQuickStats(multi, { [keyOf(multi[0])]: ['a'] }, keyOf, 0).solved).toBe(0);
    expect(computeQuickStats(multi, { [keyOf(multi[0])]: ['a', 'b'] }, keyOf, 0)).toMatchObject({
      solved: 1, correct: 1,
    });
  });

  it('커서가 목록 끝을 넘어가도 마지막 문항까지만 센다(한 바퀴 완료 화면)', () => {
    const answers = Object.fromEntries(qs.map((q) => [keyOf(q), ['a']]));
    const s = computeQuickStats(qs, answers, keyOf, qs.length);
    expect(s).toMatchObject({ solved: 5, correct: 5, remaining: 0 });
  });

  it('남은 문항 수는 아직 안 푼 것의 개수다', () => {
    const answers = { [keyOf(qs[0])]: ['a'] };
    expect(computeQuickStats(qs, answers, keyOf, 0).remaining).toBe(4);
  });

  it('빈 목록에서도 터지지 않는다(문항 로드 전 렌더)', () => {
    expect(computeQuickStats([], {}, keyOf, 0)).toMatchObject({ solved: 0, remaining: 0 });
  });
});
