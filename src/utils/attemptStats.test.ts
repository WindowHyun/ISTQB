import { describe, it, expect } from 'vitest';
import { buildSetTimelines, latestAttemptComparison, formatDeltaPp } from './attemptStats';
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
