import 'fake-indexeddb/auto';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { ExamHistory } from '../store/useQuizStore';

// storage.ts의 IndexedDB 경로(견고성 P2-1·P2-2) 회귀 테스트.
// 모듈 스코프 dbPromise를 매 테스트마다 초기화하려고 vi.resetModules로 새로 import한다.
// DB는 공유하되(열린 연결이 있어 삭제가 블로킹됨) 테스트마다 고유 id를 써 간섭을 피한다.

const hist = (id: string): ExamHistory => ({
  id, setId: 'ISTQB-FL-V4-A', mode: 'exam', answers: {}, correct: 1, total: 1,
});

async function freshStorage() {
  vi.resetModules();
  return await import('./storage');
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('storage IndexedDB', () => {
  it('이력을 저장하면 트랜잭션 커밋 후 다시 읽어올 수 있다(P2-1: await 완료)', async () => {
    const s = await freshStorage();
    await s.saveHistoryToDB(hist('rt-1'));
    const loaded = await s.loadHistoriesFromDB();
    expect(loaded['rt-1']).toBeTruthy();
    expect(loaded['rt-1'].setId).toBe('ISTQB-FL-V4-A');
  });

  it('일시적 open 실패 후 다음 호출이 재시도해 정상 저장된다(P2-2: 거부 캐시 미고착)', async () => {
    const s = await freshStorage();
    const realOpen = indexedDB.open.bind(indexedDB);
    let failNext = true;
    vi.spyOn(indexedDB, 'open').mockImplementation(((name: string, version?: number) => {
      if (failNext) {
        failNext = false;
        const req = {} as IDBOpenDBRequest;
        setTimeout(() => req.onerror?.(new Event('error') as unknown as Event), 0);
        return req;
      }
      return realOpen(name, version);
    }) as typeof indexedDB.open);

    await s.saveHistoryToDB(hist('retry-1')); // 1차: open 실패 → 조용히 무시
    await s.saveHistoryToDB(hist('retry-1')); // 2차: dbPromise 비워져 재시도 → 성공해야 함

    const loaded = await s.loadHistoriesFromDB();
    expect(loaded['retry-1']).toBeTruthy(); // 수정 전(거부 영구 캐시)이면 여기서 실패
  });

  it('removeHistoriesEverywhere는 메모리(store)와 DB에서 함께 삭제한다', async () => {
    const s = await freshStorage();
    const { useQuizStore } = await import('../store/useQuizStore');
    await s.saveHistoryToDB(hist('rm-1'));
    await s.saveHistoryToDB(hist('rm-2'));
    useQuizStore.setState({ histories: { 'rm-1': hist('rm-1'), 'rm-2': hist('rm-2') } });

    await s.removeHistoriesEverywhere(['rm-1']);

    // 메모리에서 즉시 제거되고,
    expect(useQuizStore.getState().histories['rm-1']).toBeUndefined();
    expect(useQuizStore.getState().histories['rm-2']).toBeDefined();
    // DB에서도 제거돼 재로드(새로고침) 시 되살아나지 않는다.
    const loaded = await s.loadHistoriesFromDB();
    expect(loaded['rm-1']).toBeUndefined();
    expect(loaded['rm-2']).toBeTruthy();
  });

  it('removeHistoriesEverywhere: 빈 id 목록은 no-op으로 안전하다(성공으로 보고)', async () => {
    const s = await freshStorage();
    await expect(s.removeHistoriesEverywhere([])).resolves.toBe(true);
  });

  it('DB 삭제가 실패하면 메모리 이력을 지우지 않고 실패를 보고한다(되살아남 방지)', async () => {
    const s = await freshStorage();
    const { useQuizStore } = await import('../store/useQuizStore');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await s.saveHistoryToDB(hist('keep-1'));
    useQuizStore.setState({ histories: { 'keep-1': hist('keep-1') } });
    // 삭제 트랜잭션 자체가 실패하도록 1회 오버라이드
    // (항목 단위 delete 예외는 의도적으로 격리되므로 트랜잭션 개시를 실패시킨다).
    const delSpy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(() => {
      throw new DOMException('fail', 'InvalidStateError');
    });

    const ok = await s.removeHistoriesEverywhere(['keep-1']);

    expect(ok).toBe(false);
    // 메모리에 그대로 남아야 한다 — 지워버리면 새로고침 때 되살아나 불일치가 된다.
    expect(useQuizStore.getState().histories['keep-1']).toBeDefined();
    const loaded = await s.loadHistoriesFromDB();
    expect(loaded['keep-1']).toBeTruthy();
    delSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('저장 트랜잭션이 실패해도 예외를 던지지 않고 통지 경로로 흡수한다(P2-1: 무통지 유실 방지)', async () => {
    const s = await freshStorage();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // put이 예외를 던지도록 프로토타입을 1회 오버라이드(쿼터 초과 등 모사).
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    await expect(s.saveHistoryToDB(hist('boom'))).resolves.toBeUndefined();
    expect(putSpy).toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
  });
  // 회차 1건 삭제가 파생 상태(reviewIds)를 남기던 결함.
  //
  // 오답노트는 histories[].wrongItems에서 만들고, 오답 '모드'가 출제하는 대상은
  // reviewIds에서 만든다 — 소스가 다르다. 그런데 채점은 setReviewIds(gradeKey, wrongIds)로
  // **덮어쓰므로** reviewIds에는 그 세트/모드의 최신 회차 오답만 들어 있다.
  // 따라서 최신 회차를 지우면 오답노트에서는 사라지는데 오답 모드에는 그대로 출제된다 —
  // 코드베이스가 다른 두 삭제 경로(handleClearHistories·handleResetMode)에서는 이미
  // "오답 노트에는 없는데 오답 풀이엔 나오는 불일치"라고 이름 붙여 막아 둔 결함이,
  // 회차 단건 삭제 경로에만 남아 있었다.
  it('최신 회차를 지우면 그 오답이 오답 모드에 남지 않는다', async () => {
    const s = await freshStorage();
    const { useQuizStore } = await import('../store/useQuizStore');
    const r = (id: string, wrong: string[]): ExamHistory => ({
      id, setId: 'S1', mode: 'exam', answers: {}, correct: 0, total: 2,
      wrongItems: wrong.map((q) => ({ number: Number(q), myAnswer: [], correctAnswer: [], qid: q })),
    });
    await s.saveHistoryToDB(r('old', ['1']));
    await s.saveHistoryToDB(r('new', ['2']));
    useQuizStore.setState({
      histories: { old: r('old', ['1']), new: r('new', ['2']) },
      // 채점이 덮어써서 최신 회차('new')의 오답만 남아 있는 상태.
      reviewIds: { 'S1-exam': ['2'] },
    });

    await s.removeHistoriesEverywhere(['new']);

    // 'new'가 사라졌으니 그 오답 '2'가 오답 모드에 계속 나오면 안 된다.
    // 대신 남은 최신 회차('old')의 오답 '1'이 대상이 되어야 한다.
    expect(useQuizStore.getState().reviewIds['S1-exam']).toEqual(['1']);
  });

  it('마지막 회차까지 지우면 그 세트/모드의 오답 대상이 사라진다', async () => {
    const s = await freshStorage();
    const { useQuizStore } = await import('../store/useQuizStore');
    const only: ExamHistory = {
      id: 'solo', setId: 'S2', mode: 'exam', answers: {}, correct: 0, total: 1,
      wrongItems: [{ number: 7, myAnswer: [], correctAnswer: [], qid: '7' }],
    };
    await s.saveHistoryToDB(only);
    useQuizStore.setState({ histories: { solo: only }, reviewIds: { 'S2-exam': ['7'] } });

    await s.removeHistoriesEverywhere(['solo']);

    expect(useQuizStore.getState().reviewIds['S2-exam'] ?? []).toEqual([]);
  });

  it('오래된 회차를 지우는 것은 오답 대상을 건드리지 않는다(최신 회차가 기준)', async () => {
    const s = await freshStorage();
    const { useQuizStore } = await import('../store/useQuizStore');
    const mk = (id: string, wrong: number[]): ExamHistory => ({
      id, setId: 'S3', mode: 'exam', answers: {}, correct: 0, total: 2,
      wrongItems: wrong.map((n) => ({ number: n, myAnswer: [], correctAnswer: [], qid: String(n) })),
    });
    await s.saveHistoryToDB(mk('a', [1]));
    await s.saveHistoryToDB(mk('b', [2]));
    useQuizStore.setState({
      histories: { a: mk('a', [1]), b: mk('b', [2]) },
      reviewIds: { 'S3-exam': ['2'] },
    });

    await s.removeHistoriesEverywhere(['a']);

    expect(useQuizStore.getState().reviewIds['S3-exam']).toEqual(['2']);
  });
  // qid가 없는 과거 기록은 번호밖에 없어 재구성이 불가능하다. 지운 회차의 오답을 계속
  // 내보내는 것보다 비우는 편이 낫다 — 다시 채점하면 채워진다.
  it('과거 기록(qid 없음)만 남으면 오답 대상을 비운다 — 유령 출제보다 빈 쪽', async () => {
    const s = await freshStorage();
    const { useQuizStore } = await import('../store/useQuizStore');
    const legacy: ExamHistory = {
      id: 'legacy', setId: 'S4', mode: 'exam', answers: {}, correct: 0, total: 1,
      wrongItems: [{ number: 3, myAnswer: [], correctAnswer: [] }], // qid 없음
    };
    const fresh: ExamHistory = {
      id: 'fresh', setId: 'S4', mode: 'exam', answers: {}, correct: 0, total: 1,
      createdAt: 2, wrongItems: [{ number: 9, myAnswer: [], correctAnswer: [], qid: 'Q9' }],
    };
    await s.saveHistoryToDB(legacy);
    await s.saveHistoryToDB(fresh);
    useQuizStore.setState({
      histories: { legacy, fresh }, reviewIds: { 'S4-exam': ['Q9'] },
    });

    await s.removeHistoriesEverywhere(['fresh']);

    expect(useQuizStore.getState().reviewIds['S4-exam']).toEqual([]);
  });

  // 다른 세트/모드는 건드리지 않아야 한다 — 넓게 지우면 멀쩡한 재풀이 목록이 사라진다.
  it('삭제한 회차와 무관한 세트/모드의 오답 대상은 그대로 둔다', async () => {
    const s = await freshStorage();
    const { useQuizStore } = await import('../store/useQuizStore');
    const target: ExamHistory = {
      id: 't', setId: 'S5', mode: 'exam', answers: {}, correct: 0, total: 1,
      createdAt: 1, wrongItems: [{ number: 1, myAnswer: [], correctAnswer: [], qid: 'Q1' }],
    };
    await s.saveHistoryToDB(target);
    useQuizStore.setState({
      histories: { t: target },
      reviewIds: { 'S5-exam': ['Q1'], 'S5-random': ['Q2'], 'OTHER-exam': ['Q3'] },
    });

    await s.removeHistoriesEverywhere(['t']);

    expect(useQuizStore.getState().reviewIds['S5-exam']).toEqual([]);
    expect(useQuizStore.getState().reviewIds['S5-random']).toEqual(['Q2']);
    expect(useQuizStore.getState().reviewIds['OTHER-exam']).toEqual(['Q3']);
  });
});
