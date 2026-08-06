// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 퀵 회차(24시간 임시 보관)의 영속 계약.
 *
 * 퀵 회차는 이력(IndexedDB)이 아니라 UI 상태 키(localStorage)에 산다 — 회차 기록을
 * 남기지 않는 모드라 영구 저장소에 넣으면 사양과 모순되기 때문이다. 그래서 저장이
 * 걸리는 지점이 다른 필드와 다르고, 실제로 두 군데가 비어 있었다:
 *
 *  A) 스토어 구독의 감시 목록에 quickRounds가 없어, 채점(addQuickRound)이 저장을
 *     촉발하지 않았다. saveUiState의 allowlist에는 원래 있었으므로 "다른 이유로
 *     저장이 한 번 돌면" 함께 실렸다 — 그래서 재현이 간헐적이었고, 채점 직후
 *     새로고침한 사용자만 회차와 퀵 오답을 잃었다.
 *  B) sessionScopeDefaults에 quickRounds가 없어, 제품을 바꿔도 이전 제품 회차가
 *     메모리에 남고 다음 저장이 그것을 새 제품 키에 기록했다.
 *
 * 둘 다 화면에서는 잘 보이지 않는다(제품 필터가 표시만 가려 준다). 여기서 고정한다.
 *
 * debounce가 모듈 로드 시점에 생성되므로 fake timer를 먼저 켠 뒤 모듈을 새로 import한다
 * (storage.persist.test.ts와 동일한 절차).
 */

type StoreMod = typeof import('../store/useQuizStore');
type StorageMod = typeof import('./storage');

let store: StoreMod;
let storage: StorageMod;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  localStorage.clear();
  store = await import('../store/useQuizStore');
  storage = await import('./storage');
});

afterEach(() => {
  vi.useRealTimers();
});

const ISTQB_UI = 'istqb-fl-v4-sample-ui-state';
const CSTS_UI = 'csts-fl-v1-sample-ui-state';

function quickRound(id: string, certification: 'istqb' | 'csts') {
  return {
    id,
    setId: store.QUICK_SET_ID,
    mode: 'quick' as const,
    certification,
    answers: { 'QUICK-quick-Q1': ['a'] },
    correct: 0,
    total: 1,
    createdAt: Date.now(),
    wrongItems: [{ number: 1, myAnswer: ['a'], correctAnswer: ['b'], setId: 'ISTQB-FL-V4-A' }],
  };
}

describe('퀵 회차 영속 — 채점이 저장을 촉발한다(A)', () => {
  it('addQuickRound만으로 500ms 뒤 UI 상태 키에 회차가 저장된다', () => {
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    // 다른 감시 필드를 건드리지 않는다 — 채점 직후 실제로 일어나는 일과 같게 둔다.
    // (채점 경로에서 이어 실행되는 setGraded·setResultOpen은 둘 다 감시 대상이 아니다)
    store.useQuizStore.getState().addQuickRound(quickRound('r1', 'istqb'));
    vi.advanceTimersByTime(600);

    const saved = JSON.parse(localStorage.getItem(ISTQB_UI) || '{}');
    expect(
      saved.quickRounds?.length,
      '퀵 채점이 저장을 촉발하지 못했다 — 새로고침하면 회차와 퀵 오답이 사라진다',
    ).toBe(1);
    expect(saved.quickRounds[0].id).toBe('r1');
    // 오답노트가 출처 세트를 잃지 않는지도 함께 본다(wrongItems[].setId 보존).
    expect(saved.quickRounds[0].wrongItems[0].setId).toBe('ISTQB-FL-V4-A');
  });

  it('저장된 퀵 회차는 복원으로 되살아난다(왕복 계약)', async () => {
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    store.useQuizStore.getState().addQuickRound(quickRound('r1', 'istqb'));
    vi.advanceTimersByTime(600);

    // 새로고침 상당 — 메모리를 비우고 같은 제품으로 복원한다.
    store.useQuizStore.setState({ quickRounds: [] });
    vi.useRealTimers();
    await storage.restorePersistentSnapshot('istqb');

    const restored = store.useQuizStore.getState().quickRounds;
    expect(restored.map((r) => r.id)).toEqual(['r1']);
  });
});

describe('퀵 회차 제품 스코프 — 전환 시 새지 않는다(C)', () => {
  it('제품을 바꾸면 이전 제품의 퀵 회차가 메모리에서 사라진다', async () => {
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    store.useQuizStore.getState().addQuickRound(quickRound('r-istqb', 'istqb'));
    vi.advanceTimersByTime(600);

    vi.useRealTimers();
    await storage.restorePersistentSnapshot('csts'); // CSTS에는 저장된 퀵 회차가 없다

    expect(
      store.useQuizStore.getState().quickRounds,
      'ISTQB 퀵 회차가 CSTS 메모리에 살아남았다',
    ).toEqual([]);
  });

  it('제품 전환 후 저장해도 상대 제품 회차가 이 제품 키에 기록되지 않는다', async () => {
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    store.useQuizStore.getState().addQuickRound(quickRound('r-istqb', 'istqb'));
    vi.advanceTimersByTime(600);

    vi.useRealTimers();
    await storage.restorePersistentSnapshot('csts');
    storage.flushPersist(); // CSTS가 활성인 상태에서 즉시 기록

    const csts = JSON.parse(localStorage.getItem(CSTS_UI) || '{}');
    expect(
      csts.quickRounds ?? [],
      'ISTQB 퀵 회차가 CSTS 저장소 키로 새어 들어갔다',
    ).toEqual([]);
  });

  it('제품을 오갔다 돌아와도 원래 제품의 퀵 회차는 그대로다', async () => {
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    store.useQuizStore.getState().addQuickRound(quickRound('r-istqb', 'istqb'));
    vi.advanceTimersByTime(600);

    vi.useRealTimers();
    await storage.restorePersistentSnapshot('csts');
    storage.flushPersist();
    await storage.restorePersistentSnapshot('istqb');

    expect(store.useQuizStore.getState().quickRounds.map((r) => r.id)).toEqual(['r-istqb']);
  });
});
