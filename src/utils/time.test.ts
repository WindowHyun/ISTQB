import { describe, expect, it } from 'vitest';
import { formatClock } from './time';

// 타이머 표시(1시간 미만 mm:ss / 이상 h:mm:ss) — 사이드바·모바일 상단바·결과 요약이 공유.
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

  // 1시간 이상은 h:mm:ss로 표기한다 — mm:ss 고정이면 90분이 "90:00"이라 "90초"로 오독된다.
  it('1시간 이상은 h:mm:ss로 표기한다', () => {
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(5400)).toBe('1:30:00'); // CSTS 제한시간 90분
    expect(formatClock(36000)).toBe('10:00:00');
  });

  it('1시간 미만은 종전대로 mm:ss를 유지한다(경계값)', () => {
    expect(formatClock(3599)).toBe('59:59');
  });
});
