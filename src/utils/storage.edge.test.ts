// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 저장 계층의 오류·엣지 경로.
 *
 * 뮤테이션 측정에서 storage.ts의 no-coverage가 182 → 116으로 줄었지만, 남은 것의 성격이
 * 뚜렷하다: **실패했을 때 무엇을 하는가**를 아무도 실행해 보지 않았다. 손상된 스냅샷,
 * IndexedDB 열기/트랜잭션 실패, 저장 공간 부족, 조작된 백업, 다른 탭의 쓰기 —
 * 전부 "정상 경로에서는 절대 안 밟히지만 밟히는 날에는 사용자 데이터가 걸린" 자리다.
 *
 * 이 계층에서 실패를 삼키면 증상이 늘 같은 모양으로 나타난다: 화면은 멀쩡한데
 * 새로고침하면 사라져 있다. 그래서 여기서 확인하는 것은 대부분 "그래도 남아 있는가"와
 * "조용히 넘어가지 않는가" 둘이다.
 */

type StoreMod = typeof import('../store/useQuizStore');
type StorageMod = typeof import('./storage');
let store: StoreMod;
let storage: StorageMod;

const UI = 'istqb-fl-v4-sample-ui-state';
const ANS = 'istqb-fl-v4-sample-answers';
const SNAP = 'istqb-fl-v4-sample-history-snapshot';
const SET = 'ISTQB-FL-V4-A';

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  store = await import('../store/useQuizStore');
  storage = await import('./storage');
});
afterEach(() => vi.restoreAllMocks());

describe('손상된 저장값 — 이력까지 잃지 않는다', () => {
  it('스냅샷 JSON이 깨져 있어도 복원이 완주한다', async () => {
    localStorage.setItem(SNAP, '{"uiState": {oops');   // 파싱 불가
    // 한 조각이 깨졌다고 예외로 빠져나가면 이미 읽어온 정상 이력까지 폐기된다.
    await expect(storage.restorePersistentSnapshot('istqb')).resolves.toBeUndefined();
    expect(store.useQuizStore.getState().activeProduct).toBe('istqb');
    expect(store.useQuizStore.getState().answers, '깨진 스냅샷의 답안이 그대로 유입됐다').toEqual({});
  });

  it('답안 키가 깨져 있어도 UI 상태는 복원된다', async () => {
    localStorage.setItem(UI, JSON.stringify({ mode: 'practice', setId: SET, index: 2 }));
    localStorage.setItem(ANS, 'not-json-at-all');
    await storage.restorePersistentSnapshot('istqb');
    const s = store.useQuizStore.getState();
    expect(s.answers).toEqual({});
    // 답안 파싱이 실패해도 모드·세트는 살아야 한다 — 둘은 다른 키다.
    expect(s.setId).toBe(SET);
  });

  it('저장값이 배열이나 원시값이어도 통째로 무시한다', async () => {
    localStorage.setItem(UI, '[1,2,3]');
    localStorage.setItem(ANS, '"문자열"');
    await storage.restorePersistentSnapshot('istqb');
    expect(store.useQuizStore.getState().answers).toEqual({});
  });
});

