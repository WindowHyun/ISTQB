import { describe, expect, it } from 'vitest';
import { formatClock } from './time';

// 타이머 표시(mm:ss) — 사이드바·모바일 상단바·결과 요약이 공유.
describe('formatClock', () => {
  it('0초는 00:00', () => {
    expect(formatClock(0)).toBe('00:00');
  });

  it('초 단위 패딩과 분 환산', () => {
    expect(formatClock(5)).toBe('00:05');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(600)).toBe('10:00');
  });

  it('소수 초는 내림, 음수는 0으로 클램프', () => {
    expect(formatClock(59.9)).toBe('00:59');
    expect(formatClock(-3)).toBe('00:00');
  });

  it('60분 이상도 분 단위로 누적 표기', () => {
    expect(formatClock(3600)).toBe('60:00');
    expect(formatClock(3725)).toBe('62:05');
  });
});
