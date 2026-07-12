import { describe, it, expect } from 'vitest';
import { buildSetTimelines, latestAttemptComparison, formatDeltaPp, overcomeNumbers } from './attemptStats';
import type { ExamHistory } from '../store/useQuizStore';

// 회차 이력 헬퍼 — createdAt으로 시간순을 통제한다.
const h = (
  o: Partial<ExamHistory> & { id: string; setId: string; correct: number; total: number; createdAt: number },
): ExamHistory => ({ mode: 'exam', answers: {}, ...o });

const titleOf = (id: string) => (id === 'A' ? '세트 A' : id === 'B' ? '세트 B' : id);

describe('buildSetTimelines', () => {
  it('세트별로 회차를 시간순 번호화하고 직전 회차 대비 변화를 계산한다', () => {
    const tl = buildSetTimelines(
      [
        h({ id: 'a2', setId: 'A', correct: 30, total: 40, createdAt: 200 }), // 75%
        h({ id: 'a1', setId: 'A', correct: 20, total: 40, createdAt: 100 }), // 50%
        h({ id: 'a3', setId: 'A', correct: 40, total: 40, createdAt: 300 }), // 100%
      ],
      titleOf,
    );
    expect(tl).toHaveLength(1);
    const a = tl[0];
    expect(a.setId).toBe('A');
    expect(a.title).toBe('세트 A');
    expect(a.attempts.map((x) => x.round)).toEqual([1, 2, 3]);
    expect(a.attempts.map((x) => x.rate)).toEqual([50, 75, 100]);
    expect(a.attempts.map((x) => x.deltaFromPrev)).toEqual([null, 25, 25]);
    expect(a.first).toBe(50);
    expect(a.latest).toBe(100);
    expect(a.best).toBe(100);
    expect(a.improvement).toBe(50);
  });

  it('모드가 섞이면 델타·성장폭은 같은 모드끼리만 비교한다(시험70 vs 랜덤40 표본 왜곡 방지)', () => {
    const tl = buildSetTimelines(
      [
        h({ id: 'e1', setId: 'A', mode: 'exam', correct: 20, total: 40, createdAt: 100 }), // exam 50%
        h({ id: 'r1', setId: 'A', mode: 'random', correct: 40, total: 40, createdAt: 200 }), // random 100%
        h({ id: 'e2', setId: 'A', mode: 'exam', correct: 32, total: 40, createdAt: 300 }), // exam 80%
      ],
      titleOf,
    );
    const a = tl[0];
    // 랜덤 회차는 직전 시험과 비교하지 않고(null), 시험 2회차는 시험 1회차와 비교(+30).
    expect(a.attempts.map((x) => x.deltaFromPrev)).toEqual([null, null, 30]);
    // 성장폭은 최신 회차(시험)의 같은 모드 첫 회차 대비.
    expect(a.improvement).toBe(30);
  });

  it('최신 회차 모드의 회차가 1개뿐이면 성장폭은 null(비교 대상 없음)', () => {
    const tl = buildSetTimelines(
      [
        h({ id: 'e1', setId: 'A', mode: 'exam', correct: 20, total: 40, createdAt: 100 }),
        h({ id: 'r1', setId: 'A', mode: 'random', correct: 40, total: 40, createdAt: 200 }),
      ],
      titleOf,
    );
    expect(tl[0].improvement).toBeNull();
  });

  it('점수 없는(미채점) 회차는 제외하고, 최근 응시 세트를 앞에 둔다', () => {
    const tl = buildSetTimelines(
      [
        h({ id: 'a1', setId: 'A', correct: 10, total: 40, createdAt: 100 }),
        h({ id: 'b1', setId: 'B', correct: 20, total: 40, createdAt: 500 }),
        { id: 'x', setId: 'A', mode: 'exam', answers: {} } as ExamHistory, // total 없음 → 제외
      ],
      titleOf,
    );
    expect(tl.map((t) => t.setId)).toEqual(['B', 'A']); // B가 더 최근
    expect(tl.every((t) => t.attempts.length === 1)).toBe(true);
  });
});

