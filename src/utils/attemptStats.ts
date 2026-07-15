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
  // 같은 세트 안에서 "같은 모드"의 직전 회차 대비 정답률 변화(%p).
  // 시험(전 문항)과 랜덤(40문항 추첨)은 표본이 달라 교차 비교가 왜곡되므로
  // 다른 모드 회차는 건너뛴다. 같은 모드의 첫 회차는 null.
  deltaFromPrev: number | null;
}

export interface SetTimeline {
  setId: string;
  title: string;
  attempts: AttemptEntry[]; // 오래된 → 최신
  best: number; // 최고 정답률(%)
  first: number; // 첫 회차 정답률(%)
  latest: number; // 최신 회차 정답률(%)
  // 성장폭(%p) — 최신 회차와 "같은 모드"의 첫 회차 대비. 같은 모드 회차가 1개뿐이면
  // 비교 대상이 없어 null(모드 혼합 세트에서 시험↔랜덤 간 %p 비교 왜곡 방지).
  improvement: number | null;
  lastAt: number; // 최신 회차 시각(정렬용)
}

// ▲/▼/± 델타 라벨 — 결과 모달(직전 대비)과 통계 타임라인(성장폭)이 공유해
// 표기 규칙이 화면마다 어긋나지 않게 한다.
export function formatDeltaPp(delta: number): { label: string; dir: 'up' | 'down' | 'same' } {
  if (delta > 0) return { label: `▲ +${delta}%p`, dir: 'up' };
  if (delta < 0) return { label: `▼ ${delta}%p`, dir: 'down' };
  return { label: '± 0%p', dir: 'same' };
}

function isScored(h: ExamHistory): h is ExamHistory & { correct: number; total: number } {
  return typeof h.total === 'number' && h.total > 0 && typeof h.correct === 'number';
}

// 이력 한 건의 표시용 정답률(%). CSTS는 채점 시점 가중 점수(cstsWeighted)가 있으면
// 그 값을 우선한다 — 결과 모달의 "직전 회차 대비"가 합격 판정과 같은 기준(가중 점수)으로
// 비교되게 한다. 과거(수정 전) 이력처럼 가중 점수가 없으면 단순 정답률로 근사한다.
function scoredRate(h: ExamHistory): number {
  if (h.cstsWeighted && h.cstsWeighted.maxScore > 0) {
    return Math.floor((h.cstsWeighted.score / h.cstsWeighted.maxScore) * 100 + 1e-9);
  }
  return displayRatePercent(h.correct ?? 0, h.total ?? 0);
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
    // 챕터 미니 시험 회차는 세트 전체 회차가 아니다 — 타임라인·성장폭에 섞이면
    // 10문항 표본이 40~70문항 회차와 %p 비교돼 왜곡된다(챕터 통계에는 별도로 반영됨).
    if (h.chapter) continue;
    const list = bySet.get(h.setId) ?? [];
    list.push(h);
    bySet.set(h.setId, list);
  }

  const timelines: SetTimeline[] = [];
  for (const [setId, hs] of bySet) {
    // 오래된 → 최신. createdAt 동률/결측 시 id로 타이브레이크해 회차 번호를 결정적으로 만든다.
    hs.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id));
    // 직전 대비는 같은 모드끼리만 비교(시험 70 vs 랜덤 40 표본 차이로 인한 %p 왜곡 방지).
    const prevRateByMode: Record<string, number> = Object.create(null);
    const firstRateByMode: Record<string, number> = Object.create(null);
    const attempts: AttemptEntry[] = hs.map((h, i) => {
      const rate = displayRatePercent(h.correct, h.total);
      const prev = prevRateByMode[h.mode];
      const entry: AttemptEntry = {
        id: h.id,
        round: i + 1,
        mode: h.mode,
        correct: h.correct,
        total: h.total,
        rate,
        elapsedSeconds: h.elapsedSeconds,
        createdAt: h.createdAt ?? 0,
        deltaFromPrev: prev === undefined ? null : rate - prev,
      };
      prevRateByMode[h.mode] = rate;
      if (firstRateByMode[h.mode] === undefined) firstRateByMode[h.mode] = rate;
      return entry;
    });
    const rates = attempts.map((a) => a.rate);
    const latestAttempt = attempts[attempts.length - 1];
    const firstSameMode = firstRateByMode[latestAttempt.mode];
    timelines.push({
      setId,
      title: titleOf(setId),
      attempts,
      best: Math.max(...rates),
      first: rates[0],
      latest: rates[rates.length - 1],
      // 같은 모드 회차가 2개 이상일 때만 성장폭을 말할 수 있다.
      improvement: attempts.filter((a) => a.mode === latestAttempt.mode).length >= 2
        ? latestAttempt.rate - firstSameMode
        : null,
      lastAt: latestAttempt.createdAt,
    });
  }
  // 가장 최근에 응시한 세트를 위로. 동시각(같은 ms) 동률은 setId로 타이브레이크 —
  // 없으면 정렬이 입력 순서에 좌우돼 통계 화면의 세트 순서가 렌더마다 흔들릴 수 있다
  // (속성 테스트 '정렬 결정성'이 실제로 찾아낸 반례).
  return timelines.sort((a, b) => b.lastAt - a.lastAt || a.setId.localeCompare(b.setId));
}

