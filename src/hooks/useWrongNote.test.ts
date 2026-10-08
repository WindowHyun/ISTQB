import { describe, it, expect, beforeEach } from 'vitest';
import { deriveWrongNote, __resetWrongNoteMemoForTest } from './useWrongNote';
import type { AppData } from './useQuestions';
import type { ExamHistory } from '../store/useQuizStore';

/**
 * 오답 노트 데이터 파생 — 배지(MobileTopBar)와 노트(AppModals)가 **같은 계산을 한 번만** 하는가.
 *
 * 두 컴포넌트는 항상 마운트돼 같은 입력으로 이 계산을 부른다. 컴포넌트마다 따로 돌리면 이력이 바뀔 때마다
 * 병합·정렬 연쇄가 두 번 돈다. 한편 공유는 "입력이 같을 때만"이어야 한다 — 제품을 바꾸거나 이력이 늘었는데
 * 옛 결과를 돌려주면 배지가 노트와 어긋난다(이 모듈이 막으려던 바로 그 결함).
 */

const appData = {
  sets: [
    { id: 'I1', certification: 'ISTQB', title: '아이큐 1', path: 'i1.json' },
    { id: 'C1', certification: 'CSTS', title: '씨 1', path: 'c1.json' },
  ],
} as unknown as AppData;

const W = (number: number) => ({ number, myAnswer: ['x'], correctAnswer: ['a'] });
const round = (over: Partial<ExamHistory>): ExamHistory => ({
  id: 'r', setId: 'I1', mode: 'exam', answers: {}, correct: 0, total: 10, createdAt: 1, ...over,
});

describe('deriveWrongNote', () => {
  beforeEach(() => __resetWrongNoteMemoForTest());

  const histories = {
    a: round({ id: 'a', setId: 'I1', wrongItems: [W(1), W(2)] }),
    b: round({ id: 'b', setId: 'C1', wrongItems: [W(9)] }),
  };

  it('현재 제품의 이력만 센다(다른 제품의 오답은 배지에도 노트에도 끼지 않는다)', () => {
    expect(deriveWrongNote(appData, 'istqb', histories, []).total).toBe(2);
    expect(deriveWrongNote(appData, 'csts', histories, []).total).toBe(1);
  });

  it('입력이 같으면 같은 결과 객체를 돌려준다(두 컴포넌트가 계산을 나눠 갖지 않는다)', () => {
    // 스토어는 같은 참조를 두 컴포넌트에 준다 — 새 배열 리터럴을 매번 넘기면 '다른 입력'이다.
    const quickRounds: ExamHistory[] = [];
    const first = deriveWrongNote(appData, 'istqb', histories, quickRounds);
    const second = deriveWrongNote(appData, 'istqb', histories, quickRounds);
    expect(second).toBe(first);
  });

  it('입력이 하나라도 바뀌면 다시 계산한다 — 옛 결과를 돌려주지 않는다', () => {
    const quickRounds: ExamHistory[] = [];
    const base = deriveWrongNote(appData, 'istqb', histories, quickRounds);

    // 이력이 늘었다.
    const grown = { ...histories, c: round({ id: 'c', setId: 'I1', createdAt: 2, wrongItems: [W(3)] }) };
    const afterGrow = deriveWrongNote(appData, 'istqb', grown, quickRounds);
    expect(afterGrow).not.toBe(base);
    expect(afterGrow.total).toBe(3);

    // 제품이 바뀌었다.
    const csts = deriveWrongNote(appData, 'csts', grown, quickRounds);
    expect(csts.total).toBe(1);

    // 세트 목록이 다시 읽혔다.
    const reloaded = { sets: [...appData.sets] } as unknown as AppData;
    expect(deriveWrongNote(reloaded, 'csts', grown, quickRounds)).not.toBe(csts);

    // 퀵 회차 목록이 바뀌었다(내용이 같아도 참조가 새로 만들어지면 다시 계산한다 — 스토어가 갱신했다는 신호다).
    expect(deriveWrongNote(reloaded, 'csts', grown, [])).not.toBe(deriveWrongNote(reloaded, 'csts', grown, quickRounds));
  });

  it('퀵 회차도 입력이다 — 새 퀵 오답이 쌓이면 총수가 따라간다', () => {
    const quick = round({
      id: 'q', setId: 'QUICK', mode: 'quick', certification: 'istqb', createdAt: Date.now(),
      wrongItems: [{ ...W(5), setId: 'I1' }],
    });
    const before = deriveWrongNote(appData, 'istqb', {}, []);
    const after = deriveWrongNote(appData, 'istqb', {}, [quick]);
    expect(before.total).toBe(0);
    expect(after.total).toBe(1);
    expect(after.quickWrongs).toHaveLength(1);
  });

  it('데이터가 아직 없어도(null) 빈 노트를 돌려준다', () => {
    const out = deriveWrongNote(null, 'istqb', {}, []);
    expect(out.total).toBe(0);
    expect(out.sets).toEqual([]);
  });
});
