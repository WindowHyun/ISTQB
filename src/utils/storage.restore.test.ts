// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findGradedExamMatch, findGradedRoundMatch } from './storage';
import type { ExamHistory } from '../store/useQuizStore';

/**
 * 복원 분기 — 새로고침·재접속 시 "이어풀기 / 새로 시작 / 이미 채점한 회차" 중 무엇으로
 * 착지할지 정하는 곳. 여기가 틀리면 사용자는 진행을 잃거나(무통보 초기화), 같은 답안을
 * 다시 채점해 회차가 중복 적립된다(통계 왜곡).
 *
 * 그런데 유닛이 이 구간을 통째로 지나가지 않았다. 커버리지 리포트 기준 storage.ts의
 * 미실행 구문 107개 중 가장 큰 덩어리 셋이 전부 여기다 —
 *   497-532(36줄) 랜덤 복원 분기 · 392-405(14줄) findGradedRoundMatch 본문 ·
 *   547-553(7줄) 시험 '채점 완료된 회차' 분기.
 * 커버리지 81%·뮤테이션 50.9%의 간극이 바로 이런 자리에서 나온다: E2E가 화면을 통해
 * 스쳐 지나가기는 해도, 판정 규칙 자체를 값으로 확인하는 검사가 없었다.
 *
 * findGradedRoundMatch는 순수 함수라 직접 부른다 — 복원 전체를 태우지 않고도
 * 판정 규칙을 값으로 고정할 수 있고, 규칙이 바뀌면 여기서 먼저 깨진다.
 */

const SET = 'ISTQB-FL-V4-A';

function round(over: Partial<ExamHistory> = {}): ExamHistory {
  return {
    id: 'r1',
    setId: SET,
    mode: 'exam',
    answers: { [`${SET}-exam-Q1`]: ['a'], [`${SET}-exam-Q2`]: ['b'] },
    correct: 1,
    total: 2,
    createdAt: 1_000,
    ...over,
  };
}
const byId = (...rs: ExamHistory[]) => Object.fromEntries(rs.map((r) => [r.id, r]));

