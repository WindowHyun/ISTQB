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
});
