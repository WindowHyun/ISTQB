import type { Question } from '../hooks/useQuestions';
import type { ExamHistory } from '../store/useQuizStore';
import { isQuestionCorrect } from './answer';
import { displayRatePercent } from './scoring';

// 챕터(대단원)별 정답 집계 — Phase 3 약점 분석의 계산 계층.
// { 챕터명: { c: 정답 수, t: 출제 수 } }. 챕터 미태깅 문항은 집계에서 제외한다.
export type ChapterStats = Record<string, { c: number; t: number }>;

// 채점 시점에 현재 문항·답안으로 챕터별 정답/출제 수를 만든다(이력에 저장).
export function buildChapterStats(
  questions: Question[],
  answers: Record<string, string[]>,
  answerKeyOf: (q: Question) => string,
): ChapterStats {
  // null-프로토타입 — '__proto__' 같은 챕터명이 들어와도(조작 백업 등) ||= 대입이
  // Object.prototype을 오염시키지 못하게 한다.
  const stats: ChapterStats = Object.create(null);
  for (const q of questions) {
    if (!q.chapter) continue;
    const cell = (stats[q.chapter] ||= { c: 0, t: 0 });
    cell.t += 1;
    if (isQuestionCorrect(q.answer, answers[answerKeyOf(q)] || [], q.type)) cell.c += 1;
  }
  return stats;
}

// 여러 회차 이력의 chapterStats를 합산한다. chapterStats가 없는 과거 이력은 건너뛴다.
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

// 문항 수 가중 평균 정답률(%) — 회차별 %의 단순 평균은 문항 수가 다른 회차
// (랜덤 40 vs 시험 70)를 왜곡하므로 정답 합/출제 합으로 계산한다.
// 표시 내림 규칙은 scoring.displayRatePercent 하나만 쓴다(화면 간 % 일치 정책의 단일 원천).
export function weightedRatePercent(histories: ExamHistory[]): number | null {
  let c = 0;
  let t = 0;
  for (const h of histories) {
    if (typeof h.correct === 'number' && typeof h.total === 'number' && h.total > 0) {
      c += h.correct;
      t += h.total;
    }
  }
  if (!t) return null;
  return displayRatePercent(c, t);
}