describe('조작된 백업 — 프로토타입 오염을 막는다', () => {
  it('chapterStats의 __proto__ 키는 통과시키지 않는다', () => {
    const h = storage.sanitizeHistory({
      id: 'x', setId: SET, mode: 'exam', answers: {},
      chapterStats: { __proto__: { c: 1, t: 1 }, constructor: { c: 1, t: 1 }, '정상': { c: 1, t: 2 } },
    });
    expect(Object.keys(h!.chapterStats ?? {})).toEqual(['정상']);
    expect(({} as Record<string, unknown>).c, 'Object.prototype이 오염됐다').toBeUndefined();
  });

  it('chapterQuestions의 프로토타입 키도 막는다', () => {
    const h = storage.sanitizeHistory({
      id: 'x', setId: SET, mode: 'exam', answers: {},
      chapterQuestions: { prototype: { ok: ['a'], no: [] }, '정상': { ok: ['b'], no: [] } },
    });
    expect(Object.keys(h!.chapterQuestions ?? {})).toEqual(['정상']);
  });

  it('같은 회차에서 정답·오답 양쪽에 든 문항은 오답으로 본다(모순 데이터는 보수적으로)', () => {
    const h = storage.sanitizeHistory({
      id: 'x', setId: SET, mode: 'exam', answers: {},
      chapterQuestions: { '테스트 기초': { ok: ['Q1', 'Q2'], no: ['Q1'] } },
    });
    expect(h!.chapterQuestions!['테스트 기초']).toEqual({ ok: ['Q2'], no: ['Q1'] });
  });

  it('t=0 셀은 버린다(통계에 "0% (0/0)" 유령 행이 생긴다)', () => {
    const h = storage.sanitizeHistory({
      id: 'x', setId: SET, mode: 'exam', answers: {},
      chapterStats: { '빈칸': { c: 0, t: 0 }, '정상': { c: 1, t: 2 } },
    });
    expect(Object.keys(h!.chapterStats ?? {})).toEqual(['정상']);
  });

  it('정답 수가 출제 수를 넘으면 클램프한다(10000% 표시 차단)', () => {
    const h = storage.sanitizeHistory({
      id: 'x', setId: SET, mode: 'exam', answers: {},
      correct: 100, total: 1,
      chapterStats: { '과장': { c: 100, t: 1 } },
    });
    expect(h!.correct).toBe(1);
    expect(h!.chapterStats!['과장']).toEqual({ c: 1, t: 1 });
  });

  it('cstsWeighted의 maxScore 0은 버린다(0으로 나누면 NaN%가 화면에 뜬다)', () => {
    const zero = storage.sanitizeHistory({
      id: 'x', setId: SET, mode: 'exam', answers: {}, cstsWeighted: { score: 0, maxScore: 0 },
    });
    expect(zero!.cstsWeighted).toBeUndefined();
    const ok = storage.sanitizeHistory({
      id: 'y', setId: SET, mode: 'exam', answers: {}, cstsWeighted: { score: 99, maxScore: 12 },
    });
    expect(ok!.cstsWeighted, '얻은 점수는 만점으로 클램프한다').toEqual({ score: 12, maxScore: 12 });
  });
});

describe('저장 공간 경고 — 유실 직전이 아니라 미리 알린다', () => {
  it('사용량이 90%를 넘으면 한 번만 안내한다', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: async () => ({ usage: 95, quota: 100 }) },
    });
    const h = { id: 'r1', setId: SET, mode: 'exam' as const, answers: {} };
    await storage.saveHistoryToDB(h);
    await vi.waitFor(() => expect(document.body.textContent).toContain('저장 공간이 거의 찼습니다'));

    // 세션당 1회 — 채점할 때마다 뜨면 소음이 된다.
    document.body.innerHTML = '';
    await storage.saveHistoryToDB({ ...h, id: 'r2' });
    await new Promise((r) => setTimeout(r, 50));
    expect(document.body.textContent).not.toContain('저장 공간이 거의 찼습니다');
  });

  it('여유가 있으면 안내하지 않는다', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: async () => ({ usage: 10, quota: 100 }) },
    });
    await storage.saveHistoryToDB({ id: 'r1', setId: SET, mode: 'exam', answers: {} });
    await new Promise((r) => setTimeout(r, 50));
    expect(document.body.textContent).not.toContain('저장 공간이 거의 찼습니다');
  });

  it('estimate를 지원하지 않는 브라우저에서도 저장은 성공한다', async () => {
    Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
    await expect(
      storage.saveHistoryToDB({ id: 'r1', setId: SET, mode: 'exam', answers: {} }),
    ).resolves.toBeUndefined();
    const back = await storage.loadHistoriesFromDB();
    expect(back['r1']).toBeTruthy();
  });
});

