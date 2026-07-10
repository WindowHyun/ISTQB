import type { ExamHistory } from '../store/useQuizStore';
import { displayRatePercent } from './scoring';

// Phase 2 학습 누적 — 세트별 "회차 타임라인"과 결과 모달의 "직전 회차 대비" 계산 계층.
// 점수(total)가 있는 회차만 대상으로 하며, 정답률(%)은 화면 간 일치를 위해
// displayRatePercent(내림)을 공유한다.

export interface AttemptEntry {
  id: string;
  round: number; // 1-based 회차(오래된 회차 = 1)
  mode: string;
  correct: number;
  total: number;
  rate: number; // displayRatePercent(내림)
  elapsedSeconds?: number;
  createdAt: number;
  // 같은 세트의 직전 회차 대비 정답률 변화(%p). 1회차는 null.
  deltaFromPrev: number | null;
}

export interface SetTimeline {
  setId: string;
  title: string;
  attempts: AttemptEntry[]; // 오래된 → 최신
  best: number; // 최고 정답률(%)
  first: number; // 첫 회차 정답률(%)
  latest: number; // 최신 회차 정답률(%)
  improvement: number; // 최신 - 첫(성장폭, %p)
  lastAt: number; // 최신 회차 시각(정렬용)
}

function isScored(h: ExamHistory): h is ExamHistory & { correct: number; total: number } {
  return typeof h.total === 'number' && h.total > 0 && typeof h.correct === 'number';
}

// 채점 이력을 세트별로 묶어 회차 타임라인을 만든다.
// 각 세트 안에서 시간순으로 회차 번호를 매기고 직전 회차 대비 변화를 계산한다.
export function buildSetTimelines(
  histories: ExamHistory[],
  titleOf: (setId: string) => string,
): SetTimeline[] {
  const bySet = new Map<string, (ExamHistory & { correct: number; total: number })[]>();
  for (const h of histories) {
    if (!isScored(h)) continue;
    const list = bySet.get(h.setId) ?? [];
    list.push(h);
    bySet.set(h.setId, list);
  }

  const timelines: SetTimeline[] = [];
  for (const [setId, hs] of bySet) {
    // 오래된 → 최신. createdAt 동률/결측 시 id로 타이브레이크해 회차 번호를 결정적으로 만든다.
    hs.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id));
    let prevRate: number | null = null;
    const attempts: AttemptEntry[] = hs.map((h, i) => {
      const rate = displayRatePercent(h.correct, h.total);
      const entry: AttemptEntry = {
        id: h.id,
        round: i + 1,
        mode: h.mode,
        correct: h.correct,
        total: h.total,
        rate,
        elapsedSeconds: h.elapsedSeconds,
        createdAt: h.createdAt ?? 0,
        deltaFromPrev: prevRate === null ? null : rate - prevRate,
      };
      prevRate = rate;
      return entry;
    });
    const rates = attempts.map((a) => a.rate);
    timelines.push({
      setId,
      title: titleOf(setId),
      attempts,
      best: Math.max(...rates),
      first: rates[0],
      latest: rates[rates.length - 1],
      improvement: rates[rates.length - 1] - rates[0],
      lastAt: attempts[attempts.length - 1].createdAt,
    });
  }
  // 가장 최근에 응시한 세트를 위로.
  return timelines.sort((a, b) => b.lastAt - a.lastAt);
}

export interface AttemptComparison {
  round: number; // 같은 세트·모드 기준 이번이 몇 회차인지
  previousRate: number | null; // 직전 회차 정답률(%), 없으면 null(첫 응시)
}

// 결과 모달의 "직전 회차 대비" 비교용 — 같은 세트·모드의 최신 회차를 이번 회차로 보고
// 그 직전 회차 정답률을 돌려준다. 채점 직후 histories에 현재 회차가 이미 포함돼 있다는 전제.
export function latestAttemptComparison(
  histories: ExamHistory[],
  setId: string,
  mode: string,
): AttemptComparison {
  const same = histories
    .filter((h) => h.setId === setId && h.mode === mode && isScored(h))
    // 타임라인과 동일한 결정적 정렬(createdAt → id) — 동률 시 "직전 회차"가 흔들리지 않게.
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id));
  if (!same.length) return { round: 0, previousRate: null };
  const prev = same.length >= 2 ? same[same.length - 2] : null;
  return {
    round: same.length,
    previousRate: prev ? displayRatePercent(prev.correct as number, prev.total as number) : null,
  };
}
