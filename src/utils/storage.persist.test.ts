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

// 멀티탭 답안 유실 — 두 탭이 각자 메모리를 통째로 덮어써 나중 쓰기가 앞선 답안을 지웠다.
describe('멀티탭 답안 병합', () => {
  it('다른 탭이 먼저 넣은 답안이 내 저장에 살아남는다(합집합)', () => {
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    // 다른 탭이 20번을 저장해 둔 상태를 흉내낸다.
    localStorage.setItem(ISTQB_ANS, JSON.stringify({ 'S-exam-020': ['c'] }));

    // 이 탭은 1·2번만 알고 있다 — 종전에는 이 쓰기가 020을 지웠다.
    store.useQuizStore.setState({ answers: { 'S-exam-001': ['a'], 'S-exam-002': ['b'] } });
    vi.advanceTimersByTime(600);

    const saved = JSON.parse(localStorage.getItem(ISTQB_ANS)!);
    expect(Object.keys(saved).sort()).toEqual(['S-exam-001', 'S-exam-002', 'S-exam-020']);
    // 합쳐진 결과가 메모리에도 반영돼 화면과 저장소가 어긋나지 않는다.
    expect(Object.keys(store.useQuizStore.getState().answers).sort())
      .toEqual(['S-exam-001', 'S-exam-002', 'S-exam-020']);
  });

  it('같은 문항을 양쪽에서 답하면 나중 쓰기가 이긴다', () => {
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    localStorage.setItem(ISTQB_ANS, JSON.stringify({ 'S-exam-001': ['a'] }));
    store.useQuizStore.setState({ answers: { 'S-exam-001': ['d'] } });
    vi.advanceTimersByTime(600);
    expect(JSON.parse(localStorage.getItem(ISTQB_ANS)!)['S-exam-001']).toEqual(['d']);
  });

  it('의도적 삭제(초기화)는 합치지 않고 교체한다 — 지운 답안이 되살아나면 안 된다', () => {
    store.useQuizStore.setState({
      activeProduct: 'istqb',
      answers: { 'S-exam-001': ['a'], 'S-exam-002': ['b'] },
    });
    vi.advanceTimersByTime(600);
    expect(Object.keys(JSON.parse(localStorage.getItem(ISTQB_ANS)!))).toHaveLength(2);

    // clearAnswers처럼 키가 줄어드는 변경.
    store.useQuizStore.setState({ answers: { 'S-exam-001': ['a'] } });
    vi.advanceTimersByTime(600);
    expect(Object.keys(JSON.parse(localStorage.getItem(ISTQB_ANS)!))).toEqual(['S-exam-001']);
  });

  it('다른 탭의 저장을 storage 이벤트로 받아 메모리를 맞춘다', () => {
    store.useQuizStore.setState({ activeProduct: 'istqb', answers: { 'S-exam-001': ['a'] } });
    const incoming = { 'S-exam-001': ['a'], 'S-exam-020': ['c'] };
    localStorage.setItem(ISTQB_ANS, JSON.stringify(incoming));
    window.dispatchEvent(new StorageEvent('storage', {
      key: ISTQB_ANS, newValue: JSON.stringify(incoming),
    }));
    expect(Object.keys(store.useQuizStore.getState().answers).sort())
      .toEqual(['S-exam-001', 'S-exam-020']);
  });

  it('다른 키의 storage 이벤트는 무시한다', () => {
    store.useQuizStore.setState({ activeProduct: 'istqb', answers: { 'S-exam-001': ['a'] } });
    window.dispatchEvent(new StorageEvent('storage', {
      key: CSTS_UI, newValue: JSON.stringify({ 'X-exam-001': ['z'] }),
    }));
    expect(Object.keys(store.useQuizStore.getState().answers)).toEqual(['S-exam-001']);
  });
});
