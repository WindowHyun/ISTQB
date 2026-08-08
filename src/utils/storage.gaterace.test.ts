// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 제품 게이트 연타 경합.
 *
 * App.handleProductSelect는 async인데 재진입 가드가 없고, 게이트를 걷는 조건(mode)이
 * await '뒤'에 바뀐다 — 즉 복원이 끝나기 전까지 ISTQB/CSTS 버튼이 계속 눌린다.
 * 콜드 스타트에서 IndexedDB 최초 open은 눈에 띄게 느려서, "반응이 없네" 하고 다른
 * 제품을 누르는 것이 현실적인 조작이다.
 *
 * 두 복원이 겹치면 값의 출처가 갈린다:
 *   persistenceKey()/storageKey()  → 호출 '시점'의 store activeProduct (await 뒤)
 *   hydrate({ activeProduct, … })  → 함수가 받은 '인자'
 * 늦게 재개한 쪽은 남의 localStorage를 읽고 자기 제품 스코프로 hydrate한다.
 * 그 뒤 저장 구독이 그것을 자기 키에 기록하면 제품 간 오염이 영속화된다.
 */

const IST_ANS = 'istqb-fl-v4-sample-answers';
const CSTS_ANS = 'csts-fl-v1-sample-answers';

async function freshStorage() {
  vi.resetModules();
  return await import('./storage');
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

/** 다음 IndexedDB open 1회의 onsuccess 전달을 지연시켜 재개 순서를 뒤집는다. */
function delayNextDbOpen(ms: number) {
  const realOpen = indexedDB.open.bind(indexedDB);
  let armed = true;
  vi.spyOn(indexedDB, 'open').mockImplementation(((name: string, version?: number) => {
    const req = realOpen(name, version);
    if (!armed) return req;
    armed = false;
    const box = req as IDBOpenDBRequest & { _h?: ((e: Event) => void) | null };
    Object.defineProperty(box, 'onsuccess', {
      configurable: true,
      get() { return box._h ?? null; },
      set(h: ((e: Event) => void) | null) {
        box._h = h ? ((e: Event) => { setTimeout(() => h(e), ms); }) : null;
      },
    });
    return req;
  }) as typeof indexedDB.open);
}

describe('제품 게이트 연타 경합', () => {
  it('두 제품 복원이 겹쳐도 답안이 서로 섞이지 않는다', async () => {
    const s = await freshStorage();
    const { useQuizStore } = await import('../store/useQuizStore');

    localStorage.setItem(IST_ANS, JSON.stringify({ 'ISTQB-A-exam-Q1': ['istqb'] }));
    localStorage.setItem(CSTS_ANS, JSON.stringify({ 'CSTS-A-exam-Q1': ['csts'] }));

    delayNextDbOpen(40); // 먼저 시작한 istqb가 나중에 재개하도록

    await Promise.all([
      s.restorePersistentSnapshot('istqb'),
      s.restorePersistentSnapshot('csts'),
    ]);

    const st = useQuizStore.getState();
    const keys = Object.keys(st.answers);
    const foreignPrefix = st.activeProduct === 'istqb' ? 'CSTS-' : 'ISTQB-';
    const foreign = keys.filter((k) => k.startsWith(foreignPrefix));
    expect(
      foreign,
      `activeProduct=${st.activeProduct} 인데 다른 제품 답안이 섞였다: ${foreign.join(', ')}`,
    ).toEqual([]);
  });

  it('겹쳐 복원해도 최종 activeProduct와 답안 스코프가 일치한다', async () => {
    const s = await freshStorage();
    const { useQuizStore } = await import('../store/useQuizStore');

    localStorage.setItem(IST_ANS, JSON.stringify({ 'ISTQB-A-exam-Q1': ['istqb'] }));
    localStorage.setItem(CSTS_ANS, JSON.stringify({ 'CSTS-A-exam-Q1': ['csts'] }));

    delayNextDbOpen(40);

    await Promise.all([
      s.restorePersistentSnapshot('csts'),
      s.restorePersistentSnapshot('istqb'),
    ]);

    const st = useQuizStore.getState();
    const own = st.activeProduct === 'istqb' ? 'ISTQB-' : 'CSTS-';
    const keys = Object.keys(st.answers);
    // 자기 제품 답안은 있어야 하고(복원이 아예 실패한 것도 결함),
    expect(keys.some((k) => k.startsWith(own))).toBe(true);
    // 남의 것은 없어야 한다.
    expect(keys.every((k) => k.startsWith(own))).toBe(true);
  });
});