describe('latestAttemptComparison', () => {
  it('같은 세트·모드의 최신 회차를 기준으로 회차 수와 직전 정답률을 준다', () => {
    const hist = [
      h({ id: 'a1', setId: 'A', correct: 20, total: 40, createdAt: 100 }), // 50%
      h({ id: 'a2', setId: 'A', correct: 32, total: 40, createdAt: 200 }), // 80%
    ];
    expect(latestAttemptComparison(hist, 'A', 'exam')).toEqual({ round: 2, previousRate: 50 });
  });

  it('첫 응시면 previousRate가 null이고 round는 1', () => {
    const hist = [h({ id: 'a1', setId: 'A', correct: 20, total: 40, createdAt: 100 })];
    expect(latestAttemptComparison(hist, 'A', 'exam')).toEqual({ round: 1, previousRate: null });
  });

  it('다른 모드/세트 회차는 비교에 섞이지 않는다', () => {
    const hist = [
      h({ id: 'a1', setId: 'A', mode: 'exam', correct: 20, total: 40, createdAt: 100 }),
      h({ id: 'r1', setId: 'A', mode: 'random', correct: 40, total: 40, createdAt: 150 }),
      h({ id: 'a2', setId: 'A', mode: 'exam', correct: 30, total: 40, createdAt: 200 }),
    ];
    // exam만 2회차, 직전은 50%(랜덤 100%는 무시).
    expect(latestAttemptComparison(hist, 'A', 'exam')).toEqual({ round: 2, previousRate: 50 });
  });

  it('해당 세트·모드 기록이 없으면 round 0·previousRate null', () => {
    expect(latestAttemptComparison([], 'A', 'exam')).toEqual({ round: 0, previousRate: null });
  });
});

describe('formatDeltaPp', () => {
  it('상승/하락/동일에 대해 방향과 라벨을 일관되게 준다(결과 모달·타임라인 공용)', () => {
    expect(formatDeltaPp(5)).toEqual({ label: '▲ +5%p', dir: 'up' });
    expect(formatDeltaPp(-3)).toEqual({ label: '▼ -3%p', dir: 'down' });
    expect(formatDeltaPp(0)).toEqual({ label: '± 0%p', dir: 'same' });
  });
});

describe('챕터 미니 시험 회차(chapter 표식)', () => {
  it('buildSetTimelines는 미니 회차를 타임라인에서 제외한다(10문항 표본이 세트 회차와 섞이지 않게)', () => {
    const tl = buildSetTimelines(
      [
        h({ id: 'e1', setId: 'A', correct: 20, total: 40, createdAt: 100 }),
        h({ id: 'm1', setId: 'A', mode: 'random', chapter: '테스트 기초', correct: 9, total: 10, createdAt: 200 }),
      ],
      titleOf,
    );
    expect(tl).toHaveLength(1);
    expect(tl[0].attempts).toHaveLength(1);
    expect(tl[0].attempts[0].id).toBe('e1');
  });

  it('latestAttemptComparison은 같은 챕터 미니끼리만 회차를 센다(일반 랜덤과 분리)', () => {
    const hist = [
      h({ id: 'r1', setId: 'A', mode: 'random', correct: 20, total: 40, createdAt: 100 }), // 일반 랜덤 50%
      h({ id: 'm1', setId: 'A', mode: 'random', chapter: '테스트 기초', correct: 5, total: 10, createdAt: 200 }), // 미니 50%
      h({ id: 'm2', setId: 'A', mode: 'random', chapter: '테스트 기초', correct: 8, total: 10, createdAt: 300 }), // 미니 80%
    ];
    // 미니 스코프: m1→m2 두 회차, 직전은 m1(50%)
    expect(latestAttemptComparison(hist, 'A', 'random', '테스트 기초')).toEqual({ round: 2, previousRate: 50 });
    // 일반 랜덤 스코프: r1 하나뿐(첫 응시) — 미니가 직전으로 잡히지 않는다
    expect(latestAttemptComparison(hist, 'A', 'random')).toEqual({ round: 1, previousRate: null });
    // 다른 챕터 미니는 0회차
    expect(latestAttemptComparison(hist, 'A', 'random', '정적 테스트')).toEqual({ round: 0, previousRate: null });
  });
});

