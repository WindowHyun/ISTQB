// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 통합: store 구독 → debounce(500ms) → 제품별 localStorage 키 기록.
// E2E로만 간접 검증되던 연동을 fake timer로 직접 고정한다(피라미드 #6).
// debounce가 모듈 로드 시 생성되므로, fake timer를 먼저 켠 뒤 모듈을 새로 import한다.

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
const ISTQB_ANS = 'istqb-fl-v4-sample-answers';
const CSTS_UI = 'csts-fl-v1-sample-ui-state';

describe('store↔storage 구독 연동(통합)', () => {
  it('상태 변경 500ms 후 현재 제품 키에 uiState가 저장된다', () => {
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    store.useQuizStore.getState().setSetId('ISTQB-FL-V4-A');
    expect(localStorage.getItem(ISTQB_UI)).toBeNull(); // 디바운스 전
    vi.advanceTimersByTime(600);
    const saved = JSON.parse(localStorage.getItem(ISTQB_UI) || '{}');
    expect(saved.setId).toBe('ISTQB-FL-V4-A');
  });

  it('답안 변경도 500ms 후 제품 답안 키에 저장된다', () => {
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    store.useQuizStore.getState().setAnswer('A-exam-q1', ['a']);
    vi.advanceTimersByTime(600);
    const saved = JSON.parse(localStorage.getItem(ISTQB_ANS) || '{}');
    expect(saved['A-exam-q1']).toEqual(['a']);
  });

  it('elapsedSeconds 틱만으로는 저장하지 않는다(#71 매초 쓰기 방지)', () => {
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    store.useQuizStore.setState({ elapsedSeconds: 10 });
    store.useQuizStore.setState({ elapsedSeconds: 11 });
    vi.advanceTimersByTime(600);
    expect(localStorage.getItem(ISTQB_UI)).toBeNull();
  });

  it('flushPersist는 디바운스를 기다리지 않고 즉시 기록한다', () => {
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    store.useQuizStore.getState().setSetId('ISTQB-FL-V4-B');
    storage.flushPersist();
    // 타이머 진행 없이 즉시 저장돼 있어야 한다.
    const saved = JSON.parse(localStorage.getItem(ISTQB_UI) || '{}');
    expect(saved.setId).toBe('ISTQB-FL-V4-B');
  });

  it('제품 전환 전에 flushPersist하면 이전 제품 키에만 기록된다(P1-1 방어)', () => {
    // ISTQB 상태 변경 → 디바운스 대기 중 제품 전환 시나리오.
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    store.useQuizStore.getState().setSetId('ISTQB-FL-V4-A');
    // App.handleProductSelect와 동일 순서: flush → 제품 전환.
    storage.flushPersist();
    store.useQuizStore.getState().setActiveProduct('csts');
    vi.advanceTimersByTime(600);
    // ISTQB 상태는 ISTQB 키에 있고, CSTS 키에 ISTQB setId가 새지 않는다.
    expect(JSON.parse(localStorage.getItem(ISTQB_UI) || '{}').setId).toBe('ISTQB-FL-V4-A');
    const cstsRaw = localStorage.getItem(CSTS_UI);
    if (cstsRaw) expect(JSON.parse(cstsRaw).setId).not.toBe('ISTQB-FL-V4-A');
  });

  it('activeProduct가 없으면(게이트) 어떤 키에도 저장하지 않는다', () => {
    store.useQuizStore.setState({ activeProduct: null });
    store.useQuizStore.getState().setSetId('X');
    vi.advanceTimersByTime(600);
    expect(localStorage.getItem(ISTQB_UI)).toBeNull();
    expect(localStorage.getItem(CSTS_UI)).toBeNull();
  });
});
