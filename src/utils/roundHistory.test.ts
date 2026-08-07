import { describe, it, expect } from 'vitest';
import { buildGradedAnswers, buildRoundHistory, buildWrongItems, makeRoundId } from './roundHistory';
import { answerKeyFor } from './answerKey';
import type { Question } from '../hooks/useQuestions';

/**
 * 회차 레코드 조립 계약.
 *
 * 이 계산은 종전에 useQuizSession(훅) 안에 있어 유닛이 닿지 못했다 — 그 훅의 커버리지는
 * 0%였고, 검증은 E2E가 화면 너머로 스쳐 가는 것뿐이었다. 그런데 여기서 만드는 값은 그대로
 * 영속화돼 통계·오답노트·합격 판정의 입력이 된다. 필드 하나가 빠지면 채점 직후에는 멀쩡해
 * 보이고 새로고침 뒤에야, 그것도 조용히 드러난다.
 *
 * 아래 검사들은 실제로 이 조립부에서 났던 결함을 각각 하나씩 고정한다.
 */

const SET = 'ISTQB-FL-V4-A';
const keyOf = (q: Question) => answerKeyFor(SET, 'exam', q);

function q(over: Partial<Question> & { number: number }): Question {
  return {
    id: `Q${over.number}`,
    type: 'multiple_choice',
    stem: '',
    options: [{ key: 'a', text: '' }, { key: 'b', text: '' }],
    answer: ['a'],
    chapter: '테스트 기초',
    ...over,
  };
}

describe('makeRoundId', () => {
  it('시각과 난수를 합쳐 만든다(주입 가능해 결정적으로 검사할 수 있다)', () => {
    expect(makeRoundId(0, () => 0.5)).toMatch(/^0-/);
    // 같은 ms에 두 번 채점해도 난수 부분이 달라 회차가 서로를 덮지 않는다.
    const a = makeRoundId(1_000, () => 0.111111);
    const b = makeRoundId(1_000, () => 0.999999);
    expect(a).not.toBe(b);
  });
});

describe('buildWrongItems — 오답노트 항목', () => {
  it('내 답과 정답을 함께 남긴다', () => {
    const wrong = q({ number: 3, answer: ['b'] });
    const items = buildWrongItems([wrong], { [keyOf(wrong)]: ['a'] }, keyOf);
    expect(items).toEqual([{ number: 3, myAnswer: ['a'], correctAnswer: ['b'] }]);
  });

  it('미응답이면 내 답은 빈 배열이다(undefined가 새어 나가지 않는다)', () => {
    const wrong = q({ number: 4 });
    expect(buildWrongItems([wrong], {}, keyOf)[0].myAnswer).toEqual([]);
  });

  it('퀵 문항은 출처 세트를 함께 남긴다', () => {
    // 이게 빠지면 서로 다른 세트의 오답이 '퀵 랜덤' 한 덩어리로 묶이고,
    // 번호가 겹치는 항목끼리 조용히 서로를 덮어쓴다(실제로 났던 결함).
    const wrong = q({ number: 1, sourceSetId: 'CSTS-FL-2402' });
    expect(buildWrongItems([wrong], {}, keyOf)[0].setId).toBe('CSTS-FL-2402');
  });

  it('일반 회차 문항에는 setId를 붙이지 않는다(회차의 setId가 곧 출처)', () => {
    const wrong = q({ number: 1 });
    expect('setId' in buildWrongItems([wrong], {}, keyOf)[0]).toBe(false);
  });
});

describe('buildGradedAnswers — 채점 시점 답안 스냅샷', () => {
  it('이번 회차에 출제된 문항의 답만 담는다', () => {
    const q1 = q({ number: 1 });
    const answers = {
      [keyOf(q1)]: ['a'],
      'ISTQB-FL-V4-B-exam-Q1': ['x'],   // 다른 세트
      [`${SET}-random-Q1`]: ['y'],      // 다른 모드
    };
    // 전체 answers를 그대로 넣으면 나중에 findGradedRoundMatch 판정이 어긋난다.
    expect(buildGradedAnswers([q1], answers, keyOf)).toEqual({ [keyOf(q1)]: ['a'] });
  });

  it('미응답 문항은 키를 만들지 않는다', () => {
    expect(buildGradedAnswers([q({ number: 9 })], {}, keyOf)).toEqual({});
  });
});

