import { describe, expect, it } from 'vitest';
import { formatClock, formatRoundDate } from './time';

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

// 회차 응시 시각 — 통계의 회차 이력·짧은 세션이 공유. 날짜·시각은 로컬 시간대로 찍으므로 기대값도 로컬 시각으로 만든다.
describe('formatRoundDate', () => {
  const now = new Date(2025, 9, 28, 18, 0);

  it('오늘 회차는 시각만 찍는다 — 하루에 여러 번 응시해도 방금 친 회차를 가린다', () => {
    expect(formatRoundDate(new Date(2025, 9, 28, 9, 5).getTime(), now)).toBe('오늘 09:05');
  });

  it('이전 회차는 날짜와 시각을 찍는다 — 로케일은 ko-KR 고정', () => {
    expect(formatRoundDate(new Date(2025, 9, 21, 23, 30).getTime(), now)).toBe('10월 21일 23:30');
    // 같은 날짜라도 해가 다르면 오늘이 아니다.
    expect(formatRoundDate(new Date(2024, 9, 28, 9, 5).getTime(), now)).toBe('10월 28일 09:05');
  });

  // 옛·가져온 이력은 createdAt이 없고(0으로 접힌다), 호출부는 빈 문자열이면 날짜 칸을 그리지 않는다.
  it('시각이 없으면 빈 문자열이다', () => {
    for (const ms of [undefined, 0, -1, NaN]) {
      expect(formatRoundDate(ms, now), String(ms)).toBe('');
    }
  });

  // 저장소는 createdAt이 '유한한 수'인지만 본다(sanitizeHistory) — 가져온 백업의 1e20은 그대로 들어온다.
  // Date는 ±8.64e15ms 밖을 Invalid Date로 만들고 Intl.DateTimeFormat#format은 그것에 RangeError를 던진다.
  it('Date가 읽지 못하는 값에도 던지지 않고 빈 문자열이다', () => {
    for (const ms of [1e20, Infinity, 8.64e15 + 1]) {
      expect(() => formatRoundDate(ms, now), String(ms)).not.toThrow();
      expect(formatRoundDate(ms, now), String(ms)).toBe('');
    }
  });
});