describe('IndexedDB 실패 — 조용히 넘어가지 않는다', () => {
  it('DB를 열 수 없으면 이력 저장 실패를 알린다', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      const req = {} as IDBOpenDBRequest;
      setTimeout(() => {
        Object.defineProperty(req, 'error', { value: new Error('boom'), configurable: true });
        req.onerror?.(new Event('error') as never);
      }, 0);
      return req;
    });
    await storage.saveHistoryToDB({ id: 'r1', setId: SET, mode: 'exam', answers: {} });
    expect(document.body.textContent, '저장 실패를 삼키면 새로고침 후에야 사라진 것을 안다')
      .toContain('채점 이력 저장에 실패했습니다');
  });

  it('DB를 열 수 없으면 이력 조회는 빈 객체로 그레이스풀하게 끝난다', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      const req = {} as IDBOpenDBRequest;
      setTimeout(() => {
        Object.defineProperty(req, 'error', { value: new Error('boom'), configurable: true });
        req.onerror?.(new Event('error') as never);
      }, 0);
      return req;
    });
    await expect(storage.loadHistoriesFromDB()).resolves.toEqual({});
  });

  it('삭제가 실패하면 메모리를 지우지 않는다(새로고침 부활 방지)', async () => {
    const h = { id: 'r1', setId: SET, mode: 'exam' as const, answers: {} };
    store.useQuizStore.setState({ histories: { r1: h } });
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      const req = {} as IDBOpenDBRequest;
      setTimeout(() => {
        Object.defineProperty(req, 'error', { value: new Error('boom'), configurable: true });
        req.onerror?.(new Event('error') as never);
      }, 0);
      return req;
    });
    const ok = await storage.removeHistoriesEverywhere(['r1']);
    expect(ok, '삭제 실패를 성공으로 보고하면 화면과 저장소가 어긋난다').toBe(false);
    expect(store.useQuizStore.getState().histories.r1, 'DB에 남았는데 메모리만 지웠다').toBeTruthy();
  });

  it('지울 id가 없으면 성공으로 끝난다(불필요한 트랜잭션 없음)', async () => {
    await expect(storage.removeHistoriesEverywhere([])).resolves.toBe(true);
  });
});

describe('다른 탭의 쓰기 — storage 이벤트', () => {
  it('답안 키 변경을 메모리에 반영한다', async () => {
    store.useQuizStore.setState({ activeProduct: 'istqb', answers: {} });
    window.dispatchEvent(new StorageEvent('storage', {
      key: ANS, newValue: JSON.stringify({ [`${SET}-exam-Q1`]: ['a'] }),
    }));
    expect(store.useQuizStore.getState().answers[`${SET}-exam-Q1`]).toEqual(['a']);
  });

  it('다른 제품·다른 앱의 키는 무시한다', () => {
    store.useQuizStore.setState({ activeProduct: 'istqb', answers: {} });
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'csts-fl-v1-sample-answers', newValue: JSON.stringify({ x: ['a'] }),
    }));
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'someone-elses-app', newValue: JSON.stringify({ y: ['b'] }),
    }));
    expect(store.useQuizStore.getState().answers).toEqual({});
  });

  it('손상된 값은 무시하고 기존 상태를 지킨다', () => {
    store.useQuizStore.setState({ activeProduct: 'istqb', answers: { keep: ['a'] } });
    window.dispatchEvent(new StorageEvent('storage', { key: ANS, newValue: '{broken' }));
    expect(store.useQuizStore.getState().answers).toEqual({ keep: ['a'] });
  });

  it('제품을 고르기 전에는 아무것도 받지 않는다', () => {
    store.useQuizStore.setState({ activeProduct: null, answers: {} });
    window.dispatchEvent(new StorageEvent('storage', {
      key: ANS, newValue: JSON.stringify({ [`${SET}-exam-Q1`]: ['a'] }),
    }));
    expect(store.useQuizStore.getState().answers).toEqual({});
  });

  it('UI 상태 키의 누적형 필드(복습 진척·퀵 회차)를 받아 온다', () => {
    store.useQuizStore.setState({ activeProduct: 'istqb', reviewedOk: {}, quickRounds: [] });
    window.dispatchEvent(new StorageEvent('storage', {
      key: UI,
      newValue: JSON.stringify({
        reviewedOk: { [SET]: [1, 2] },
        quickRounds: [{ id: 'q1', setId: 'QUICK', mode: 'quick', answers: {}, createdAt: Date.now() }],
      }),
    }));
    const s = store.useQuizStore.getState();
    expect(s.reviewedOk[SET]).toEqual([1, 2]);
    expect(s.quickRounds.map((r) => r.id)).toEqual(['q1']);
  });
});