describe('buildRoundHistory — 회차 레코드', () => {
  const q1 = q({ number: 1, chapter: '테스트 기초' });
  const q2 = q({ number: 2, chapter: '테스트 기초' });
  const q3 = q({ number: 3, chapter: '정적 테스팅' });
  const base = {
    setId: SET,
    mode: 'exam' as const,
    questions: [q1, q2, q3],
    answers: { [keyOf(q1)]: ['a'], [keyOf(q2)]: ['b'], [keyOf(q3)]: ['a'] },
    answerKeyOf: keyOf,
    wrongQuestions: [q2], // q2만 오답
    elapsedSeconds: 12.7,
    now: 1_700_000_000_000,
    id: 'fixed-id',
  };

  it('정답 수는 출제 수에서 오답 수를 뺀 값이다', () => {
    const h = buildRoundHistory(base);
    expect(h.total).toBe(3);
    expect(h.correct).toBe(2);
  });

  it('경과 시간은 정수로 반올림한다(초 단위 표시와 어긋나지 않게)', () => {
    expect(buildRoundHistory(base).elapsedSeconds).toBe(13);
  });

  it('시각과 id는 인자를 그대로 쓴다(시계에 매이지 않는다)', () => {
    const h = buildRoundHistory(base);
    expect(h.createdAt).toBe(1_700_000_000_000);
    expect(h.id).toBe('fixed-id');
  });

  it('챕터 집계와 문항 id를 함께 남긴다', () => {
    const h = buildRoundHistory(base);
    // 개수 집계
    expect(h.chapterStats).toEqual({
      '테스트 기초': { c: 1, t: 2 },
      '정적 테스팅': { c: 1, t: 1 },
    });
    // 문항 id — 이게 없으면 재풀이할 때마다 챕터 분모가 부풀어 6문항이 "0/18"이 된다.
    expect(h.chapterQuestions?.['테스트 기초']).toEqual({ ok: ['Q1'], no: ['Q2'] });
  });

  it('오답노트 상세를 담는다', () => {
    expect(buildRoundHistory(base).wrongItems).toEqual([
      { number: 2, myAnswer: ['b'], correctAnswer: ['a'] },
    ]);
  });

  it('답안 스냅샷에는 이번 회차 문항만 들어간다', () => {
    const noisy = { ...base.answers, 'ISTQB-FL-V4-B-exam-Q1': ['x'] };
    const h = buildRoundHistory({ ...base, answers: noisy });
    expect(Object.keys(h.answers).sort()).toEqual([keyOf(q1), keyOf(q2), keyOf(q3)].sort());
  });

  it('CSTS 가중 점수는 넘긴 경우에만 실린다', () => {
    expect(buildRoundHistory(base).cstsWeighted).toBeUndefined();
    const weighted = buildRoundHistory({ ...base, cstsWeighted: { score: 9, maxScore: 12 } });
    // 이게 빠지면 새로고침 뒤 통계 %가 합격 판정과 어긋난다(실제로 났던 결함).
    expect(weighted.cstsWeighted).toEqual({ score: 9, maxScore: 12 });
  });

  it('챕터 미니 시험 표식은 넘긴 경우에만 실린다', () => {
    expect(buildRoundHistory(base).chapter).toBeUndefined();
    expect(buildRoundHistory({ ...base, chapter: '테스트 기초' }).chapter).toBe('테스트 기초');
  });

  it('제품과 세트 제목을 그대로 싣는다(세트가 사라져도 통계에 내부 id가 안 뜬다)', () => {
    const h = buildRoundHistory({ ...base, certification: 'csts', setTitle: 'CSTS 2402' });
    expect(h.certification).toBe('csts');
    expect(h.setTitle).toBe('CSTS 2402');
  });

  it('퀵 회차는 센티넬 setId를 쓰되 오답의 출처는 문항별로 남는다', () => {
    const qa = q({ number: 1, sourceSetId: 'ISTQB-FL-V4-A' });
    const qb = q({ number: 1, id: 'QB1', sourceSetId: 'CSTS-FL-2402' });
    const h = buildRoundHistory({
      ...base,
      setId: 'QUICK',
      mode: 'quick',
      questions: [qa, qb],
      wrongQuestions: [qa, qb],
      setTitle: '퀵 랜덤',
    });
    expect(h.setId).toBe('QUICK');
    // 번호가 같아도(둘 다 1번) 출처가 달라 오답노트에서 갈라진다.
    expect(h.wrongItems?.map((w) => w.setId)).toEqual(['ISTQB-FL-V4-A', 'CSTS-FL-2402']);
  });

  it('전 문항 오답이면 correct는 0이다(음수가 되지 않는다)', () => {
    const h = buildRoundHistory({ ...base, wrongQuestions: [q1, q2, q3] });
    expect(h.correct).toBe(0);
  });

  it('챕터가 없는 문항은 챕터 집계에서 빠진다(미태깅 문항)', () => {
    const untagged = q({ number: 4, chapter: null });
    const h = buildRoundHistory({
      ...base, questions: [untagged], wrongQuestions: [], answers: { [keyOf(untagged)]: ['a'] },
    });
    expect(h.chapterStats).toEqual({});
    expect(h.total).toBe(1);
  });
});
