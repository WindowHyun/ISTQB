// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 탭이 둘일 때 UI 상태가 살아남는가.
 *
 * 답안에는 원래 기준선 병합이 있었지만 나머지 UI 상태에는 없어서, saveUiState가 자기
 * 메모리를 통째로 덮어썼다. 실측(Chromium 2탭)에서 이렇게 났다:
 *
 *   B탭 선점 진입      → 디스크 quickRounds 0건
 *   A탭 퀵 10문항 채점 → 디스크 quickRounds 1건
 *   B탭에서 문항 이동  → 디스크 quickRounds 0건   ← A의 회차가 사라진다
 *
 * 여기서는 그 상황을 한 프로세스 안에서 재현한다. "다른 탭"은 이 탭이 모르는 사이에
 * localStorage가 바뀐 상태로 흉내 낸다 — storage 이벤트가 없는 최악의 경우(이벤트를
 * 놓쳤거나 아직 안 온 시점)까지 쓰기 병합만으로 막히는지를 본다.
 */

type StoreMod = typeof import('../store/useQuizStore');
type StorageMod = typeof import('./storage');

let store: StoreMod;
let storage: StorageMod;

const UI = 'istqb-fl-v4-sample-ui-state';

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

const readUi = () => JSON.parse(localStorage.getItem(UI) || '{}');

/** 다른 탭이 디스크에만 남긴 변경. 이 탭의 메모리는 모른다. */
function otherTabWrites(patch: Record<string, unknown>) {
  localStorage.setItem(UI, JSON.stringify({ ...readUi(), ...patch }));
}

const round = (id: string, createdAt = Date.now()) => ({
  id, setId: 'QUICK', mode: 'quick' as const, certification: 'istqb' as const,
  answers: {}, createdAt, correct: 1, total: 10,
});

describe('멀티탭 — 누적형 UI 상태는 마지막 쓰기가 이기지 않는다', () => {
  it('다른 탭이 쌓은 퀵 회차를 이 탭의 저장이 지우지 않는다', () => {
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    // 이 탭이 한 번 저장해 기준선을 잡는다(퀵 회차 없음).
    store.useQuizStore.getState().setSetId('ISTQB-FL-V4-A');
    vi.advanceTimersByTime(600);
    expect(readUi().quickRounds ?? []).toHaveLength(0);

    // 다른 탭이 퀵 회차를 채점해 넣는다.
    otherTabWrites({ quickRounds: [round('r-other')] });

    // 이 탭은 그 사실을 모른 채 문항을 넘긴다 → saveUiState.
    store.useQuizStore.getState().setIndex(3);
    vi.advanceTimersByTime(600);

    const saved = readUi();
    expect(saved.index, '커서는 이 탭 값이 이겨야 한다').toBe(3);
    expect(
      (saved.quickRounds ?? []).map((r: { id: string }) => r.id),
      '다른 탭의 퀵 회차가 사라졌다 — 조용한 유실이다',
    ).toEqual(['r-other']);
  });

  it('다른 탭의 복습 진척·시험 기준점·오답 대상도 함께 보존된다', () => {
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    store.useQuizStore.getState().setSetId('ISTQB-FL-V4-A');
    vi.advanceTimersByTime(600);

    otherTabWrites({
      reviewedOk: { 'ISTQB-FL-V4-B': [3, 7] },
      examStartedAt: { 'ISTQB-FL-V4-B': 1700000000000 },
      reviewIds: { 'ISTQB-FL-V4-B-exam': ['q1', 'q2'] },
    });

    store.useQuizStore.getState().setIndex(1);
    vi.advanceTimersByTime(600);

    const saved = readUi();
    expect(saved.reviewedOk, '복습 진척이 유실됐다').toEqual({ 'ISTQB-FL-V4-B': [3, 7] });
    expect(saved.examStartedAt, '시험 제한시간 기준점이 유실됐다')
      .toEqual({ 'ISTQB-FL-V4-B': 1700000000000 });
    expect(saved.reviewIds, '오답 대상 목록이 유실됐다')
      .toEqual({ 'ISTQB-FL-V4-B-exam': ['q1', 'q2'] });
  });

  it('내가 지운 키는 되살아나지 않는다(병합이 삭제를 무효화하면 안 된다)', () => {
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    store.useQuizStore.getState().markReviewed('ISTQB-FL-V4-A', [5]);
    vi.advanceTimersByTime(600);
    expect(readUi().reviewedOk).toEqual({ 'ISTQB-FL-V4-A': [5] });

    // 이 탭이 그 세트의 진행을 통째로 비운다(이력 비우기 경로).
    store.useQuizStore.getState().resetProgressForSets(['ISTQB-FL-V4-A']);
    vi.advanceTimersByTime(600);

    expect(
      readUi().reviewedOk ?? {},
      '지운 복습 진척이 디스크에서 되살아났다 — 초기화가 무력해진다',
    ).toEqual({});
  });

  it('다른 탭이 넣은 값은 이 탭 메모리에도 반영된다(화면이 낡은 채로 남지 않게)', () => {
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    store.useQuizStore.getState().setSetId('ISTQB-FL-V4-A');
    vi.advanceTimersByTime(600);

    otherTabWrites({ quickRounds: [round('r-other')] });
    store.useQuizStore.getState().setIndex(2);
    vi.advanceTimersByTime(600);

    expect(
      store.useQuizStore.getState().quickRounds.map((r) => r.id),
      '디스크에는 살렸는데 화면(메모리)은 여전히 모른다',
    ).toEqual(['r-other']);
  });
});

describe('백업 내보내기 — 시험 기준점과 복습 진척', () => {
  it('examStartedAt·reviewedOk가 백업에 담긴다', async () => {
    store.useQuizStore.setState({
      activeProduct: 'istqb',
      examStartedAt: { 'ISTQB-FL-V4-A': 1700000000000 },
      reviewedOk: { 'ISTQB-FL-V4-A': [2, 4] },
    });

    // 내보내기는 Blob 다운로드라, 만들어진 JSON을 가로채 검사한다.
    let captured = '';
    const origBlob = globalThis.Blob;
    class SpyBlob extends origBlob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        captured = String(parts[0]);
        super(parts, opts);
      }
    }
    globalThis.Blob = SpyBlob as unknown as typeof Blob;
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
    try {
      await storage.exportUserData();
    } finally {
      globalThis.Blob = origBlob;
    }

    const backup = JSON.parse(captured);
    expect(backup.state.examStartedAt, '제한시간 기준점이 백업에서 빠졌다 — 복원 시 시험 시계가 멈춘다')
      .toEqual({ 'ISTQB-FL-V4-A': 1700000000000 });
    expect(backup.state.reviewedOk, '복습 진척이 백업에서 빠졌다 — 복원 시 재풀이가 헛일이 된다')
      .toEqual({ 'ISTQB-FL-V4-A': [2, 4] });
  });
});
