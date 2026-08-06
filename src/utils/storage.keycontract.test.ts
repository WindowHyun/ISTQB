// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerKeyFor, answerKeyPrefix } from './answerKey';

/**
 * 답안 키 규약이 실제 데이터에서 성립하는지 못 박는다.
 *
 * restorePersistentSnapshot은 복원한 답안 키에서 setId를 되뽑아 "이 세트는 응시가
 * 개시됐다"를 재구성한다. 그 파싱이 `key.indexOf('-exam-')`의 최초 일치라, 규약
 * "setId·문항 id 안에는 '-exam-' 부분열이 없다"에 전적으로 기댄다. 종전에는 그
 * 가정이 주석으로만 있었다 — 세트를 하나 추가하면서 id에 '-exam-'이 들어가면
 * 파싱이 엉뚱한 지점에서 잘려, 시험 잠금이 풀리고(새로고침 한 번에 세트/모드 전이가
 * 열린다) 시작 게이트 재출현으로 타이머까지 소거된다. 어느 것도 화면에서 즉시
 * 드러나지 않는 종류의 고장이다.
 *
 * 여기서 실제 데이터(12세트 626문항) 전수로 가정을 검사한다. 규약이 깨지는 순간
 * CI가 멈추므로, 파싱을 그대로 두어도 안전하다.
 */

const dataRoot = path.resolve(process.cwd(), 'www/data');
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(dataRoot, rel), 'utf8'));
const index = readJson('index.json');

interface SetEntry { id: string; certification: string; path: string }
interface Q { id?: string; number: number }

const sets: SetEntry[] = index.sets;
const loaded = sets.map((s) => ({
  set: s,
  questions: readJson(s.path.replace(/^\.\//, '')).questions as Q[],
}));

// storage.ts의 파싱과 같은 규칙(최초 '-exam-' 일치 앞부분이 setId).
function setIdFromAnswerKey(key: string): string | null {
  const sep = key.indexOf('-exam-');
  return sep > 0 ? key.slice(0, sep) : null;
}

describe('답안 키 규약 — 실제 데이터 전수', () => {
  it('세트 id에 구분자 부분열(-exam-)이 없다', () => {
    const bad = sets.filter((s) => s.id.includes('-exam-'));
    expect(bad.map((s) => s.id), '세트 id가 답안 키 파싱을 오판하게 만든다').toEqual([]);
  });

  it.each(loaded.map(({ set }) => set.id))('%s — 문항 id에 구분자 부분열이 없다', (setId) => {
    const { questions } = loaded.find(({ set }) => set.id === setId)!;
    const bad = questions
      .map((q) => String(q.id || q.number))
      .filter((qid) => qid.includes('-exam-'));
    expect(bad, '문항 id가 답안 키 파싱을 오판하게 만든다').toEqual([]);
  });

  it('전 세트 626문항의 시험 답안 키가 원래 setId로 되뽑힌다(왕복)', () => {
    const mismatched: string[] = [];
    let checked = 0;
    for (const { set, questions } of loaded) {
      for (const q of questions) {
        const key = answerKeyFor(set.id, 'exam', q);
        checked += 1;
        if (setIdFromAnswerKey(key) !== set.id) mismatched.push(key);
      }
    }
    expect(checked).toBe(626);
    expect(mismatched.slice(0, 5), '답안 키에서 setId를 되뽑지 못했다').toEqual([]);
  });

  it('접두 삭제가 유사 이름 세트를 함께 지우지 않는다(구분자 포함 계약)', () => {
    // 실제로 접두 관계인 세트 쌍이 있는지 확인하고, 있으면 접두가 서로를 삼키지 않는지 본다.
    for (const a of sets) {
      for (const b of sets) {
        if (a.id === b.id) continue;
        if (!b.id.startsWith(a.id)) continue;
        expect(
          answerKeyPrefix(b.id, 'exam').startsWith(answerKeyPrefix(a.id, 'exam')),
          `${a.id} 접두가 ${b.id}의 답안을 함께 지운다`,
        ).toBe(false);
      }
    }
  });
});

describe('스냅샷 쓰기 — 두 경로가 같은 규칙을 쓴다(F2)', () => {
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
  afterEach(() => { vi.useRealTimers(); });

  const ISTQB_SNAP = 'istqb-fl-v4-sample-history-snapshot';

  it('스냅샷이 없던 상태에서 답안만 저장해도 스냅샷이 만들어진다', () => {
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    // 답안만 바꾼다 — saveUiState를 깨우는 필드는 건드리지 않는다.
    store.useQuizStore.getState().setAnswer('ISTQB-FL-V4-A-exam-Q1', ['a']);
    vi.advanceTimersByTime(600);

    const snap = JSON.parse(localStorage.getItem(ISTQB_SNAP) || 'null');
    expect(snap, '답안 저장이 스냅샷을 만들지 않았다').not.toBeNull();
    expect(snap.answers['ISTQB-FL-V4-A-exam-Q1']).toEqual(['a']);
  });

  it('만들어진 스냅샷의 답안이 복원으로 되살아난다', async () => {
    store.useQuizStore.setState({ activeProduct: 'istqb' });
    store.useQuizStore.getState().setAnswer('ISTQB-FL-V4-A-exam-Q1', ['a']);
    vi.advanceTimersByTime(600);

    store.useQuizStore.setState({ answers: {} });
    vi.useRealTimers();
    await storage.restorePersistentSnapshot('istqb');

    expect(store.useQuizStore.getState().answers['ISTQB-FL-V4-A-exam-Q1']).toEqual(['a']);
    // 답안이 있는 세트는 '응시 개시됨'으로 복원된다(위 키 파싱의 소비처).
    expect(store.useQuizStore.getState().examStarted['ISTQB-FL-V4-A']).toBe(true);
  });
});
