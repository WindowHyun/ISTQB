import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isAnswerCorrect, isQuestionCorrect } from './answer';
import { displayRatePercent, evaluatePass } from './scoring';
import { aggregateChapterStats, weightedRatePercent } from './chapterStats';
import { buildSetTimelines, latestAttemptComparison } from './attemptStats';
import type { ExamHistory } from '../store/useQuizStore';

// 속성 기반 테스트(fast-check) — 고정 예제가 아니라 랜덤 입력 수백~수천 개로
// "항상 성립해야 하는 불변식"을 검증한다(살충제 패러독스 완화: 매 실행 다른 입력).
// 실패 시 fast-check가 최소 반례(seed 포함)를 출력하므로 재현 가능하다.

// 보기 키 후보(실데이터와 동일한 소문자 알파벳 키 공간).
const keyArb = fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h');
const keysArb = fc.uniqueArray(keyArb, { minLength: 1, maxLength: 5 });

describe('속성 — isAnswerCorrect (정답 판정)', () => {
  it('정답 집합을 그대로 내면(순서·대소문자 무관) 항상 정답이다', () => {
    fc.assert(
      fc.property(keysArb, fc.boolean(), (answer, upper) => {
        const shuffled = [...answer].reverse().map((k) => (upper ? k.toUpperCase() : k));
        return isAnswerCorrect(answer, shuffled) === true;
      }),
    );
  });

  it('개수가 다르면 절대 정답이 아니다', () => {
    fc.assert(
      fc.property(keysArb, fc.integer({ min: 0, max: 4 }), (answer, dropCount) => {
        const selected = answer.slice(0, Math.max(0, answer.length - 1 - dropCount));
        return isAnswerCorrect(answer, selected) === false;
      }),
    );
  });

  it('정답 밖의 키가 하나라도 섞이면 정답이 아니다', () => {
    fc.assert(
      fc.property(keysArb, (answer) => {
        const outsider = 'zx9'; // 키 공간(a~h) 밖 — 절대 정답 키가 아님
        const selected = [...answer.slice(0, answer.length - 1), outsider];
        return isAnswerCorrect(answer, selected) === false;
      }),
    );
  });

  it('중복 선택은 개수가 맞아도 정답이 아니다', () => {
    fc.assert(
      fc.property(keysArb.filter((a) => a.length >= 2), (answer) => {
        const selected = [answer[0], answer[0], ...answer.slice(2)];
        return isAnswerCorrect(answer, selected) === false;
      }),
    );
  });

  it('빈/손상 정답키는 어떤 선택으로도 정답이 될 수 없다(방어 가드)', () => {
    fc.assert(
      fc.property(fc.array(keyArb, { maxLength: 4 }), (selected) => {
        return (
          isAnswerCorrect([], selected) === false &&
          isAnswerCorrect(undefined as unknown as string[], selected) === false
        );
      }),
    );
  });

  it('단답형: 정답 문자열은 공백·대소문자 변형에도 정답이다', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z가-힣]{2,10}$/),
        fc.constantFrom('', ' ', '  '),
        (word, pad) => {
          const typed = pad + word.toUpperCase().split('').join(pad) + pad;
          return isQuestionCorrect([word], [typed], 'short_answer') === true;
        },
      ),
    );
  });
});

describe('속성 — displayRatePercent / evaluatePass (점수·합격)', () => {
  const scoreArb = fc
    .record({ total: fc.integer({ min: 1, max: 200 }) })
    .chain(({ total }) =>
      fc.record({ total: fc.constant(total), correct: fc.integer({ min: 0, max: total }) }),
    );

  it('정답률은 항상 0~100이고, 만점=100·영점=0이다', () => {
    fc.assert(
      fc.property(scoreArb, ({ correct, total }) => {
        const r = displayRatePercent(correct, total);
        return r >= 0 && r <= 100 &&
          displayRatePercent(total, total) === 100 &&
          displayRatePercent(0, total) === 0;
      }),
    );
  });

  it('정답 수가 늘면 정답률은 감소하지 않는다(단조성)', () => {
    fc.assert(
      fc.property(scoreArb.filter((s) => s.correct < s.total), ({ correct, total }) => {
        return displayRatePercent(correct + 1, total) >= displayRatePercent(correct, total);
      }),
    );
  });

  it('합격 판정과 표시 정답률이 모순되지 않는다(ISTQB 65% 경계 일관성)', () => {
    fc.assert(
      fc.property(scoreArb, ({ correct, total }) => {
        const { passed, ratePercent } = evaluatePass('istqb', correct, total);
        // 표시가 65% 이상인데 불합격이거나, 65% 미만인데 합격이면 화면 모순.
        if (ratePercent >= 65 && !passed) return (correct / total) * 100 < 65; // 내림 경계 허용
        if (ratePercent < 65 && passed) return false;
        return true;
      }),
    );
  });
});