describe('findGradedRoundMatch — 답안이 최신 채점 회차와 같은지', () => {
  it('키 집합과 각 선택이 모두 같으면 그 회차를 돌려준다', () => {
    const h = round();
    expect(findGradedRoundMatch(byId(h), SET, 'exam', h.answers)).toBe(h);
  });

  it('선택이 하나라도 다르면 같은 회차로 보지 않는다', () => {
    const h = round();
    const changed = { ...h.answers, [`${SET}-exam-Q2`]: ['c'] };
    expect(findGradedRoundMatch(byId(h), SET, 'exam', changed)).toBeNull();
  });

  it('선택 순서가 다르면 같은 회차로 보지 않는다(복수정답 순서까지 비교한다)', () => {
    const h = round({ answers: { [`${SET}-exam-Q1`]: ['a', 'b'] } });
    const swapped = { [`${SET}-exam-Q1`]: ['b', 'a'] };
    expect(findGradedRoundMatch(byId(h), SET, 'exam', swapped)).toBeNull();
  });

  it('답안 개수가 다르면(문항을 더 풀었으면) 새 응시로 본다', () => {
    const h = round();
    const more = { ...h.answers, [`${SET}-exam-Q3`]: ['d'] };
    expect(findGradedRoundMatch(byId(h), SET, 'exam', more)).toBeNull();
  });

  it('복원 답안이 비어 있으면 판정하지 않는다', () => {
    expect(findGradedRoundMatch(byId(round()), SET, 'exam', {})).toBeNull();
  });

  it('이력이 없으면 null', () => {
    expect(findGradedRoundMatch({}, SET, 'exam', { [`${SET}-exam-Q1`]: ['a'] })).toBeNull();
  });

  it('다른 모드의 회차는 보지 않는다(랜덤 채점이 시험 판정에 끼어들지 않는다)', () => {
    // 답안 키까지 랜덤 접두로 맞춘다 — 키가 안 맞아서 null이 되면 '모드로 걸러진다'를
    // 확인하지 못하고 검사가 헛돈다.
    const rnd = round({ id: 'r-rand', mode: 'random', answers: { [`${SET}-random-Q1`]: ['a'] } });
    expect(findGradedRoundMatch(byId(rnd), SET, 'exam', rnd.answers)).toBeNull();
  });

  it('다른 세트의 회차는 보지 않는다', () => {
    const other = round({ id: 'r-other', setId: 'ISTQB-FL-V4-B' });
    expect(findGradedRoundMatch(byId(other), SET, 'exam', other.answers)).toBeNull();
  });

  it('챕터 스코프가 다르면 보지 않는다(미니 시험 회차가 세트 전체 판정에 끼지 않는다)', () => {
    const mini = round({
      id: 'r-mini', mode: 'random', chapter: '테스트 기초',
      answers: { [`${SET}-random-Q1`]: ['a'] },
    });
    // 세트 전체 랜덤(chapter=null)으로 물으면 미니 회차는 대상이 아니다.
    expect(findGradedRoundMatch(byId(mini), SET, 'random', mini.answers, null)).toBeNull();
    // 같은 챕터로 물으면 대상이 된다.
    expect(findGradedRoundMatch(byId(mini), SET, 'random', mini.answers, '테스트 기초')).toBe(mini);
  });

  it('회차가 여럿이면 가장 최근(createdAt) 것만 본다', () => {
    const old = round({ id: 'old', createdAt: 1_000, answers: { [`${SET}-exam-Q1`]: ['a'] } });
    const recent = round({ id: 'new', createdAt: 9_000, answers: { [`${SET}-exam-Q1`]: ['z'] } });
    // 최신 회차와 다르면 — 옛 회차와 같더라도 — 새 응시로 본다.
    expect(findGradedRoundMatch(byId(old, recent), SET, 'exam', old.answers)).toBeNull();
    expect(findGradedRoundMatch(byId(old, recent), SET, 'exam', recent.answers)).toBe(recent);
  });

  it('createdAt이 같으면 id 역순으로 결정한다(순서가 흔들리지 않는다)', () => {
    const a = round({ id: 'aaa', createdAt: 5_000, answers: { [`${SET}-exam-Q1`]: ['a'] } });
    const b = round({ id: 'bbb', createdAt: 5_000, answers: { [`${SET}-exam-Q1`]: ['b'] } });
    // b.id가 크므로 b가 최신으로 뽑힌다 — 같은 입력에서 늘 같은 답이어야 한다.
    expect(findGradedRoundMatch(byId(a, b), SET, 'exam', b.answers)).toBe(b);
    expect(findGradedRoundMatch(byId(a, b), SET, 'exam', a.answers)).toBeNull();
  });

  it('다른 세트·모드의 답안 키는 비교에서 제외된다(접두로만 고른다)', () => {
    const h = round();
    // 복원 답안에 남의 키가 섞여 있어도, 이 세트/모드 키만 보면 동일하다.
    const noisy = { ...h.answers, 'ISTQB-FL-V4-B-exam-Q1': ['x'], [`${SET}-random-Q1`]: ['y'] };
    expect(findGradedRoundMatch(byId(h), SET, 'exam', noisy)).toBe(h);
  });

  it('findGradedExamMatch는 시험·챕터 없음으로 위임한다', () => {
    const mini = round({
      id: 'r-mini', mode: 'random', chapter: '테스트 기초',
      answers: { [`${SET}-random-Q1`]: ['a'] },
    });
    const exam = round({ id: 'r-exam' });
    expect(findGradedExamMatch(byId(exam, mini), SET, exam.answers)).toBe(exam);
  });
});

/**
 * 복원 착지 지점 — restorePersistentSnapshot을 실제로 태워 분기 결과를 본다.
 * 여기가 커버리지 미실행 구간의 가장 큰 덩어리(497-532)다.
 */
