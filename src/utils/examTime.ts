// 시험 모드 제한시간 — 자격증별 실제 시험 시간에 맞춘 값(분).
// 시험(exam) 모드에만 적용한다: 연습·오답은 학습용이고, 랜덤은 추첨 규모가 세트마다
// 달라 고정 제한시간을 적용할 근거가 없다.
const EXAM_TIME_LIMIT_MIN: Record<string, number> = {
  istqb: 60,
  csts: 90,
};

// 남은 시간 경고 시점(초) — 이 값을 아래로 '내려가는 순간' 1회 안내한다. 내림차순.
export const EXAM_WARN_THRESHOLDS_SEC = [300, 60];

// 다른 앱을 보다 돌아왔을 때, 자리를 비운 시간이 이보다 길면 안내한다.
// 짧은 전환(알림 확인 등)까지 알리면 잔소리가 되므로 하한을 둔다.
export const EXAM_AWAY_NOTICE_SEC = 30;

/**
 * prev→remaining으로 내려오면서 지나친 경고 임계값 중 '가장 작은' 값.
 * 없으면 null. 초 단위로 흐를 땐 하나만 지나지만, 백그라운드에 오래 머문 뒤
 * 복귀하면 여러 임계값을 한 번에 지나므로 실제 남은 시간에 맞는 안내를 골라야 한다
 * (30초 남았는데 "5분 남았습니다"가 뜨면 안 된다).
 */
export function crossedWarnThreshold(prev: number, remaining: number): number | null {
  let hit: number | null = null;
  for (const t of EXAM_WARN_THRESHOLDS_SEC) {
    if (prev > t && remaining <= t) hit = t; // 내림차순이라 마지막 매치가 가장 작다
  }
  return hit;
}

/** 해당 제품의 시험 제한시간(초). 설정이 없으면 null(제한 없음 = 종전 카운트업). */
export function examLimitSeconds(product: string | null | undefined): number | null {
  if (!product) return null;
  const min = EXAM_TIME_LIMIT_MIN[product];
  return typeof min === 'number' ? min * 60 : null;
}

/** 남은 시간(초). 음수는 0으로 클램프한다. */
export function remainingSeconds(limitSec: number, elapsedSeconds: number): number {
  return Math.max(0, Math.ceil(limitSec - elapsedSeconds));
}

/** 제한시간 표기용 라벨(예: "60분"). 시작 게이트 안내에 쓴다. */
export function examLimitLabel(product: string | null | undefined): string | null {
  const sec = examLimitSeconds(product);
  return sec == null ? null : `${Math.round(sec / 60)}분`;
}
