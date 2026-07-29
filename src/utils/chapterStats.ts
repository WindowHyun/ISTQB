import type { Question } from '../hooks/useQuestions';
import type { ExamHistory } from '../store/useQuizStore';
import { isQuestionCorrect } from './answer';
import { displayRatePercent } from './scoring';

// 챕터(대단원)별 정답 집계 — Phase 3 약점 분석의 계산 계층.
// { 챕터명: { c: 정답 수, t: 출제 수 } }. 챕터 미태깅 문항은 집계에서 제외한다.
export type ChapterStats = Record<string, { c: number; t: number }>;

/**
 * 챕터별 정답/오답 문항 id 목록.
 *
 * chapterStats(개수 합계)만으로는 "같은 문항을 다시 풀었는지"를 알 수 없어, 재풀이할
 * 때마다 출제 수가 누적됐다(6문항을 세 번 풀면 0/18). 문항 id를 남겨 두면 합산 시
 * 문항별 '가장 최근 결과'만 골라, 화면의 분모가 실제로 풀어 본 문항 수와 같아진다.
 */
export type ChapterQuestions = Record<string, { ok: string[]; no: string[] }>;

export interface ChapterOutcome {
  stats: ChapterStats;
  questions: ChapterQuestions;
}

/** 문항의 이력 식별자 — 세트가 달라도 같은 문항이면 같은 키여야 한다. */
function questionKey(q: Question): string {
  return q.id || `legacy-${q.number}`;
}

// 채점 시점에 현재 문항·답안으로 챕터별 정답/출제 수와 문항 id 목록을 만든다(이력에 저장).
export function buildChapterStats(
  questions: Question[],
  answers: Record<string, string[]>,
  answerKeyOf: (q: Question) => string,
): ChapterOutcome {
  // null-프로토타입 — '__proto__' 같은 챕터명이 들어와도(조작 백업 등) ||= 대입이
  // Object.prototype을 오염시키지 못하게 한다.
  const stats: ChapterStats = Object.create(null);
  const byQuestion: ChapterQuestions = Object.create(null);
  for (const q of questions) {
    if (!q.chapter) continue;
    const cell = (stats[q.chapter] ||= { c: 0, t: 0 });
    const ids = (byQuestion[q.chapter] ||= { ok: [], no: [] });
    cell.t += 1;
    if (isQuestionCorrect(q.answer, answers[answerKeyOf(q)] || [], q.type, q.answerParts)) {
      cell.c += 1;
      ids.ok.push(questionKey(q));
    } else {
      ids.no.push(questionKey(q));
    }
  }
  return { stats, questions: byQuestion };
}

// 여러 회차 이력의 chapterStats를 합산한다. chapterStats가 없는 과거 이력은 건너뛴다.
// 같은 문항을 여러 번 풀면 그만큼 중복 집계된다 — 문항 id가 없는 과거 이력용 폴백이다.
export function aggregateChapterStats(histories: ExamHistory[]): ChapterStats {
  // null-프로토타입 — 이력의 chapterStats 키는 외부(DB·백업)에서 오므로 위와 동일하게 방어.
  const total: ChapterStats = Object.create(null);
  for (const h of histories) {
    for (const [ch, cell] of Object.entries(h.chapterStats || {})) {
      const acc = (total[ch] ||= { c: 0, t: 0 });
      acc.c += cell.c;
      acc.t += cell.t;
    }
  }
  return total;
}

export interface LatestChapterStats {
  stats: ChapterStats;
  /** 문항 id가 없어 집계에서 빠진 과거 회차 수 — 화면에서 안내한다. */
  legacyRounds: number;
}