describe('restorePersistentSnapshot — 랜덤/시험 복원 착지', () => {
  type StoreMod = typeof import('../store/useQuizStore');
  type StorageMod = typeof import('./storage');
  let store: StoreMod;
  let storage: StorageMod;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    store = await import('../store/useQuizStore');
    storage = await import('./storage');
  });
  afterEach(() => vi.restoreAllMocks());

  const UI = 'istqb-fl-v4-sample-ui-state';
  const ANS = 'istqb-fl-v4-sample-answers';

  function seed(ui: Record<string, unknown>, answers: Record<string, string[]> = {}) {
    localStorage.setItem(UI, JSON.stringify(ui));
    localStorage.setItem(ANS, JSON.stringify(answers));
  }

  it('저장된 추첨이 있고 미채점이면 같은 추첨으로 이어푼다', async () => {
    seed(
      { mode: 'random', setId: SET, index: 3, randomDraw: { setId: SET, chapter: null, ids: ['Q1', 'Q2'] } },
      { [`${SET}-random-Q1`]: ['a'] },
    );
    await storage.restorePersistentSnapshot('istqb');
    const s = store.useQuizStore.getState();
    expect(s.randomDraw?.ids, '추첨이 비워져 진행이 사라졌다').toEqual(['Q1', 'Q2']);
    expect(s.answers[`${SET}-random-Q1`]).toEqual(['a']);
    expect(s.resumeNotice, '첫 문항이 아니면 이어풀기 배너가 떠야 한다').toBe(true);
    expect(s.resumePrompt).toBe(false);
  });

  it('첫 문항에서 이어풀면 위치 배너는 띄우지 않는다', async () => {
    seed(
      { mode: 'random', setId: SET, index: 0, randomDraw: { setId: SET, chapter: null, ids: ['Q1'] } },
      { [`${SET}-random-Q1`]: ['a'] },
    );
    await storage.restorePersistentSnapshot('istqb');
    expect(store.useQuizStore.getState().resumeNotice).toBe(false);
  });

  it('미니 시험(챕터 스코프)이면 챕터 필터도 함께 되살린다', async () => {
    seed(
      { mode: 'random', setId: SET, index: 1, randomDraw: { setId: SET, chapter: '테스트 기초', ids: ['Q1'] } },
      { [`${SET}-random-Q1`]: ['a'] },
    );
    await storage.restorePersistentSnapshot('istqb');
    expect(
      store.useQuizStore.getState().chapterFilter,
      '챕터 필터를 되살리지 않으면 추첨 스코프가 어긋나 일반 랜덤으로 재추첨된다',
    ).toBe('테스트 기초');
  });

  it('저장된 추첨이 없는데 랜덤 진행이 남아 있으면 비우고 1회 안내한다', async () => {
    seed({ mode: 'random', setId: SET, index: 2 }, { [`${SET}-random-Q1`]: ['a'] });
    await storage.restorePersistentSnapshot('istqb');
    const s = store.useQuizStore.getState();
    expect(s.answers[`${SET}-random-Q1`], '랜덤 답안이 남아 유령 진행이 된다').toBeUndefined();
    expect(s.randomDraw).toBeNull();
    expect(document.body.textContent, '무통보 초기화 — 안내 토스트가 없다').toContain('랜덤은 접속할 때마다');
  });

  it('추첨의 세트가 현재 세트와 다르면 이어풀지 않는다', async () => {
    seed(
      { mode: 'random', setId: SET, index: 1, randomDraw: { setId: 'ISTQB-FL-V4-B', chapter: null, ids: ['Q1'] } },
      { [`${SET}-random-Q1`]: ['a'] },
    );
    await storage.restorePersistentSnapshot('istqb');
    expect(store.useQuizStore.getState().randomDraw).toBeNull();
  });

  it('시험 답안이 남아 있으면 이어풀기/새로 풀기 선택 모달을 띄운다', async () => {
    seed({ mode: 'exam', setId: SET, index: 2 }, { [`${SET}-exam-Q1`]: ['a'] });
    await storage.restorePersistentSnapshot('istqb');
    const s = store.useQuizStore.getState();
    expect(s.resumePrompt).toBe(true);
    expect(s.resumeNotice, '선택 모달과 위치 배너가 겹치면 안 된다').toBe(false);
    expect(s.examStarted[SET], '진행 중 답안은 응시 개시의 증거다').toBe(true);
  });

  it('시험 답안이 없으면 선택 모달을 띄우지 않는다', async () => {
    seed({ mode: 'exam', setId: SET, index: 0 }, {});
    await storage.restorePersistentSnapshot('istqb');
    expect(store.useQuizStore.getState().resumePrompt).toBe(false);
  });
});
