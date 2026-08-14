import { describe, it, expect } from 'vitest';
import { buildWrongNoteBySet } from './wrongNote';
import type { ExamHistory } from '../store/useQuizStore';

// 오답노트 세트 그룹 — 종전에는 AppModals의 useMemo 안에 묻혀 있어 유닛이 닿지 못했다.
// 여기서 고정하는 것은 두 가지다: 어떤 회차를 세는가(만점 포함), 어떤 오답을 대표로 쓰는가.

const W = (number: number, mine: string[] = ['x'], setId?: string) => ({
  number, myAnswer: mine, correctAnswer: ['a'], ...(setId ? { setId } : {}),
});

const round = (over: Partial<ExamHistory>): ExamHistory => ({
  id: 'r', setId: 'S1', mode: 'exam', answers: {}, correct: 0, total: 10, ...over,
});

const titleOf = (sid: string) => (sid === 'S1' ? 'S1 제목' : undefined);

describe('buildWrongNoteBySet — 회차 수', () => {
  it('만점 회차도 응시 횟수에 센다', () => {
    // 세 번 응시하고 그중 한 번이 만점(오답 0). 통계 화면은 "응시 3회"라고 말하므로
    // 오답노트의 "전 회차 합산(N회)"도 3이어야 한다 — 종전에는 2였다.
    const out = buildWrongNoteBySet([
      round({ id: 'a', createdAt: 1, wrongItems: [W(1)] }),
      round({ id: 'b', createdAt: 2, wrongItems: [] }), // 만점
      round({ id: 'c', createdAt: 3, wrongItems: [W(2)] }),
    ], titleOf);

    expect(out).toHaveLength(1);
    expect(out[0].attemptCount).toBe(3);
  });

  it('만점 회차가 최신이면 최근 시각도 그것을 가리킨다', () => {
    const out = buildWrongNoteBySet([
      round({ id: 'a', createdAt: 10, wrongItems: [W(1)] }),
      round({ id: 'b', createdAt: 99, wrongItems: [] }), // 만점이자 최신
    ], titleOf);

    expect(out[0].latestCreatedAt).toBe(99);
  });

  it('다른 세트의 회차는 세지 않는다', () => {
    const out = buildWrongNoteBySet([
      round({ id: 'a', setId: 'S1', createdAt: 1, wrongItems: [W(1)] }),
      round({ id: 'b', setId: 'S2', createdAt: 2, wrongItems: [] }),
      round({ id: 'c', setId: 'S2', createdAt: 3, wrongItems: [W(5)] }),
    ], titleOf);

    const s1 = out.find((x) => x.setId === 'S1')!;
    const s2 = out.find((x) => x.setId === 'S2')!;
    expect(s1.attemptCount).toBe(1);
    expect(s2.attemptCount).toBe(2); // 만점 1 + 오답 1
  });

  it('퀵 회차는 문항의 출처 세트로 귀속된다', () => {
    // 퀵은 회차 setId가 센티넬이라 문항별 setId로 판별한다.
    const out = buildWrongNoteBySet([
      round({ id: 'q', setId: 'QUICK', createdAt: 5, wrongItems: [W(3, ['x'], 'S1'), W(7, ['y'], 'S2')] }),
    ], titleOf);

    expect(out.find((x) => x.setId === 'S1')!.attemptCount).toBe(1);
    expect(out.find((x) => x.setId === 'S2')!.attemptCount).toBe(1);
  });
});

