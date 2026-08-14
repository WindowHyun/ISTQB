import { describe, it, expect } from 'vitest';
import { buildSetTimelines, buildMiniTestRounds, isSetLevelRound, latestAttemptComparison, formatDeltaPp, overcomeNumbers, attemptRatePercent } from './attemptStats';
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
    expect(a.improvements).toEqual([{ mode: 'exam', delta: 50 }]);
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
    // 성장폭은 모드별로 각각. 랜덤은 1회뿐이라 대상이 아니다.
    expect(a.improvements).toEqual([{ mode: 'exam', delta: 30 }]);
  });

  it('회차가 1개뿐인 모드는 성장폭 대상이 아니다(비교 대상 없음)', () => {
    const tl = buildSetTimelines(
      [
        h({ id: 'e1', setId: 'A', mode: 'exam', correct: 20, total: 40, createdAt: 100 }),
        h({ id: 'r1', setId: 'A', mode: 'random', correct: 40, total: 40, createdAt: 200 }),
      ],
      titleOf,
    );
    expect(tl[0].improvements).toEqual([]);
  });

  it('최신 회차가 다른 모드여도 기존 모드의 성장폭은 유지된다', () => {
    // 종전 버그: 성장폭을 '최신 회차의 모드'로만 계산해, 시험 실력이 그대로인데도
    // 랜덤을 한 번 풀면 시험 성장폭 배지가 통째로 사라졌다.
    const base = [
      h({ id: 'e1', setId: 'A', mode: 'exam', correct: 20, total: 40, createdAt: 100 }), // 50%
      h({ id: 'e2', setId: 'A', mode: 'exam', correct: 30, total: 40, createdAt: 200 }), // 75%
    ];
    expect(buildSetTimelines(base, titleOf)[0].improvements).toEqual([{ mode: 'exam', delta: 25 }]);

    const withRandom = [...base, h({ id: 'r1', setId: 'A', mode: 'random', correct: 20, total: 40, createdAt: 300 })];
    expect(buildSetTimelines(withRandom, titleOf)[0].improvements).toEqual([{ mode: 'exam', delta: 25 }]);
  });

  it('모드가 둘 다 2회 이상이면 각각 성장폭을 낸다(최신 회차 모드가 앞)', () => {
    const tl = buildSetTimelines(
      [
        h({ id: 'e1', setId: 'A', mode: 'exam', correct: 20, total: 40, createdAt: 100 }),   // 50%
        h({ id: 'r1', setId: 'A', mode: 'random', correct: 10, total: 40, createdAt: 200 }), // 25%
        h({ id: 'e2', setId: 'A', mode: 'exam', correct: 30, total: 40, createdAt: 300 }),   // 75%
        h({ id: 'r2', setId: 'A', mode: 'random', correct: 30, total: 40, createdAt: 400 }), // 75%
      ],
      titleOf,
    );
    expect(tl[0].improvements).toEqual([
      { mode: 'random', delta: 50 }, // 최신 회차의 모드가 앞
      { mode: 'exam', delta: 25 },
    ]);
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

// CSTS 가중 점수(cstsWeighted) 기준 통일 — 결과 모달·타임라인·통계 목록이 같은 %를 쓴다.
describe('attemptRatePercent (회차 % 단일 원천)', () => {
  it('가중 점수가 있으면 점수 기준 %를 쓴다(단순 정답률과 다를 수 있음)', () => {
    // 70문항 중 50정답 = 단순 71%, 가중 75/100 = 75%
    const rate = attemptRatePercent(
      h({ id: 'c1', setId: 'C', correct: 50, total: 70, createdAt: 1, cstsWeighted: { score: 75, maxScore: 100 } }),
    );
    expect(rate).toBe(75);
  });
  it('가중 점수가 없으면(ISTQB·과거 이력) 단순 정답률로 근사한다', () => {
    expect(attemptRatePercent(h({ id: 'i1', setId: 'A', correct: 26, total: 40, createdAt: 1 }))).toBe(65);
  });
  it('타임라인 회차 %도 같은 기준을 사용한다', () => {
    const tl = buildSetTimelines(
      [h({ id: 'c1', setId: 'C', correct: 50, total: 70, createdAt: 1, cstsWeighted: { score: 75, maxScore: 100 } })],
      (id) => id,
    );
    expect(tl[0].attempts[0].rate).toBe(75); // 단순 정답률(71)이 아니라 가중 75
    expect(tl[0].latest).toBe(75);
  });
});

describe('isSetLevelRound / buildMiniTestRounds', () => {
  const titleOf = (id: string) => (id === 'A' ? '세트 A' : id);

  it('챕터 미니 회차만 실전 회차에서 갈라낸다', () => {
    expect(isSetLevelRound(h({ id: '1', setId: 'A', mode: 'exam', correct: 20, total: 40, createdAt: 100 }))).toBe(true);
    expect(isSetLevelRound(h({ id: '2', setId: 'A', mode: 'random', correct: 9, total: 10, createdAt: 200, chapter: '테스트 기초' }))).toBe(false);
  });

  it('미니 회차를 챕터명과 함께 최신순으로 돌려준다', () => {
    const list = buildMiniTestRounds(
      [
        h({ id: 'e1', setId: 'A', mode: 'exam', correct: 20, total: 40, createdAt: 100 }),
        h({ id: 'm1', setId: 'A', mode: 'random', correct: 9, total: 10, createdAt: 200, chapter: '테스트 기초' }),
        h({ id: 'm2', setId: 'A', mode: 'random', correct: 5, total: 10, createdAt: 300, chapter: '테스트 도구' }),
      ],
      titleOf,
    );
    expect(list.map((m) => m.chapter)).toEqual(['테스트 도구', '테스트 기초']); // 최신 → 과거
    expect(list[0]).toMatchObject({ id: 'm2', title: '세트 A', rate: 50, correct: 5, total: 10 });
    // 실전 회차(시험)는 포함하지 않는다 — 타임라인이 담당한다.
    expect(list.some((m) => m.id === 'e1')).toBe(false);
  });

  it('타임라인과 미니 목록은 겹치지 않고 합치면 전체가 된다', () => {
    const hs = [
      h({ id: 'e1', setId: 'A', mode: 'exam', correct: 20, total: 40, createdAt: 100 }),
      h({ id: 'm1', setId: 'A', mode: 'random', correct: 9, total: 10, createdAt: 200, chapter: 'C1' }),
      h({ id: 'r1', setId: 'A', mode: 'random', correct: 20, total: 40, createdAt: 300 }),
    ];
    const inTimeline = buildSetTimelines(hs, titleOf).flatMap((t) => t.attempts.map((a) => a.id));
    const inMini = buildMiniTestRounds(hs, titleOf).map((m) => m.id);
    expect(inTimeline.sort()).toEqual(['e1', 'r1']);
    expect(inMini).toEqual(['m1']);
    expect([...inTimeline, ...inMini].sort()).toEqual(['e1', 'm1', 'r1']);
  });
});

// 퀵(10~20문항, 전 세트 혼합)은 세트 전체 회차가 아니다. 이 조건이 빠지면 예전에 고친
// "챕터 미니 시험이 최고 정답률을 부풀림"이 퀵으로 그대로 재발한다.
describe('퀵 회차 분리', () => {
  const q = (over: Partial<ExamHistory> = {}): ExamHistory =>
    ({ id: 'q1', setId: 'QUICK', mode: 'quick', answers: {}, correct: 9, total: 10, ...over });

  it('퀵은 세트 전체 회차가 아니다', () => {
    expect(isSetLevelRound(q())).toBe(false);
  });

  it('요약 집합에서 빠져 최고 정답률을 부풀리지 않는다', () => {
    const exam: ExamHistory =
      { id: 'e1', setId: 'A', mode: 'exam', answers: {}, correct: 26, total: 40 };
    const setLevel = [exam, q()].filter(isSetLevelRound);
    expect(setLevel).toEqual([exam]);
  });

  it('짧은 세션 목록에는 남는다 — 없으면 화면 어디에도 안 보여 개별 삭제가 불가능하다', () => {
    const rounds = buildMiniTestRounds([q({ createdAt: 1 })], () => '제목');
    expect(rounds).toHaveLength(1);
    expect(rounds[0].kind).toBe('quick');
    expect(rounds[0].chapter).toBeNull();
  });

  it('챕터 미니와 퀵이 섞여도 종류로 구분된다', () => {
    const mini: ExamHistory =
      { id: 'm1', setId: 'A', mode: 'random', answers: {}, correct: 9, total: 10, chapter: '기초', createdAt: 2 };
    const rounds = buildMiniTestRounds([mini, q({ createdAt: 1 })], () => '제목');
    expect(rounds.map((r) => r.kind)).toEqual(['mini', 'quick']);
  });
});

/**
 * 정렬 결정성과 결측 필드 — 통계 화면이 렌더마다 다른 순서를 보여주지 않게 한다.
 *
 * 같은 ms에 두 회차가 만들어지는 일은 실제로 있다(채점 직후 재응시, 백업 병합).
 * 시각만으로 정렬하면 그때 순서가 입력 순서에 좌우되고, 회차 번호·'직전 회차'·극복
 * 판정이 함께 흔들린다 — 속성 테스트가 실제로 잡아낸 반례가 이 형태였다.
 */
describe('동률·결측에서도 결정적이다', () => {
  it('같은 시각의 회차는 id로 순서를 정한다(회차 번호가 흔들리지 않는다)', () => {
    const forward = buildSetTimelines([
      h({ id: 'b', setId: 'A', correct: 8, total: 10, createdAt: 100 }),
      h({ id: 'a', setId: 'A', correct: 5, total: 10, createdAt: 100 }),
    ], titleOf);
    const reversed = buildSetTimelines([
      h({ id: 'a', setId: 'A', correct: 5, total: 10, createdAt: 100 }),
      h({ id: 'b', setId: 'A', correct: 8, total: 10, createdAt: 100 }),
    ], titleOf);
    expect(forward[0].attempts.map((x) => x.id)).toEqual(['a', 'b']);
    expect(reversed[0].attempts.map((x) => x.id)).toEqual(['a', 'b']);
    expect(forward[0].attempts[1].deltaFromPrev).toBe(30); // 50% → 80%
  });

  it('세트 목록도 최근 응시 시각이 같으면 setId로 정한다', () => {
    const got = buildSetTimelines([
      h({ id: 'r2', setId: 'B', correct: 5, total: 10, createdAt: 100 }),
      h({ id: 'r1', setId: 'A', correct: 5, total: 10, createdAt: 100 }),
    ], titleOf);
    expect(got.map((t) => t.setId)).toEqual(['A', 'B']);
  });

  it('짧은 세션 목록도 같은 시각이면 id로 정한다', () => {
    const got = buildMiniTestRounds([
      h({ id: 'm2', setId: 'A', correct: 5, total: 10, createdAt: 100, mode: 'random', chapter: '테스트 기초' }),
      h({ id: 'm1', setId: 'A', correct: 7, total: 10, createdAt: 100, mode: 'random', chapter: '정적 테스트' }),
    ], titleOf);
    expect(got.map((r) => r.id)).toEqual(['m1', 'm2']);
  });

  it('시각이 없는 회차도 타임라인에 실린다(createdAt 0으로 취급)', () => {
    const legacy = { id: 'old', setId: 'A', mode: 'exam', answers: {}, correct: 4, total: 10 } as ExamHistory;
    const got = buildSetTimelines([legacy, h({ id: 'new', setId: 'A', correct: 9, total: 10, createdAt: 10 })], titleOf);
    expect(got[0].attempts.map((x) => x.id)).toEqual(['old', 'new']);
    expect(got[0].attempts[0].createdAt).toBe(0);
  });

  it('극복 판정도 같은 시각이면 id로 최근 2회를 고른다', () => {
    const wrong = (n: number) => ({ number: n, myAnswer: ['x'], correctAnswer: ['a'] });
    const got = overcomeNumbers([
      h({ id: 'e1', setId: 'A', correct: 9, total: 10, createdAt: 100, wrongItems: [wrong(7)] }),
      h({ id: 'e2', setId: 'A', correct: 9, total: 10, createdAt: 100, wrongItems: [] }),
      h({ id: 'e3', setId: 'A', correct: 9, total: 10, createdAt: 100, wrongItems: [] }),
    ], 'A', [7]);
    // 최신 2회(e3·e2)에 7번이 없으므로 극복이다 — 어느 순서로 넣어도 같아야 한다.
    expect([...got]).toEqual([7]);
  });

  it('점수 필드가 없는 이력의 %는 0으로 본다(화면이 NaN을 띄우지 않게)', () => {
    expect(attemptRatePercent({ id: 'x', setId: 'A', mode: 'exam', answers: {} } as ExamHistory)).toBe(0);
  });

  it('챕터 표식이 없는 회차는 일반 회차끼리만 비교한다', () => {
    const got = latestAttemptComparison([
      h({ id: 'r1', setId: 'A', correct: 5, total: 10, createdAt: 1 }),
      h({ id: 'r2', setId: 'A', correct: 8, total: 10, createdAt: 2 }),
      h({ id: 'm1', setId: 'A', correct: 10, total: 10, createdAt: 3, chapter: '테스트 기초' }),
    ], 'A', 'exam');
    expect(got).toEqual({ round: 2, previousRate: 50 });
  });
});
