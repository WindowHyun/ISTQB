import { describe, it, expect } from 'vitest';
import { evaluatePass, computeCstsWeightedScore } from './scoring';
import type { Question } from '../hooks/useQuestions';

// CSTS 검정방법 배점(4지선다·서답형 1.5점 / 진위형 1.0점) 반영용 최소 문항 픽스처.
function cstsQuestion(number: number, type: string, answer: string[] = ['a']): Question {
  return { number, type, stem: '', options: [{ key: 'a', text: '' }], answer };
}
const answerKeyOf = (q: Question) => String(q.number);

describe('evaluatePass', () => {
  it('ISTQB: 40문항 중 26개 정답이면 합격(65%)', () => {
    expect(evaluatePass('istqb', 26, 40).passed).toBe(true);
    expect(evaluatePass('istqb', 25, 40).passed).toBe(false);
  });

  it('ISTQB: 문항 수가 달라도 65% 기준으로 판정한다', () => {
    expect(evaluatePass('istqb', 17, 26).passed).toBe(true); // 65.4%
    expect(evaluatePass('istqb', 16, 26).passed).toBe(false); // 61.5%
  });

  it('CSTS: 70문항(4지선다50·진위10·서답10) 전부 정답이면 만점 100점 합격', () => {
    const questions = [
      ...Array.from({ length: 50 }, (_, i) => cstsQuestion(i + 1, 'multiple_choice')),
      ...Array.from({ length: 10 }, (_, i) => cstsQuestion(51 + i, 'true_false')),
      ...Array.from({ length: 10 }, (_, i) => cstsQuestion(61 + i, 'short_answer')),
    ];
    const answers = Object.fromEntries(questions.map((q) => [answerKeyOf(q), ['a']]));
    const weighted = computeCstsWeightedScore(questions, answers, answerKeyOf);
    expect(weighted).toEqual({ score: 100, maxScore: 100 }); // 50*1.5 + 10*1.0 + 10*1.5
    const pass = evaluatePass('csts', 70, 70, weighted);
    expect(pass.passed).toBe(true);
    expect(pass.scoreLabel).toBe('100 / 100점 (100%)');
  });

  it('CSTS: 정답 문항 수가 같아도(75.7%) 배점이 낮은 진위형에 몰리면 가중 점수는 불합격일 수 있다', () => {
    // 앞서 발견된 실제 판정 불일치 사례 재현 — 진위형(1.0점) 10문항 전부 정답 +
    // 나머지(4지선다·서답형, 1.5점) 60문항 중 43문항 정답 = 53/70(75.7%)이지만
    // 가중 점수는 10*1.0 + 43*1.5 = 74.5/100 < 75 → 실제 검정은 불합격이다.
    const mc = Array.from({ length: 50 }, (_, i) => cstsQuestion(i + 1, 'multiple_choice'));
    const tf = Array.from({ length: 10 }, (_, i) => cstsQuestion(51 + i, 'true_false'));
    const sa = Array.from({ length: 10 }, (_, i) => cstsQuestion(61 + i, 'short_answer'));
    const questions = [...mc, ...sa, ...tf]; // 배점 비중이 높은 60문항 중 43문항만 정답
    const answers: Record<string, string[]> = {};
    [...mc, ...sa].slice(0, 43).forEach((q) => { answers[answerKeyOf(q)] = ['a']; }); // mc+sa 43개 정답
    tf.forEach((q) => { answers[answerKeyOf(q)] = ['a']; }); // 진위형 10개 전부 정답

    const weighted = computeCstsWeightedScore(questions, answers, answerKeyOf);
    expect(weighted).toEqual({ score: 74.5, maxScore: 100 });
    const correctCount = 53; // 43 + 10
    const naiveRate = evaluatePass('csts', correctCount, 70); // 문항 유형 정보 없이 판정하면 안 됨
    expect(naiveRate.passed).toBe(false); // 폴백은 보수적으로 미달 처리(정답률만으로 합격을 단정하지 않음)
    const pass = evaluatePass('csts', correctCount, 70, weighted);
    expect(pass.passed).toBe(false); // 가중 점수 74.5점 < 75점 → 실제로도 불합격
    expect(pass.scoreLabel).toBe('74.5 / 100점 (74%)');
  });

  it('CSTS: 세트 문항 구성이 달라도(진위8·서답12) 가중 점수 75% 기준으로 일관되게 판정한다', () => {
    const mc = Array.from({ length: 50 }, (_, i) => cstsQuestion(i + 1, 'multiple_choice'));
    const tf = Array.from({ length: 8 }, (_, i) => cstsQuestion(51 + i, 'true_false'));
    const sa = Array.from({ length: 12 }, (_, i) => cstsQuestion(59 + i, 'short_answer'));
    const questions = [...mc, ...tf, ...sa];
    const maxScore = 50 * 1.5 + 8 * 1.0 + 12 * 1.5; // 75 + 8 + 18 = 101
    const answers = Object.fromEntries(questions.map((q) => [answerKeyOf(q), ['a']]));
    const weighted = computeCstsWeightedScore(questions, answers, answerKeyOf);
    expect(weighted).toEqual({ score: maxScore, maxScore });
    expect(evaluatePass('csts', 70, 70, weighted).passed).toBe(true);
  });

  it('CSTS: 문항 유형 정보(cstsWeighted) 없이는 정답률만으로 합격을 단정하지 않는다', () => {
    // 구버전 이력처럼 가중 점수 스냅샷이 없는 경우 — "환산" 같은 근거 없는 숫자를 지어내지 않는다.
    const r = evaluatePass('csts', 60, 80); // 단순 정답률 75%
    expect(r.passed).toBe(false);
    expect(r.scoreLabel).not.toContain('환산');
    expect(r.criterionLabel).not.toContain('환산');
  });

  it('미응시(total 0)는 불합격이며 0%', () => {
    const r = evaluatePass('istqb', 0, 0);
    expect(r.passed).toBe(false);
    expect(r.ratePercent).toBe(0);
  });

  it('표시 퍼센트는 내림이라 판정과 모순되지 않는다(64.x%가 "65%·불합격"으로 뜨지 않음)', () => {
    const r = evaluatePass('istqb', 97, 150); // 64.67% — 반올림이면 65%로 표기돼 판정(불합격)과 모순
    expect(r.passed).toBe(false);
    expect(r.ratePercent).toBe(64);
    const exact = evaluatePass('istqb', 13, 20); // 정확히 65% — 부동소수 오차에도 65로 표기
    expect(exact.passed).toBe(true);
    expect(exact.ratePercent).toBe(65);
  });

  it('ISTQB 합격 기준 라벨은 세트 문항수에 맞춰 표기된다(#P5-3)', () => {
    // 40문항 세트: 기존과 동일하게 26/40.
    expect(evaluatePass('istqb', 26, 40).criterionLabel).toBe('26 / 40문항(65%) 이상 정답');
    // EXTRA(26문항) 세트: 40 고정이 아니라 17/26로 표기.
    expect(evaluatePass('istqb', 17, 26).criterionLabel).toBe('17 / 26문항(65%) 이상 정답');
    // 70문항 세트: 46/70.
    expect(evaluatePass('istqb', 46, 70).criterionLabel).toBe('46 / 70문항(65%) 이상 정답');
  });
});

// 배점표는 문항 유형에 붙는데, 유형은 데이터에서 온다 — 없거나 처음 보는 값일 수 있다.
// 이때 0점으로 떨어지면 만점(maxScore)이 함께 줄어 합격선이 조용히 낮아진다.
describe('computeCstsWeightedScore — 유형 폴백', () => {
  it('유형이 없거나 배점표에 없는 유형은 주 유형과 같은 1.5점으로 센다', () => {
    const noType = { number: 1, stem: '', options: [{ key: 'a', text: '' }], answer: ['a'] } as Question;
    const unknown = cstsQuestion(2, 'matching');
    const got = computeCstsWeightedScore([noType, unknown], { 1: ['a'], 2: ['b'] }, answerKeyOf);
    expect(got.maxScore).toBe(3); // 1.5 + 1.5 — 0점으로 떨어지지 않는다
    expect(got.score).toBe(1.5); // 맞힌 것은 1번뿐
  });
});
