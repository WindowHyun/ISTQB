import { describe, it, expect } from 'vitest';
import {
  examLimitSeconds, examLimitLabel, remainingSeconds,
  crossedWarnThreshold, EXAM_WARN_THRESHOLDS_SEC, EXAM_AWAY_NOTICE_SEC,
} from './examTime';

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

describe('crossedWarnThreshold', () => {
  it('임계값을 지나는 순간에만 그 값을 돌려준다', () => {
    expect(crossedWarnThreshold(301, 300)).toBe(300);
    expect(crossedWarnThreshold(61, 60)).toBe(60);
  });
  it('임계값을 지나지 않으면 null', () => {
    expect(crossedWarnThreshold(600, 599)).toBeNull(); // 아직 5분 위
    expect(crossedWarnThreshold(299, 298)).toBeNull(); // 이미 지난 뒤 — 재발화 금지
    expect(crossedWarnThreshold(59, 58)).toBeNull();
  });
  it('여러 임계값을 한 번에 지나면 가장 작은(=실제에 맞는) 값을 고른다', () => {
    // 백그라운드에 오래 머물다 복귀한 경우: 20분 남았다가 30초 남음.
    // "5분 남았습니다"가 아니라 "1분 남았습니다"가 맞다.
    expect(crossedWarnThreshold(1200, 30)).toBe(60);
  });
  it('시간이 늘어나는 경우(재응시 초기화)에는 울리지 않는다', () => {
    expect(crossedWarnThreshold(30, 3600)).toBeNull();
  });
});

describe('EXAM_AWAY_NOTICE_SEC', () => {
  it('짧은 앱 전환까지 안내하지 않도록 하한을 둔다', () => {
    expect(EXAM_AWAY_NOTICE_SEC).toBeGreaterThan(0);
  });
});
