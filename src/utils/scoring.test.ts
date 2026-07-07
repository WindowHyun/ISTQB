import { describe, it, expect } from 'vitest';
import { evaluatePass } from './scoring';

describe('evaluatePass', () => {
  it('ISTQB: 40문항 중 26개 정답이면 합격(65%)', () => {
    expect(evaluatePass('istqb', 26, 40).passed).toBe(true);
    expect(evaluatePass('istqb', 25, 40).passed).toBe(false);
  });

  it('ISTQB: 문항 수가 달라도 65% 기준으로 판정한다', () => {
    expect(evaluatePass('istqb', 17, 26).passed).toBe(true); // 65.4%
    expect(evaluatePass('istqb', 16, 26).passed).toBe(false); // 61.5%
  });

  it('CSTS: 정답률 75% 이상이면 합격(환산 52.5점)', () => {
    const pass = evaluatePass('csts', 60, 80); // 75%
    expect(pass.passed).toBe(true);
    expect(pass.scoreLabel).toContain('환산 52.5점');
    expect(evaluatePass('csts', 59, 80).passed).toBe(false); // 73.75%
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