describe('buildWrongNoteBySet — 오답 합집합', () => {
  it('여러 회차의 오답을 합치고 같은 문항은 최신 회차의 내 답을 쓴다', () => {
    const out = buildWrongNoteBySet([
      round({ id: 'old', createdAt: 1, wrongItems: [W(1, ['옛답']), W(2, ['b'])] }),
      round({ id: 'new', createdAt: 2, wrongItems: [W(1, ['새답'])] }),
    ], titleOf);

    const nums = out[0].wrongItems.map((it) => it.number);
    expect(nums).toEqual([1, 2]); // 최신 회차만 보여주면 2번이 사라진다
    expect(out[0].wrongItems.find((it) => it.number === 1)!.myAnswer).toEqual(['새답']);
  });

  it('문항 번호 오름차순으로 정렬한다', () => {
    const out = buildWrongNoteBySet([
      round({ createdAt: 1, wrongItems: [W(9), W(2), W(5)] }),
    ], titleOf);
    expect(out[0].wrongItems.map((it) => it.number)).toEqual([2, 5, 9]);
  });

  it('오답이 하나도 없으면 그룹 자체가 생기지 않는다', () => {
    expect(buildWrongNoteBySet([round({ createdAt: 1, wrongItems: [] })], titleOf)).toEqual([]);
  });

  it('세트 목록은 최근 회차가 먼저 온다', () => {
    const out = buildWrongNoteBySet([
      round({ id: 'a', setId: 'S1', createdAt: 1, wrongItems: [W(1)] }),
      round({ id: 'b', setId: 'S2', createdAt: 9, wrongItems: [W(1)] }),
    ], titleOf);
    expect(out.map((x) => x.setId)).toEqual(['S2', 'S1']);
  });
});

describe('buildWrongNoteBySet — 제목', () => {
  it('index.json 제목을 먼저 쓴다', () => {
    const out = buildWrongNoteBySet([round({ createdAt: 1, wrongItems: [W(1)] })], titleOf);
    expect(out[0].setTitle).toBe('S1 제목');
  });

  it('세트가 index.json에서 빠졌으면 회차에 저장된 제목으로 폴백한다', () => {
    const out = buildWrongNoteBySet(
      [round({ setId: 'GONE', createdAt: 1, setTitle: '사라진 세트', wrongItems: [W(1)] })],
      titleOf,
    );
    expect(out[0].setTitle).toBe('사라진 세트');
  });
});

/**
 * 이력에는 시각(createdAt)이 없던 시절의 회차와, 오답이 하나도 없는 만점 회차가 섞여 있다.
 * 정렬·집계가 그것들을 만나 흔들리면 오답노트의 세트 순서와 '응시 N회'가 새로고침마다 달라진다.
 */
describe('buildWrongNoteBySet — 결측 필드', () => {
  it('시각이 없는 회차가 섞여도 목록이 만들어지고 최근 시각은 있는 것만 본다', () => {
    const got = buildWrongNoteBySet([
      round({ id: 'r1', wrongItems: [W(3)] }), // createdAt 없음
      round({ id: 'r2', createdAt: 500, wrongItems: [W(1)] }),
    ], titleOf);
    expect(got).toHaveLength(1);
    expect(got[0].latestCreatedAt).toBe(500);
    expect(got[0].attemptCount).toBe(2); // 시각이 없어도 응시는 응시다
    expect(got[0].wrongItems.map((w) => w.number)).toEqual([1, 3]);
  });

  it('시각이 아무 회차에도 없으면 최근 시각은 비고, 그래도 그룹은 남는다', () => {
    const got = buildWrongNoteBySet([round({ id: 'r1', wrongItems: [W(2)] })], titleOf);
    expect(got[0].latestCreatedAt).toBeUndefined();
    expect(got[0].setId).toBe('S1');
  });

  // 퀵 회차는 setId가 센티넬이라, 오답이 없으면 어느 세트에서 뽑았는지 기록이 남지 않는다.
  // 그 회차가 다른 세트의 응시 수를 늘리지 않아야 한다.
  it('오답이 없는 퀵 회차는 어느 세트의 응시 수도 늘리지 않는다', () => {
    const got = buildWrongNoteBySet([
      round({ id: 'r1', setId: 'S1', createdAt: 100, wrongItems: [W(1)] }),
      round({ id: 'r2', setId: 'QUICK', mode: 'quick', createdAt: 200, wrongItems: [] }),
    ], titleOf);
    expect(got[0].attemptCount).toBe(1);
    expect(got[0].latestCreatedAt).toBe(100);
  });
});