/**
 * 문항별 '가장 최근 결과'만으로 챕터 정답률을 낸다.
 *
 * 종전(aggregateChapterStats)은 회차별 개수를 그대로 더해, 복습으로 같은 문항을 다시
 * 풀수록 분모가 커졌다 — 6문항짜리 챕터가 "0/18"이 되고, 정작 연습 버튼을 누르면
 * 6문항이 나와 숫자가 서로 맞지 않았다. 여기서는 최신 회차부터 훑어 각 문항을 한 번만
 * 세므로, 분모가 '실제로 풀어 본 서로 다른 문항 수'가 되고 재풀이해도 늘지 않는다.
 * 값 자체도 '지금 실력'에 가깝다 — 예전에 틀린 문항을 다시 맞히면 즉시 반영된다.
 *
 * 문항 id를 남기지 않던 과거 회차는 셀 방법이 없으므로 제외하고 그 수를 함께 돌려준다
 * (조용히 빼면 화면의 표본이 왜 적은지 알 수 없다).
 *
 * canonicalIdOf: 세트 간 재수록 문항을 대표 id 하나로 접는다. 이것이 없으면 2404를 풀고
 * 2405를 푼 사용자에게서 같은 문제가 분모에 두 번 들어간다 — 문항 id에 세트 접두가 붙어
 * 있어(CSTS-FL-2404-001 vs CSTS-FL-2405-001) id 비교만으로는 같은 문제임을 알 수 없기
 * 때문이다. 표는 index.json의 duplicateGroups에서 온다(빌드 타임 생성).
 * 넘기지 않으면 id를 그대로 쓴다 — 표를 아직 못 읽은 초기 렌더에서도 동작은 한다.
 *
 * 같은 문제가 세트마다 다른 챕터로 태깅된 경우가 3건 있다(원본 데이터의 분류 불일치).
 * 이때는 '가장 최근 회차가 기록한 챕터'로 센다 — 최신 결과를 쓴다는 이 함수의 규칙과
 * 같은 기준이라 결과가 회차 순서에만 의존하고 결정적이다.
 */
export function aggregateLatestChapterStats(
  histories: ExamHistory[],
  canonicalIdOf: (id: string) => string = (id) => id,
): LatestChapterStats {
  const stats: ChapterStats = Object.create(null);
  const seen = new Set<string>();
  let legacyRounds = 0;

  // 최신 회차 우선 — 먼저 만난 결과가 그 문항의 '가장 최근 결과'다.
  const ordered = [...histories].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  for (const h of ordered) {
    if (!h.chapterQuestions) {
      // chapterStats조차 없는 회차는 애초에 챕터 분석 대상이 아니다(구버전 채점).
      if (h.chapterStats) legacyRounds += 1;
      continue;
    }
    for (const [ch, ids] of Object.entries(h.chapterQuestions)) {
      for (const [list, correct] of [[ids.ok, true], [ids.no, false]] as const) {
        for (const id of list ?? []) {
          // 같은 문항이 여러 세트에 중복 수록돼 있어도(기출 재출제) 한 번만 센다.
          const key = canonicalIdOf(id);
          if (seen.has(key)) continue;
          seen.add(key);
          const cell = (stats[ch] ||= { c: 0, t: 0 });
          cell.t += 1;
          if (correct) cell.c += 1;
        }
      }
    }
  }
  return { stats, legacyRounds };
}

/**
 * duplicateGroups 표에서 id → 대표 id 매핑 함수를 만든다.
 *
 * 대표는 그룹의 첫 원소(생성 시 정렬돼 있어 결정적)다. 표에 없는 문항은 자기 자신이
 * 대표이므로 그대로 돌려준다 — 626문항 중 94개만 표에 있어 대부분은 이 경로다.
 */
export function makeCanonicalIdResolver(groups?: string[][]): (id: string) => string {
  if (!groups?.length) return (id) => id;
  const map = new Map<string, string>();
  for (const group of groups) {
    if (!Array.isArray(group) || group.length < 2) continue;
    const [canonical] = group;
    if (typeof canonical !== 'string') continue;
    for (const id of group) {
      if (typeof id === 'string') map.set(id, canonical);
    }
  }
  return (id) => map.get(id) ?? id;
}

// 문항 수 가중 평균 정답률(%) — 회차별 %의 단순 평균은 문항 수가 다른 회차
// (랜덤 40 vs 시험 70)를 왜곡하므로 정답 합/출제 합으로 계산한다.
// 표시 내림 규칙은 scoring.displayRatePercent 하나만 쓴다(화면 간 % 일치 정책의 단일 원천).
export function weightedRatePercent(histories: ExamHistory[]): number | null {
  let c = 0;
  let t = 0;
  for (const h of histories) {
    // CSTS 가중 점수가 있으면 획득/만점 '점수'로 누적한다 — 회차 %(attemptRatePercent)·
    // 합격 판정과 같은 기준이라야 평균만 다른 잣대로 표시되지 않는다.
    // (ISTQB의 correct/total도 문항당 1점짜리 점수이므로 같은 단위로 합산된다)
    if (h.cstsWeighted && h.cstsWeighted.maxScore > 0) {
      c += h.cstsWeighted.score;
      t += h.cstsWeighted.maxScore;
      continue;
    }
    if (typeof h.correct === 'number' && typeof h.total === 'number' && h.total > 0) {
      c += h.correct;
      t += h.total;
    }
  }
  if (!t) return null;
  return displayRatePercent(c, t);
}
