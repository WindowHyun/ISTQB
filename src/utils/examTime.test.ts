import { describe, it, expect } from 'vitest';
import { examLimitSeconds, examLimitLabel, remainingSeconds, EXAM_WARN_THRESHOLDS_SEC } from './examTime';

// 시험 제한시간 — ISTQB 60분 / CSTS 90분. 시험(exam) 모드에서만 적용된다.
describe('examLimitSeconds', () => {
  it('자격증별 제한시간을 초로 돌려준다', () => {
    expect(examLimitSeconds('istqb')).toBe(60 * 60);
    expect(examLimitSeconds('csts')).toBe(90 * 60);
  });
  it('제품이 없거나 미등록이면 null(제한 없음)', () => {
    expect(examLimitSeconds(null)).toBeNull();
    expect(examLimitSeconds(undefined)).toBeNull();
    expect(examLimitSeconds('unknown')).toBeNull();
  });
});

describe('examLimitLabel', () => {
  it('안내용 분 단위 라벨', () => {
    expect(examLimitLabel('istqb')).toBe('60분');
    expect(examLimitLabel('csts')).toBe('90분');
    expect(examLimitLabel(null)).toBeNull();
  });
});

describe('remainingSeconds', () => {
  it('남은 시간을 계산하고 초과분은 0으로 클램프한다', () => {
    expect(remainingSeconds(3600, 0)).toBe(3600);
    expect(remainingSeconds(3600, 600)).toBe(3000);
    expect(remainingSeconds(3600, 3600)).toBe(0);
    expect(remainingSeconds(3600, 4000)).toBe(0); // 초과해도 음수로 내려가지 않는다
  });
  it('소수 경과는 올림해 남은 시간이 조기에 0이 되지 않게 한다', () => {
    // 3599.4초 경과 → 남은 0.6초는 1초로 표시(0이 되면 즉시 자동 제출된다)
    expect(remainingSeconds(3600, 3599.4)).toBe(1);
  });
});

describe('EXAM_WARN_THRESHOLDS_SEC', () => {
  it('5분·1분 시점에 경고한다(큰 값 → 작은 값 순)', () => {
    expect(EXAM_WARN_THRESHOLDS_SEC).toEqual([300, 60]);
  });
});
