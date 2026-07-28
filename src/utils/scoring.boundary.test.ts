import { describe, it, expect } from 'vitest';
import { evaluatePass, displayRatePercent, computeCstsWeightedScore } from './scoring';
import { remainingSeconds, crossedWarnThreshold, EXAM_WARN_THRESHOLDS_SEC } from './examTime';
import type { Question } from '../hooks/useQuestions';

// 경계값 분석 — 합격/불합격이 갈리는 '바로 그 지점' 양옆을 찍는다.
// 정상 경로 테스트는 65%·75%에서 한참 떨어진 값만 다루므로, 부등호 방향이나
// 반올림이 하나 틀려도 통과한다. 여기서만 드러나는 결함을 노린다.

describe('경계값: ISTQB 합격 컷(65%)', () => {
  // 40문항 × 65% = 26문항. 25(62.5%)는 불합격, 26(65%)은 합격이어야 한다.
  it.each([
    [25, 40, false, 62],
    [26, 40, true, 65],
    [27, 40, true, 67],
  ])('%i/%i → 합격=%s, 표기 %i%%', (correct, total, passed, pct) => {
    const r = evaluatePass('istqb', correct, total);
    expect(r.passed).toBe(passed);
    expect(r.ratePercent).toBe(pct);
  });

  // 26문항 세트(EXTRA): 26 × 0.65 = 16.9 → 17문항 필요.
  it('문항 수가 40이 아닌 세트도 그 세트 기준으로 컷을 잡는다', () => {
    expect(evaluatePass('istqb', 16, 26).passed).toBe(false);
    expect(evaluatePass('istqb', 17, 26).passed).toBe(true);
    expect(evaluatePass('istqb', 17, 26).criterionLabel).toContain('17 / 26문항');
  });

  // 표기와 판정이 어긋나면 "65%인데 불합격"이라는 모순이 화면에 뜬다.
  it('표기 퍼센트가 65%면 반드시 합격이다(내림 표기와 판정의 일관성)', () => {
    for (let total = 1; total <= 80; total++) {
      for (let correct = 0; correct <= total; correct++) {
        const r = evaluatePass('istqb', correct, total);
        if (r.ratePercent >= 65) expect(r.passed).toBe(true);
        if (r.ratePercent < 65) expect(r.passed).toBe(false);
      }
    }
  });
});

describe('경계값: 표기 퍼센트 내림', () => {
  it('64.9%는 65%로 올라가지 않는다', () => {
    expect(displayRatePercent(25, 40)).toBe(62); // 62.5
    expect(displayRatePercent(259, 400)).toBe(64); // 64.75 — 반올림이면 65
  });
  it('나눗셈 부동소수 오차로 정확히 경계인 값이 깎이지 않는다', () => {
    expect(displayRatePercent(26, 40)).toBe(65);
    expect(displayRatePercent(1, 3)).toBe(33);
    expect(displayRatePercent(2, 3)).toBe(66);
    expect(displayRatePercent(7, 7)).toBe(100);
  });
  it('총계 0에서 나눗셈이 터지지 않는다', () => {
    expect(displayRatePercent(0, 0)).toBe(0);
  });
});

const q = (type: string, answer: string[]): Question =>
  ({ id: `${type}-${answer.join()}`, number: 1, type, answer, options: [] }) as unknown as Question;

