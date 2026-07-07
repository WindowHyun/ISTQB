import { describe, it, expect, vi, beforeEach } from 'vitest';

// 공용 로더(Promise 캐시)의 계약 검증 — 중복 요청 합침·실패 재시도·경로 정규화·
// peek 동기 조회·성공 알림(다른 훅 인스턴스 복구용). 모듈 스코프 캐시가 있어
// 매 테스트 vi.resetModules로 새로 import한다.

type LoaderMod = typeof import('./questionLoader');
let loader: LoaderMod;

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const notFound = () =>
  ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response;

beforeEach(async () => {
  vi.resetModules();
  vi.unstubAllGlobals();
  loader = await import('./questionLoader');
});

describe('questionLoader', () => {
  it('loadIndex는 동시·반복 호출에도 fetch를 1회만 수행한다(Promise 캐시)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ sets: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([loader.loadIndex(), loader.loadIndex()]);
    expect(a).toEqual({ sets: [] });
    expect(b).toEqual({ sets: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('data/index.json');
  });

  it('실패(비 2xx)는 reject하고 캐시에서 비워져 다음 호출이 재시도한다', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(ok({ sets: [{ id: 'A' }] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loader.loadIndex()).rejects.toThrow('HTTP 404');
    await Promise.resolve(); // 실패 정리(catch 체인) 마이크로태스크 소진
    await expect(loader.loadIndex()).resolves.toEqual({ sets: [{ id: 'A' }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('loadSetQuestions는 {questions}·배열 형태를 모두 다루고 "./" 접두를 정규화한다', async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(ok(url.includes('a.json') ? { questions: [{ number: 1 }] } : [{ number: 2 }])),
    );
    vi.stubGlobal('fetch', fetchMock);
    const a = await loader.loadSetQuestions('./istqb/a.json');
    expect(fetchMock).toHaveBeenCalledWith('data/istqb/a.json');
    expect(a).toEqual([{ number: 1 }]);
    const b = await loader.loadSetQuestions('csts/b.json');
    expect(b).toEqual([{ number: 2 }]);
  });

  it('같은 세트는 경로 표기("./" 유무)가 달라도 한 번만 내려받는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ questions: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await loader.loadSetQuestions('./istqb/a.json');
    await loader.loadSetQuestions('istqb/a.json');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('peekSetQuestions는 로드 완료 후에만 동기 반환한다(재진입 시 로딩 프레임 방지)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ questions: [{ number: 3 }] })));
    expect(loader.peekSetQuestions('istqb/a.json')).toBeNull();
    await loader.loadSetQuestions('istqb/a.json');
    expect(loader.peekSetQuestions('./istqb/a.json')).toEqual([{ number: 3 }]);
  });

  it('로드 성공을 구독자에게 알리고, 해지하면 더 이상 알리지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ sets: [] })));
    const listener = vi.fn();
    const unsubscribe = loader.subscribeLoads(listener);
    await loader.loadIndex();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    await loader.loadSetQuestions('istqb/a.json');
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('실패 시에는 구독자에게 알리지 않는다(성공 복구 신호 전용)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notFound()));
    const listener = vi.fn();
    loader.subscribeLoads(listener);
    await expect(loader.loadIndex()).rejects.toThrow();
    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();
  });
});
