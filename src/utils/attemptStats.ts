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

export interface ModeImprovement {
  mode: string;
  delta: number; // 그 모드의 첫 회차 → 최신 회차 정답률 변화(%p)
}

export interface SetTimeline {
  setId: string;
  title: string;
  attempts: AttemptEntry[]; // 오래된 → 최신
  best: number; // 최고 정답률(%)
  first: number; // 첫 회차 정답률(%)
  latest: number; // 최신 회차 정답률(%)
  // 모드별 성장폭(%p) — 그 모드의 첫 회차 → 최신 회차. 회차가 2개 이상인 모드만 담는다.
  // 종전에는 "최신 회차의 모드" 하나만 계산해, 시험 실력이 그대로여도 랜덤을 한 번 풀면
  // 시험 성장폭 배지가 사라졌다(최신 회차가 랜덤이 되어 비교 대상이 1개가 되므로).
  improvements: ModeImprovement[];
  lastAt: number; // 최신 회차 시각(정렬용)
}

/**
 * 세트 전체를 대상으로 한 '실전' 회차인지. 챕터 미니 시험(10문항)은 제외한다.
 * 요약·타임라인·성장폭이 각자 다른 규칙으로 회차를 세면 "응시 5회인데 이력은 3개"처럼
 * 화면 안에서 숫자가 어긋난다 — 어느 섹션이든 이 술어 하나를 쓴다.
 */
export function isSetLevelRound(h: ExamHistory): boolean {
  // 구버전 퀵 회차(전 세트에서 10~20문항을 뽑아 채점하던 시절)도 세트 전체 회차가 아니다.
  // 챕터 미니 시험을 제외한 것과 같은 이유로, 짧은 세션은 정답률이 쉽게 높게 나와
  // '최고 정답률'과 평균을 부풀린다. 지금의 퀵은 채점 자체가 없어 이력을 만들지 않지만,
  // 남아 있는 과거 회차가 이 조건에 걸린다 — 빼면 그 기록들이 실전 요약을 부풀린다.
  return !h.chapter && h.mode !== 'quick';
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

// 이력 한 건의 표시용 정답률(%) — 회차 %를 보여주는 모든 화면의 단일 원천.
// CSTS는 채점 시점 가중 점수(cstsWeighted)가 있으면 그 값을 쓴다: 합격 판정이 가중 점수
// 기준이므로, 결과 모달만 가중이고 통계(타임라인·목록·평균·추이)는 단순 정답률이면 같은
// 회차가 화면마다 다른 %로 보인다. 과거(가중 점수 없는) 이력은 단순 정답률로 근사한다.
export function attemptRatePercent(h: ExamHistory): number {
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
    // 10문항 표본이 40~70문항 회차와 %p 비교돼 왜곡된다.
    // (챕터 통계에 반영되고, 화면에는 buildMiniTestRounds가 따로 보여준다)
    if (!isSetLevelRound(h)) continue;
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
      const rate = attemptRatePercent(h);
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
    // 모드별 성장폭 — 회차가 2개 이상인 모드만. prevRateByMode는 순회가 끝난 시점에
    // 각 모드의 '최신' 정답률을 담고 있으므로 첫 회차와 짝지어 쓸 수 있다.
    // 표시 순서는 최신 회차를 먼저(방금 푼 모드의 성장이 눈에 먼저 들어오게).
    const countByMode: Record<string, number> = Object.create(null);
    for (const a of attempts) countByMode[a.mode] = (countByMode[a.mode] ?? 0) + 1;
    const improvements: ModeImprovement[] = Object.keys(firstRateByMode)
      .filter((m) => countByMode[m] >= 2)
      .map((m) => ({ mode: m, delta: prevRateByMode[m] - firstRateByMode[m] }))
      .sort((a, b) => (a.mode === latestAttempt.mode ? -1 : b.mode === latestAttempt.mode ? 1 : a.mode.localeCompare(b.mode)));
    timelines.push({
      setId,
      title: titleOf(setId),
      attempts,
      best: Math.max(...rates),
      first: rates[0],
      latest: rates[rates.length - 1],
      improvements,
      lastAt: latestAttempt.createdAt,
    });
  }
  // 가장 최근에 응시한 세트를 위로. 동시각(같은 ms) 동률은 setId로 타이브레이크 —
  // 없으면 정렬이 입력 순서에 좌우돼 통계 화면의 세트 순서가 렌더마다 흔들릴 수 있다
  // (속성 테스트 '정렬 결정성'이 실제로 찾아낸 반례).
  return timelines.sort((a, b) => b.lastAt - a.lastAt || a.setId.localeCompare(b.setId));
}

export interface MiniTestRound {
  id: string;
  setId: string;
  title: string;
  /** 챕터 미니 시험이면 챕터명, 퀵이면 null(세트·챕터에 매이지 않는다). */
  chapter: string | null;
  /** 회차 종류 — 화면이 '챕터 미니'와 '퀵'을 구분해 표시한다. */
  kind: 'mini' | 'quick';
  correct: number;
  total: number;
  rate: number;
  elapsedSeconds?: number;
  createdAt: number;
}

/**
 * 챕터 미니 시험 회차 목록(최신 → 과거).
 * 세트 타임라인에서는 표본이 달라 제외하지만, 화면에서 통째로 사라지면 "응시했는데
 * 어디에도 없다"가 된다 — 챕터명을 달아 별도로 보여주기 위한 목록이다.
 */
export function buildMiniTestRounds(
  histories: ExamHistory[],
  titleOf: (setId: string) => string,
): MiniTestRound[] {
  return histories
    // 퀵도 짧은 세션이라 요약·타임라인에서 빠진다 — 여기 없으면 화면 어디에도 나타나지
    // 않아 잘못 기록된 회차를 지울 방법이 없다(전체 비우기뿐).
    .filter((h): h is ExamHistory & { correct: number; total: number } =>
      isScored(h) && (!!h.chapter || h.mode === 'quick'))
    .map((h) => ({
      id: h.id,
      setId: h.setId,
      title: titleOf(h.setId),
      chapter: h.chapter ?? null,
      kind: (h.mode === 'quick' ? 'quick' : 'mini') as 'mini' | 'quick',
      correct: h.correct,
      total: h.total,
      rate: attemptRatePercent(h),
      elapsedSeconds: h.elapsedSeconds,
      createdAt: h.createdAt ?? 0,
    }))
    // 타임라인과 동일한 결정적 정렬(시각 → id) — 동률에도 순서가 흔들리지 않게.
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
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
    previousRate: prev ? attemptRatePercent(prev) : null,
  };
}

// 오답 '극복' 판정 — 같은 세트의 최근 시험 2회에서 연속으로 맞힌 문항 번호를 돌려준다.
// 시험 모드만 근거로 쓴다: 시험은 전 문항을 포함하므로 "wrongItems에 없음 = 맞힘"이
// 성립하지만, 추첨으로 출제하던 폐지 모드(랜덤·미니·구버전 퀵)의 과거 회차는 그 문항이
// 뽑혔는지 이력만으로 알 수 없다(보수적 제외).
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