describe('경계값: CSTS 가중 합격 컷(75%)', () => {
  const keyOf = (x: Question) => x.id!;

  it('만점의 정확히 75%면 합격이다(부동소수 오차로 깎이지 않는다)', () => {
    // 4지선다 3문항(4.5점)의 75% = 3.375. 실수로 3.375를 만들 조합이 없으므로
    // 진위형을 섞어 정확히 경계를 만든다: 1.5+1.5+1.0 = 4.0, 75% = 3.0 = 1.5+1.5.
    const qs = [q('multiple_choice', ['a']), q('multiple_choice', ['a']), q('true_false', ['o'])];
    const answers: Record<string, string[]> = { [qs[0].id!]: ['a'], [qs[1].id!]: ['a'] };
    const w = computeCstsWeightedScore(qs, answers, keyOf);
    expect(w).toEqual({ score: 3, maxScore: 4 });
    expect(evaluatePass('csts', 2, 3, w).passed).toBe(true); // 정확히 75%
  });

  it('75%에 0.1점 모자라면 불합격이다', () => {
    const w = { score: 74.9, maxScore: 100 };
    expect(evaluatePass('csts', 0, 0, w).passed).toBe(false);
    expect(evaluatePass('csts', 0, 0, { score: 75, maxScore: 100 }).passed).toBe(true);
  });

  it('가중 점수 0/만점 0(문항 없음)에서는 판정을 내리지 않는다', () => {
    const r = evaluatePass('csts', 0, 0, { score: 0, maxScore: 0 });
    expect(r.passed).toBe(false);
    expect(r.criterionLabel).toContain('불러오지 못해');
  });

  it('정답률과 가중 점수가 어긋나는 조합에서도 가중 점수로 판정한다', () => {
    // 진위형(1.0점)만 다 맞고 4지선다(1.5점)를 다 틀리면 문항 정답률은 50%인데
    // 가중 점수는 40%다 — 단순 정답률로 판정하면 결과가 달라진다.
    const qs = [
      q('true_false', ['o']), q('true_false', ['o']),
      q('multiple_choice', ['a']), q('multiple_choice', ['a']),
    ];
    const answers: Record<string, string[]> = { [qs[0].id!]: ['o'], [qs[1].id!]: ['o'] };
    const w = computeCstsWeightedScore(qs, answers, keyOf);
    expect(w).toEqual({ score: 2, maxScore: 5 });
    const r = evaluatePass('csts', 2, 4, w);
    expect(r.ratePercent).toBe(40); // 문항 정답률 50%가 아니라 가중 40%
    expect(r.passed).toBe(false);
  });

  it('만점이 100이 아닌 세트도 안내 문구가 그 세트 기준이다', () => {
    const r = evaluatePass('csts', 0, 0, { score: 29, maxScore: 29 });
    expect(r.passed).toBe(true);
    expect(r.criterionLabel).toContain('29점 만점 기준 21.8점');
    expect(r.criterionLabel).not.toContain('100점 만점');
  });

  it('필요 점수는 올림한다 — 안내대로 받았는데 불합격이면 안 된다', () => {
    // 만점 29 → 75% = 21.75. 안내가 21.7이면 21.7점으로는 실제 불합격이 된다.
    for (const maxScore of [29, 100, 4, 7.5, 13.5, 61]) {
      const r = evaluatePass('csts', 0, 0, { score: 0, maxScore });
      const required = Number(/기준 ([\d.]+)점/.exec(r.criterionLabel)![1]);
      expect(evaluatePass('csts', 0, 0, { score: required, maxScore }).passed).toBe(true);
    }
  });
});

describe('경계값: 시험 제한시간', () => {
  it.each([
    [3600, 0, 3600],
    [3600, 3599, 1],
    [3600, 3599.5, 1],   // 올림 — 0.5초 남았는데 "0"으로 보이면 끝난 줄 안다
    [3600, 3600, 0],
    [3600, 3600.1, 0],   // 음수는 0으로 클램프
    [3600, 99999, 0],
  ])('제한 %i초 / 경과 %s초 → 남은 %i초', (limit, elapsed, expected) => {
    expect(remainingSeconds(limit, elapsed)).toBe(expected);
  });

  it('경과가 음수여도 남은 시간이 제한시간을 넘지 않는다', () => {
    // 손상된 저장소·조작된 백업으로 음수 경과가 들어오면 남은 시간이 제한을 넘어
    // 사실상 무제한 시험이 된다. 실제로는 syncExamElapsed의 래칫이 앞단에서 막지만,
    // 그 방어는 다른 모듈에 있으므로 이 함수 자체의 계약으로도 성립해야 한다.
    expect(remainingSeconds(3600, -100)).toBe(3600);
    expect(remainingSeconds(3600, -86400)).toBe(3600);
  });
});

describe('경계값: 남은 시간 경고 임계', () => {
  it('임계값을 정확히 밟는 순간 1회 발화한다', () => {
    expect(crossedWarnThreshold(301, 300)).toBe(300);
    expect(crossedWarnThreshold(300, 299)).toBe(null); // 이미 지난 임계는 재발화 없음
    expect(crossedWarnThreshold(61, 60)).toBe(60);
  });

  it('여러 임계를 한 번에 지나면 가장 작은(=실제 남은 시간에 맞는) 값을 고른다', () => {
    // 백그라운드에 오래 있다 복귀 — 30초 남았는데 "5분 남았습니다"가 뜨면 안 된다.
    expect(crossedWarnThreshold(3600, 30)).toBe(60);
  });

  it('임계값 배열은 내림차순이어야 한다(가장 작은 값 선택 로직의 전제)', () => {
    const sorted = [...EXAM_WARN_THRESHOLDS_SEC].sort((a, b) => b - a);
    expect(EXAM_WARN_THRESHOLDS_SEC).toEqual(sorted);
  });
});
