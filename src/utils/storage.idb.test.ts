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

  it('removeHistoriesEverywhere: 빈 id 목록은 no-op으로 안전하다', async () => {
    const s = await freshStorage();
    await expect(s.removeHistoriesEverywhere([])).resolves.toBeUndefined();
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
});