// 이력 생성기 — 실데이터 형태(setId 유일 규약, exam/random 모드, correct≤total).
const historyArb = fc.record({
  id: fc.uuid(),
  setId: fc.constantFrom('SET-A', 'SET-B', 'SET-C'),
  mode: fc.constantFrom('exam', 'random') as fc.Arbitrary<ExamHistory['mode']>,
  createdAt: fc.integer({ min: 1, max: 10_000 }),
  total: fc.integer({ min: 1, max: 70 }),
}).chain((h) =>
  fc.record({
    ...Object.fromEntries(Object.entries(h).map(([k, v]) => [k, fc.constant(v)])),
    correct: fc.integer({ min: 0, max: h.total }),
    answers: fc.constant({}),
  }) as fc.Arbitrary<ExamHistory>,
);

// id 유일성은 도메인 불변식이다 — 스토어 histories가 Record<id, History>이고
// IndexedDB keyPath도 'id'라서, 같은 id의 서로 다른 레코드는 앱 상태에 공존할 수 없다.
// (이 불변식을 생성기에 넣지 않으면 fast-check가 "동일 id·동일 createdAt·다른 내용"이라는
// 도달 불가능 상태로 정렬 결정성을 반증한다 — 실제로 최초 실행에서 그 반례를 찾아냈다.)
const uniqueHistoriesArb = (min: number, max: number) =>
  fc.array(historyArb, { minLength: min, maxLength: max })
    .map((hs) => hs.map((h, i) => ({ ...h, id: `${h.id}-${i}` })));

describe('속성 — attemptStats (회차 타임라인)', () => {
  it('입력 순서를 뒤섞어도 타임라인은 동일하다(정렬 결정성)', () => {
    fc.assert(
      fc.property(uniqueHistoriesArb(1, 12), (hs) => {
        const a = buildSetTimelines(hs, (id) => id);
        const b = buildSetTimelines([...hs].reverse(), (id) => id);
        return JSON.stringify(a) === JSON.stringify(b);
      }),
    );
  });

  it('회차 번호는 세트마다 1..N 연속이고, 델타는 같은 모드끼리만 계산된다', () => {
    fc.assert(
      fc.property(fc.array(historyArb, { minLength: 1, maxLength: 12 }), (hs) => {
        for (const tl of buildSetTimelines(hs, (id) => id)) {
          const seenByMode: Record<string, number> = {};
          for (let i = 0; i < tl.attempts.length; i++) {
            const at = tl.attempts[i];
            if (at.round !== i + 1) return false; // 연속성
            const priorSameMode = seenByMode[at.mode] ?? 0;
            // 같은 모드 선행 회차가 없으면 델타는 반드시 null이어야 한다.
            if (priorSameMode === 0 && at.deltaFromPrev !== null) return false;
            seenByMode[at.mode] = priorSameMode + 1;
          }
        }
        return true;
      }),
    );
  });

  it('직전 회차 비교의 round는 같은 세트·모드 이력 수와 정확히 일치한다', () => {
    fc.assert(
      fc.property(fc.array(historyArb, { maxLength: 12 }), (hs) => {
        const { round } = latestAttemptComparison(hs, 'SET-A', 'exam');
        const expected = hs.filter((h) => h.setId === 'SET-A' && h.mode === 'exam').length;
        return round === expected;
      }),
    );
  });
});