export interface AttemptComparison {
  round: number; // 같은 세트·모드 기준 이번이 몇 회차인지
  previousRate: number | null; // 직전 회차 정답률(%), 없으면 null(첫 응시)
}

// 결과 모달의 "직전 회차 대비" 비교용 — 같은 세트·모드의 최신 회차를 이번 회차로 보고
// 그 직전 회차 정답률을 돌려준다. 채점 직후 histories에 현재 회차가 이미 포함돼 있다는 전제.
// chapter: 챕터 미니 시험이면 같은 챕터 미니 회차끼리만 비교(null이면 일반 회차끼리만) —
// 10문항 미니와 세트 전체 회차가 서로의 "직전"으로 잡히는 표본 왜곡 방지.
export function latestAttemptComparison(
  histories: ExamHistory[],
  setId: string,
  mode: string,
  chapter: string | null = null,
): AttemptComparison {
  const same = histories
    .filter((h) => h.setId === setId && h.mode === mode && (h.chapter ?? null) === chapter && isScored(h))
    // 타임라인과 동일한 결정적 정렬(createdAt → id) — 동률 시 "직전 회차"가 흔들리지 않게.
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id));
  if (!same.length) return { round: 0, previousRate: null };
  const prev = same.length >= 2 ? same[same.length - 2] : null;
  return {
    round: same.length,
    previousRate: prev ? scoredRate(prev) : null,
  };
}

// 오답 '극복' 판정 — 같은 세트의 최근 시험 2회에서 연속으로 맞힌 문항 번호를 돌려준다.
// 시험 모드만 근거로 쓴다: 시험은 전 문항을 포함하므로 "wrongItems에 없음 = 맞힘"이
// 성립하지만, 랜덤/미니는 추첨에 그 문항이 포함됐는지 이력만으로 알 수 없다(보수적 제외).
// wrongItems가 없는 과거(legacy) 회차는 근거 불충분으로 제외한다.
export function overcomeNumbers(
  histories: ExamHistory[],
  setId: string,
  numbers: number[],
): Set<number> {
  const recentExams = histories
    .filter((h) => h.setId === setId && h.mode === 'exam' && !h.chapter && Array.isArray(h.wrongItems))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || b.id.localeCompare(a.id))
    .slice(0, 2);
  const out = new Set<number>();
  if (recentExams.length < 2) return out; // 연속 2회를 말할 수 없으면 극복 없음
  for (const n of numbers) {
    if (recentExams.every((h) => !h.wrongItems!.some((w) => w.number === n))) out.add(n);
  }
  return out;
}
