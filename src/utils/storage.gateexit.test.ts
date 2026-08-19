// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 게이트 **복귀** 경합 — activeProduct가 값 → null로 바뀌는 순간.
 *
 * `storage.gaterace.test.ts`는 반대 방향(게이트 진입: null → 값, 두 복원의 겹침)을 덮는다.
 * 이 파일은 나가는 쪽이다. 시험 응시 중 뒤로가기 → '시험 화면 나가기' → **나가기**가
 * `resetToGate()`를 부르는데, 그 직전 500ms 안에 예약된 디바운스 저장이 아직 살아 있다.
 *
 * 종전에는 두 저장 함수가 서로 다른 시점을 봤다.
 *   saveUiState : 가드는 예약 시점 스냅샷(state.activeProduct) · 키는 실행 시점 store
 *   saveAnswers : 가드도 키도 실행 시점 store
 * 그래서 같은 상황에서 한쪽은 **남의 제품 키에 쓰고**(getActiveProduct()의 폴백이 'istqb'),
 * 다른 한쪽은 **아무 데도 쓰지 않았다**(가드에 걸려 조용히 사라짐). 둘 다 실측으로 재현했다.
 *
 * 계약: 저장은 **예약 시점의 제품 키**에만 간다. 그리고 대기 중인 저장은
 * 제품이 비어 있어도 flushPersist가 반드시 내보낸다.
 */

type StoreMod = typeof import('../store/useQuizStore');
type StorageMod = typeof import('./storage');

let store: StoreMod;
let storage: StorageMod;

const ISTQB_UI = 'istqb-fl-v4-sample-ui-state';
const ISTQB_ANS = 'istqb-fl-v4-sample-answers';
const ISTQB_SNAP = 'istqb-fl-v4-sample-history-snapshot';
const CSTS_UI = 'csts-fl-v1-sample-ui-state';
const CSTS_ANS = 'csts-fl-v1-sample-answers';
const CSTS_SNAP = 'csts-fl-v1-sample-history-snapshot';

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

describe('게이트 복귀 — 대기 중인 저장이 남의 제품 키로 새지 않는다', () => {
  it('CSTS 상태의 디바운스 저장은 resetToGate 뒤에도 CSTS 키로만 간다', () => {
    store.useQuizStore.setState({ activeProduct: 'csts' });
    store.useQuizStore.getState().setSetId('CSTS-FL-2402');
    store.useQuizStore.getState().setIndex(7);

    // 디바운스가 만료되기 전에 게이트로 나간다(응시 중 '나가기').
    store.useQuizStore.getState().resetToGate();
    vi.advanceTimersByTime(600);

    // ISTQB는 손대지 않는다 — 종전에는 getActiveProduct()가 null을 'istqb'로 폴백해
    // CSTS의 모드·세트·위치가 여기에 기록됐다.
    expect(localStorage.getItem(ISTQB_UI)).toBeNull();
    expect(localStorage.getItem(ISTQB_SNAP)).toBeNull();
    const csts = JSON.parse(localStorage.getItem(CSTS_UI) || '{}');
    expect(csts.setId).toBe('CSTS-FL-2402');
    expect(csts.index).toBe(7);
  });

  it('CSTS 답안이 ISTQB 스냅샷으로 새지 않는다', () => {
    store.useQuizStore.setState({ activeProduct: 'csts' });
    store.useQuizStore.getState().setSetId('CSTS-FL-2402');
    store.useQuizStore.getState().setAnswer('CSTS-FL-2402-exam-Q1', ['a']);

    store.useQuizStore.getState().resetToGate();
    vi.advanceTimersByTime(600);

    expect(localStorage.getItem(ISTQB_ANS)).toBeNull();
    const istqbSnap = localStorage.getItem(ISTQB_SNAP);
    expect(istqbSnap).toBeNull();
    const cstsSnap = JSON.parse(localStorage.getItem(CSTS_SNAP) || '{}');
    expect(cstsSnap.answers?.['CSTS-FL-2402-exam-Q1']).toEqual(['a']);
  });

  it('디바운스가 만료될 때 제품이 이미 바뀌어 있어도 예약 시점 키를 쓴다', () => {
    // 게이트를 거치지 않고 제품만 갈아 끼운 경우(다른 복원이 store를 먼저 바꾼 상황).
    store.useQuizStore.setState({ activeProduct: 'csts' });
    store.useQuizStore.getState().setSetId('CSTS-FL-2402');
    store.useQuizStore.getState().setActiveProduct('istqb');
    vi.advanceTimersByTime(600);

    expect(JSON.parse(localStorage.getItem(CSTS_UI) || '{}').setId).toBe('CSTS-FL-2402');
    const istqbRaw = localStorage.getItem(ISTQB_UI);
    if (istqbRaw) expect(JSON.parse(istqbRaw).setId).not.toBe('CSTS-FL-2402');
  });
});

describe('게이트 복귀 — 나가기 직전 답안이 유실되지 않는다', () => {
  it('flushPersist는 activeProduct가 비어도 대기 중인 저장을 내보낸다', () => {
    store.useQuizStore.setState({ activeProduct: 'csts' });
    store.useQuizStore.getState().setSetId('CSTS-FL-2402');
    // 나가기 직전에 답을 고른다(디바운스 500ms 안).
    store.useQuizStore.getState().setAnswer('CSTS-FL-2402-exam-Q1', ['b']);

    store.useQuizStore.getState().resetToGate();
    // 워크스페이스 언마운트 cleanup / handleProductSelect 첫 줄이 부르는 경로.
    storage.flushPersist();

    // 종전에는 여기서 early-return이라 아무것도 쓰이지 않았고, 이어지는 복원이
    // 메모리를 디스크 값으로 덮으면서 이 답이 조용히 사라졌다.
    const saved = JSON.parse(localStorage.getItem(CSTS_ANS) || '{}');
    expect(saved['CSTS-FL-2402-exam-Q1']).toEqual(['b']);
  });

  it('flush 뒤에는 남은 타이머가 다시 쓰지 않는다(중복 기록 없음)', () => {
    store.useQuizStore.setState({ activeProduct: 'csts' });
    store.useQuizStore.getState().setAnswer('CSTS-FL-2402-exam-Q1', ['b']);
    store.useQuizStore.getState().resetToGate();
    storage.flushPersist();
    const afterFlush = localStorage.getItem(CSTS_ANS);
    vi.advanceTimersByTime(600);
    expect(localStorage.getItem(CSTS_ANS)).toBe(afterFlush);
    expect(localStorage.getItem(ISTQB_ANS)).toBeNull();
  });

  it('게이트에서 아무 진행이 없으면 어떤 키에도 쓰지 않는다(최초 진입)', () => {
    // activeProduct가 처음부터 null이면 예약된 저장 자체가 없다.
    storage.flushPersist();
    vi.advanceTimersByTime(600);
    expect(localStorage.getItem(ISTQB_UI)).toBeNull();
    expect(localStorage.getItem(CSTS_UI)).toBeNull();
  });
});