// 뮤테이션 테스팅(1차 85.77%)이 드러낸 검출 갭을 겨냥한 킬러 테스트 —
// 생존 뮤턴트가 가리킨 "테스트가 못 보던 동작"을 명시적으로 고정한다.
describe('뮤테이션 킬러 — 1차 생존 뮤턴트 사멸', () => {
  it('선다형(type 미지정/multiple_choice)은 부분집합 선택이 절대 정답이 아니다(short_answer 분기 오염 차단)', () => {
    // 생존: `if (type === 'short_answer') → if (true)` — 선다형이 단답 경로로 새면
    // ['a','b'] 정답에 ['a']만 골라도 정답 처리된다.
    fc.assert(
      fc.property(keysArb.filter((a) => a.length >= 2), (answer) => {
        return (
          isQuestionCorrect(answer, [answer[0]], 'multiple_choice') === false &&
          isQuestionCorrect(answer, [answer[0]], undefined) === false
        );
      }),
    );
  });

  it('단답형 동의어: 여러 정답 중 하나만 일치해도 정답(some이지 every가 아님)', () => {
    // 생존: `answer.some → answer.every`
    expect(isQuestionCorrect(['서울', 'seoul'], ['seoul'], 'short_answer')).toBe(true);
    expect(isQuestionCorrect(['서울', 'seoul'], ['부산'], 'short_answer')).toBe(false);
  });

  it('회차 집계: total=0 또는 correct/total 한쪽 결측 이력은 타임라인에서 제외된다', () => {
    // 생존: isScored의 `h.total > 0 → >= 0`, `&& → ||` 변형들.
    const base = { setId: 'S', mode: 'exam' as const, answers: {}, createdAt: 1 };
    const tl = buildSetTimelines(
      [
        { ...base, id: 'zero', total: 0, correct: 0 },
        { ...base, id: 'noTotal', correct: 5 },
        { ...base, id: 'noCorrect', total: 10 },
        { ...base, id: 'ok', total: 10, correct: 7, createdAt: 2 },
      ] as ExamHistory[],
      (id) => id,
    );
    expect(tl).toHaveLength(1);
    expect(tl[0].attempts.map((a) => a.id)).toEqual(['ok']);
  });

  it('직전 회차 비교는 입력이 뒤섞여 있어도 시간순 최신·직전을 정확히 고른다(정렬 생략 불가)', () => {
    // 생존: latestAttemptComparison의 sort 제거/무력화.
    const mk = (id: string, createdAt: number, correct: number): ExamHistory =>
      ({ id, setId: 'S', mode: 'exam', answers: {}, total: 10, correct, createdAt });
    // 최신(30, 90%)이 배열 맨 앞, 직전(20, 50%)이 맨 뒤 — 정렬 없이는 오답.
    const { round, previousRate } = latestAttemptComparison(
      [mk('c', 30, 9), mk('a', 10, 1), mk('b', 20, 5)], 'S', 'exam',
    );
    expect(round).toBe(3);
    expect(previousRate).toBe(50);
  });

  it('합격 기준·점수 라벨은 화면 계약 — 핵심 수치가 반드시 포함된다', () => {
    // 생존: criterionLabel/scoreLabel 빈 문자열 치환.
    const csts = evaluatePass('csts', 60, 70);
    expect(csts.criterionLabel).toContain('52.5');
    expect(csts.scoreLabel).toContain('환산');
    const istqb = evaluatePass('istqb', 26, 40);
    expect(istqb.criterionLabel).toContain('26 / 40');
    expect(istqb.scoreLabel).toContain('26 / 40');
  });

  it('가중 평균은 correct/total 결측 이력을 집계에서 제외한다(가드 생략 시 NaN 오염)', () => {
    // 생존: weightedRatePercent 가드의 &&→|| / true 치환 — 결측 필드가 섞이면 NaN이 된다.
    const base = { setId: 'S', mode: 'exam' as const, answers: {} };
    const histories = [
      { ...base, id: 'good', correct: 5, total: 10 }, // 50%
      { ...base, id: 'noTotal', correct: 100 },
      { ...base, id: 'noCorrect', total: 100 },
    ] as ExamHistory[];
    expect(weightedRatePercent(histories)).toBe(50);
  });

  it('__proto__ 챕터명은 Object.prototype을 오염시키지 않는다(null-proto 방어)', () => {
    const evil = JSON.parse('{"__proto__": {"c": 1, "t": 1}}');
    const agg = aggregateChapterStats([
      { id: 'x', setId: 'S', mode: 'exam', answers: {}, chapterStats: evil } as ExamHistory,
    ]);
    // 자신의 키로는 집계되고, 전역 프로토타입은 오염되지 않는다.
    expect(({} as Record<string, unknown>).c).toBeUndefined();
    expect(({} as Record<string, unknown>).t).toBeUndefined();
    expect(Object.keys(agg)).toContain('__proto__');
  });
});

describe('속성 — chapterStats (챕터 집계·가중 평균)', () => {
  it('가중 평균은 항상 0~100이고 회차별 정답률의 최소·최대 사이에 있다', () => {
    fc.assert(
      fc.property(fc.array(historyArb, { minLength: 1, maxLength: 10 }), (hs) => {
        const avg = weightedRatePercent(hs);
        if (avg === null) return false; // total>0 이력만 생성하므로 null 불가
        const rates = hs.map((h) => (h.correct! / h.total!) * 100);
        return avg >= 0 && avg <= 100 &&
          avg >= Math.floor(Math.min(...rates)) - 1 && avg <= Math.max(...rates) + 1;
      }),
    );
  });

  it('합산 집계의 c/t 총합은 개별 이력의 총합과 같다(보존 법칙)', () => {
    const cellArb = fc.record({ t: fc.integer({ min: 1, max: 40 }) }).chain(({ t }) =>
      fc.record({ t: fc.constant(t), c: fc.integer({ min: 0, max: t }) }),
    );
    const chapterStatsArb = fc.dictionary(fc.constantFrom('1장', '2장', '3장'), cellArb, { maxKeys: 3 });
    fc.assert(
      fc.property(fc.array(chapterStatsArb, { maxLength: 8 }), (statsList) => {
        const histories = statsList.map((cs, i) => ({
          id: `h${i}`, setId: 'S', mode: 'exam', answers: {}, chapterStats: cs,
        })) as ExamHistory[];
        const agg = aggregateChapterStats(histories);
        const sum = (sel: 'c' | 't') =>
          statsList.reduce((s, cs) => s + Object.values(cs).reduce((x, cell) => x + cell[sel], 0), 0);
        const aggSum = (sel: 'c' | 't') =>
          Object.values(agg).reduce((s, cell) => s + cell[sel], 0);
        return aggSum('c') === sum('c') && aggSum('t') === sum('t');
      }),
    );
  });
});
