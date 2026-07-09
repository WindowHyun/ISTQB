import type { Question } from '../hooks/useQuestions';
import type { ExamHistory } from '../store/useQuizStore';
import { isQuestionCorrect } from './answer';

// 챕터(대단원)별 정답 집계 — Phase 3 약점 분석의 계산 계층.
// { 챕터명: { c: 정답 수, t: 출제 수 } }. 챕터 미태깅 문항은 집계에서 제외한다.
export type ChapterStats = Record<string, { c: number; t: number }>;

// 채점 시점에 현재 문항·답안으로 챕터별 정답/출제 수를 만든다(이력에 저장).
export function buildChapterStats(
  questions: Question[],
  answers: Record<string, string[]>,
  answerKeyOf: (q: Question) => string,
): ChapterStats {
  const stats: ChapterStats = {};
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
  const total: ChapterStats = {};
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
// (랜덤 40 vs 시험 70)를 왜곡하므로 정답 합/출제 합으로 계산한다. 표시는 내림.
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
  return Math.floor((c / t) * 100 + 1e-9);
}