describe('overcomeNumbers(오답 극복 판정)', () => {
  const wrong = (...nums: number[]) => nums.map((n) => ({ number: n, myAnswer: ['a'], correctAnswer: ['b'] }));

  it('최근 시험 2회 연속 정답(wrongItems에 없음)이면 극복이다', () => {
    const hist = [
      h({ id: 'e1', setId: 'A', correct: 0, total: 40, createdAt: 100, wrongItems: wrong(1, 2) }),
      h({ id: 'e2', setId: 'A', correct: 39, total: 40, createdAt: 200, wrongItems: wrong(2) }),
      h({ id: 'e3', setId: 'A', correct: 39, total: 40, createdAt: 300, wrongItems: wrong(2) }),
    ];
    const out = overcomeNumbers(hist, 'A', [1, 2]);
    expect(out.has(1)).toBe(true); // e2·e3에서 정답
    expect(out.has(2)).toBe(false); // 여전히 오답
  });

  it('시험 회차가 2회 미만이면 극복 없음(연속 2회를 말할 수 없다)', () => {
    const hist = [h({ id: 'e1', setId: 'A', correct: 39, total: 40, createdAt: 100, wrongItems: wrong(2) })];
    expect(overcomeNumbers(hist, 'A', [1]).size).toBe(0);
  });

  it('랜덤·미니 회차는 근거로 쓰지 않는다(추첨 포함 여부를 알 수 없음)', () => {
    const hist = [
      h({ id: 'e1', setId: 'A', correct: 0, total: 40, createdAt: 100, wrongItems: wrong(1) }),
      h({ id: 'r1', setId: 'A', mode: 'random', correct: 40, total: 40, createdAt: 200, wrongItems: [] }),
      h({ id: 'r2', setId: 'A', mode: 'random', correct: 40, total: 40, createdAt: 300, wrongItems: [] }),
    ];
    // 시험은 e1 하나뿐 → 판정 불가
    expect(overcomeNumbers(hist, 'A', [1]).size).toBe(0);
  });

  it('최근 2회 중 한 회라도 다시 틀리면 극복이 아니다', () => {
    const hist = [
      h({ id: 'e1', setId: 'A', correct: 39, total: 40, createdAt: 100, wrongItems: wrong(1) }),
      h({ id: 'e2', setId: 'A', correct: 40, total: 40, createdAt: 200, wrongItems: [] }),
      h({ id: 'e3', setId: 'A', correct: 39, total: 40, createdAt: 300, wrongItems: wrong(1) }),
    ];
    expect(overcomeNumbers(hist, 'A', [1]).size).toBe(0);
  });

  it('wrongItems가 없는 과거(legacy) 회차는 근거에서 제외한다', () => {
    const hist = [
      h({ id: 'e1', setId: 'A', correct: 0, total: 40, createdAt: 100, wrongItems: wrong(1) }),
      h({ id: 'e2', setId: 'A', correct: 40, total: 40, createdAt: 200 }), // legacy(스냅샷 없음)
      h({ id: 'e3', setId: 'A', correct: 40, total: 40, createdAt: 300, wrongItems: [] }),
    ];
    // 근거 가능한 시험은 e1·e3 — e1에서 틀렸으므로 극복 아님
    expect(overcomeNumbers(hist, 'A', [1]).size).toBe(0);
  });
});
