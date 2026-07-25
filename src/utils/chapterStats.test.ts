import { describe, it, expect } from 'vitest';
import { buildChapterStats, aggregateChapterStats, weightedRatePercent } from './chapterStats';
import type { Question } from '../hooks/useQuestions';
import type { ExamHistory } from '../store/useQuizStore';

const q = (n: number, chapter: string | null, answer = ['a']): Question => ({
  id: `Q-${n}`, number: n, type: 'multiple_choice', stem: '',
  options: [{ key: 'a', text: '' }, { key: 'b', text: '' }],
  answer, chapter,
});
const keyOf = (x: Question) => `S-exam-${x.id}`;

describe('buildChapterStats', () => {
  it('챕터별 정답/출제 수를 집계하고 미태깅(null) 문항은 제외한다', () => {
    const questions = [q(1, '기초'), q(2, '기초'), q(3, '기법'), q(4, null)];
    const answers = {
      'S-exam-Q-1': ['a'], // 정답
      'S-exam-Q-2': ['b'], // 오답
      // Q-3 미응답 → 오답, Q-4는 미태깅이라 집계 제외
    };
    expect(buildChapterStats(questions, answers, keyOf)).toEqual({
      기초: { c: 1, t: 2 },
      기법: { c: 0, t: 1 },
    });
  });
});

describe('aggregateChapterStats', () => {
  it('여러 회차를 합산하고 chapterStats 없는 과거 이력은 건너뛴다', () => {
    const h = (cs?: ExamHistory['chapterStats']): ExamHistory =>
      ({ id: 'x', setId: 'S', mode: 'exam', answers: {}, chapterStats: cs });
    const agg = aggregateChapterStats([
      h({ 기초: { c: 1, t: 2 } }),
      h({ 기초: { c: 2, t: 2 }, 기법: { c: 3, t: 5 } }),
      h(undefined), // 과거 이력
    ]);
    expect(agg).toEqual({ 기초: { c: 3, t: 4 }, 기법: { c: 3, t: 5 } });
  });
});

describe('weightedRatePercent', () => {
  it('문항 수 가중 평균(정답 합/출제 합·내림)을 계산한다', () => {
    const h = (correct: number, total: number): ExamHistory =>
      ({ id: 'x', setId: 'S', mode: 'exam', answers: {}, correct, total });
    // 40문항 100% + 70문항 50% → 단순평균 75%가 아니라 (40+35)/110 = 68.18… → 68
    expect(weightedRatePercent([h(40, 40), h(35, 70)])).toBe(68);
  });
  it('집계 가능한 회차가 없으면 null', () => {
    expect(weightedRatePercent([{ id: 'x', setId: 'S', mode: 'exam', answers: {} } as ExamHistory])).toBeNull();
  });
  it('CSTS 가중 점수가 있으면 획득/만점 점수로 누적한다(회차 %와 같은 기준)', () => {
    const w = (score: number, maxScore: number, correct: number, total: number): ExamHistory =>
      ({ id: 'x', setId: 'S', mode: 'exam', answers: {}, correct, total, cstsWeighted: { score, maxScore } });
    // 단순 정답률로 합하면 (50+60)/140 = 78%, 가중 점수로는 (75+90)/200 = 82%
    expect(weightedRatePercent([w(75, 100, 50, 70), w(90, 100, 60, 70)])).toBe(82);
  });
});
