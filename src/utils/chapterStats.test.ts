import { describe, it, expect } from 'vitest';
import {
  buildChapterStats, aggregateChapterStats, aggregateLatestChapterStats,
  makeCanonicalIdResolver, weightedRatePercent, makeCanonicalChapterResolver
} from './chapterStats';
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
    expect(buildChapterStats(questions, answers, keyOf).stats).toEqual({
      기초: { c: 1, t: 2 },
      기법: { c: 0, t: 1 },
    });
  });

  it('챕터별 정답/오답 문항 id를 함께 남긴다(최신 시도 집계의 입력)', () => {
    const questions = [q(1, '기초'), q(2, '기초'), q(3, '기법'), q(4, null)];
    const answers = { 'S-exam-Q-1': ['a'], 'S-exam-Q-2': ['b'] };
    expect(buildChapterStats(questions, answers, keyOf).questions).toEqual({
      기초: { ok: ['Q-1'], no: ['Q-2'] },
      기법: { ok: [], no: ['Q-3'] },
    });
  });

  it('id가 없는 과거 문항도 번호로 키를 만든다(집계에서 누락되지 않게)', () => {
    const legacy = { ...q(7, '기초'), id: undefined } as unknown as Question;
    const out = buildChapterStats([legacy], {}, keyOf);
    expect(out.questions.기초.no).toEqual(['legacy-7']);
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

describe('aggregateLatestChapterStats', () => {
  const h = (
    createdAt: number,
    chapterQuestions?: ExamHistory['chapterQuestions'],
    chapterStats?: ExamHistory['chapterStats'],
  ): ExamHistory =>
    ({ id: `h${createdAt}`, setId: 'S', mode: 'exam', answers: {}, createdAt, chapterQuestions, chapterStats });

  // 이 테스트가 이 변경의 존재 이유다 — 종전 방식(aggregateChapterStats)은 여기서 0/18을 냈다.
  it('같은 문항을 여러 번 풀어도 분모가 늘지 않는다', () => {
    const round = { 기초: { ok: [], no: ['Q-1', 'Q-2', 'Q-3'] } };
    const { stats } = aggregateLatestChapterStats([h(1, round), h(2, round), h(3, round)]);
    expect(stats).toEqual({ 기초: { c: 0, t: 3 } });
    // 대조 — 종전 누적 방식이라면 3배가 된다.
    const legacy = aggregateChapterStats([
      h(1, round, { 기초: { c: 0, t: 3 } }),
      h(2, round, { 기초: { c: 0, t: 3 } }),
      h(3, round, { 기초: { c: 0, t: 3 } }),
    ]);
    expect(legacy).toEqual({ 기초: { c: 0, t: 9 } });
  });

  it('가장 최근 결과를 쓴다 — 다시 맞히면 즉시 반영된다', () => {
    const { stats } = aggregateLatestChapterStats([
      h(1, { 기초: { ok: [], no: ['Q-1'] } }),      // 예전에 틀림
      h(2, { 기초: { ok: ['Q-1'], no: [] } }),      // 나중에 맞힘
    ]);
    expect(stats).toEqual({ 기초: { c: 1, t: 1 } });
  });

  it('맞혔다가 다시 틀리면 오답으로 되돌아간다', () => {
    const { stats } = aggregateLatestChapterStats([
      h(1, { 기초: { ok: ['Q-1'], no: [] } }),
      h(2, { 기초: { ok: [], no: ['Q-1'] } }),
    ]);
    expect(stats).toEqual({ 기초: { c: 0, t: 1 } });
  });

  it('회차 입력 순서가 뒤섞여도 결과가 같다(createdAt 기준 정렬)', () => {
    const a = h(2, { 기초: { ok: ['Q-1'], no: [] } });
    const b = h(1, { 기초: { ok: [], no: ['Q-1'] } });
    expect(aggregateLatestChapterStats([a, b]).stats)
      .toEqual(aggregateLatestChapterStats([b, a]).stats);
  });

  it('세트가 달라도 같은 문항 id면 한 번만 센다(기출 재출제 중복 방지)', () => {
    const { stats } = aggregateLatestChapterStats([
      h(1, { 기초: { ok: ['CSTS-2402-004'], no: [] } }),
      h(2, { 기초: { ok: ['CSTS-2402-004'], no: [] } }), // 다른 세트의 동일 문항
    ]);
    expect(stats.기초.t).toBe(1);
  });

  it('문항 id가 없는 과거 회차는 제외하고 그 수를 알린다', () => {
    const out = aggregateLatestChapterStats([
      h(1, undefined, { 기초: { c: 1, t: 2 } }),  // 구 이력(챕터 집계만 있음)
      h(2, { 기초: { ok: ['Q-9'], no: [] } }),
      h(3, undefined, undefined),                 // 챕터 분석 대상 자체가 아님
    ]);
    expect(out.stats).toEqual({ 기초: { c: 1, t: 1 } });
    expect(out.legacyRounds).toBe(1);
  });

  it('집계할 회차가 없으면 빈 결과다(화면이 폴백을 고를 수 있게)', () => {
    expect(aggregateLatestChapterStats([]).stats).toEqual({});
    expect(aggregateLatestChapterStats([h(1, undefined, { 기초: { c: 1, t: 1 } })]).stats).toEqual({});
  });
});

// 세트 간 재수록은 id가 서로 다르다(CSTS-FL-2404-001 vs CSTS-FL-2405-001). id 비교만으로는
// 걸러지지 않아, 2404를 풀고 2405를 푼 사용자에게서 같은 문제가 분모에 두 번 들어갔다.
describe('aggregateLatestChapterStats — 세트 간 재수록 중복 제거', () => {
  const h = (createdAt: number, chapterQuestions?: ExamHistory['chapterQuestions']): ExamHistory =>
    ({ id: `h${createdAt}`, setId: 'S', mode: 'exam', answers: {}, createdAt, chapterQuestions });
  const groups = [['CSTS-FL-2404-001', 'CSTS-FL-2405-001', 'CSTS-EL-2019-005']];
  const canonical = makeCanonicalIdResolver(groups);

  it('id가 달라도 같은 그룹이면 한 번만 센다', () => {
    const { stats } = aggregateLatestChapterStats(
      [
        h(1, { 기초: { ok: ['CSTS-FL-2404-001'], no: [] } }),
        h(2, { 기초: { ok: ['CSTS-FL-2405-001'], no: [] } }),
        h(3, { 기초: { ok: ['CSTS-EL-2019-005'], no: [] } }),
      ],
      canonical,
    );
    expect(stats.기초).toEqual({ c: 1, t: 1 });
  });

  // 이 단정이 수정의 핵심이다 — resolver 없이 돌리면 t=3이 되어 실패한다.
  it('resolver를 넘기지 않으면 종전처럼 세 번 센다(회귀 감지용 대조)', () => {
    const { stats } = aggregateLatestChapterStats([
      h(1, { 기초: { ok: ['CSTS-FL-2404-001'], no: [] } }),
      h(2, { 기초: { ok: ['CSTS-FL-2405-001'], no: [] } }),
      h(3, { 기초: { ok: ['CSTS-EL-2019-005'], no: [] } }),
    ]);
    expect(stats.기초.t).toBe(3);
  });

  it('그룹 안에서도 최신 회차의 결과를 쓴다', () => {
    const { stats } = aggregateLatestChapterStats(
      [
        h(1, { 기초: { ok: [], no: ['CSTS-FL-2404-001'] } }), // 예전엔 틀림
        h(2, { 기초: { ok: ['CSTS-FL-2405-001'], no: [] } }), // 최근엔 맞힘
      ],
      canonical,
    );
    expect(stats.기초).toEqual({ c: 1, t: 1 });
  });

  // 같은 문제가 세트마다 다른 챕터로 태깅된 경우가 원본 데이터에 3건 있다.
  // 최신 회차가 기록한 챕터로 센다 — 이 함수의 '최신 우선' 규칙과 같은 기준이다.
  it('그룹 내 챕터 태깅이 갈리면 최신 회차의 챕터로 센다', () => {
    const { stats } = aggregateLatestChapterStats(
      [
        h(1, { '테스트 프로세스와 도구': { ok: ['CSTS-EL-2019-005'], no: [] } }),
        h(2, { '소프트웨어 테스트 기초': { ok: ['CSTS-FL-2405-001'], no: [] } }),
      ],
      canonical,
    );
    expect(stats['소프트웨어 테스트 기초']).toEqual({ c: 1, t: 1 });
    expect(stats['테스트 프로세스와 도구']).toBeUndefined();
  });

  it('표에 없는 문항은 그대로 자기 자신이 대표다', () => {
    const { stats } = aggregateLatestChapterStats(
      [h(1, { 기초: { ok: ['CSTS-FL-2403-011'], no: ['CSTS-FL-2403-012'] } })],
      canonical,
    );
    expect(stats.기초).toEqual({ c: 1, t: 2 });
  });
});

describe('makeCanonicalIdResolver', () => {
  it('표가 없거나 비면 항등 함수다(표를 못 읽은 초기 렌더에서도 동작)', () => {
    expect(makeCanonicalIdResolver(undefined)('X')).toBe('X');
    expect(makeCanonicalIdResolver([])('X')).toBe('X');
  });

  it('그룹의 첫 원소를 대표로 삼는다', () => {
    const r = makeCanonicalIdResolver([['A', 'B', 'C']]);
    expect([r('A'), r('B'), r('C')]).toEqual(['A', 'A', 'A']);
  });

  // 조작된 백업·손상 데이터가 표 자리에 들어와도 집계가 죽지 않아야 한다.
  it('원소가 1개거나 배열이 아닌 그룹은 무시한다', () => {
    const r = makeCanonicalIdResolver([['A'], 'oops', [1, 2], ['X', 'Y']] as unknown as string[][]);
    expect(r('A')).toBe('A');
    expect(r('Y')).toBe('X');
  });
});

// 같은 문제가 세트마다 다른 챕터로 태깅된 경우가 있다(실제 3건). 대표 챕터 표가 없으면
// "마지막에 푼 회차의 챕터가 이긴다"가 되어, 사용자의 풀이 순서에 따라 통계가 달라진다.
// 원본 데이터는 그대로 두고 집계에서만 결정론적으로 통일한다.
describe('makeCanonicalChapterResolver — 재수록 챕터 통일', () => {
  const h = (id: string, createdAt: number, ch: string, qid: string) => ({
    id, setId: 'S', mode: 'exam' as const, answers: {}, createdAt,
    chapterQuestions: { [ch]: { ok: [qid], no: [] } },
  });

  it('표가 없으면 회차가 적어 둔 챕터를 그대로 쓴다', () => {
    const r = makeCanonicalChapterResolver(undefined);
    expect(r('X')).toBeUndefined();
    expect(r('A-1')).toBeUndefined();
  });

  it('푼 순서가 달라도 같은 챕터로 집계된다', () => {
    const canonical = makeCanonicalIdResolver([['A-1', 'B-1']]);
    const chapterOf = makeCanonicalChapterResolver({ 'A-1': '테스트 기법' });

    // B세트를 나중에 푼 경우 — 표가 없으면 B의 챕터('프로세스')가 이긴다.
    const later = aggregateLatestChapterStats(
      [h('h1', 100, '테스트 기법', 'A-1'), h('h2', 200, '프로세스', 'B-1')],
      canonical, chapterOf,
    );
    // A세트를 나중에 푼 경우.
    const earlier = aggregateLatestChapterStats(
      [h('h1', 200, '테스트 기법', 'A-1'), h('h2', 100, '프로세스', 'B-1')],
      canonical, chapterOf,
    );
    expect(Object.keys(later.stats)).toEqual(['테스트 기법']);
    expect(later.stats).toEqual(earlier.stats);
  });
});
