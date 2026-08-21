// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, it, expect, vi } from 'vitest';

// 백업 가져오기(Phase 4) — 스키마 버전 검증·형식 방어·정상 경로 회귀 테스트.
// storage.idb.test.ts와 동일하게 모듈 스코프 상태를 격리하려고 매번 새로 import한다.

async function freshStorage() {
  vi.resetModules();
  return await import('./storage');
}

function backupFile(data: unknown, name = 'backup.json'): File {
  return new File([JSON.stringify(data)], name, { type: 'application/json' });
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('importUserData (Phase 4)', () => {
  it('미래 스키마 버전 백업은 거부한다(알 수 없는 구조의 반쪽 적용 방지)', async () => {
    const s = await freshStorage();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await s.importUserData(backupFile({ schemaVersion: 999, histories: {} }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/최신 버전/); // 사용자에게 무엇을 해야 하는지 알린다
    expect(errSpy).toHaveBeenCalled();
  });

  it('객체가 아닌 백업(JSON 배열/문자열)은 거부한다', async () => {
    const s = await freshStorage();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await s.importUserData(backupFile([1, 2, 3]))).ok).toBe(false);
    expect((await s.importUserData(backupFile('"not-an-object"'))).ok).toBe(false);
  });

  it('JSON 파싱 불가 파일은 거부한다', async () => {
    const s = await freshStorage();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await s.importUserData(new File(['{broken'], 'b.json'));
    expect(r.ok).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it('제품이 다른 백업은 손대지 않고 거부한다(현재 제품 답안 파괴 방지)', async () => {
    // 종전에는 백업의 product를 읽지 않고 현재 제품 키에 그대로 써서, CSTS 화면에서
    // ISTQB 백업을 넣으면 CSTS 답안이 통째로 교체되고도 "복원했습니다"가 떴다.
    const s = await freshStorage();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await s.importUserData(backupFile({
      schemaVersion: 1, product: 'csts',
      histories: { 'x-1': { id: 'x-1', setId: 'CSTS-FL-2405', mode: 'exam', answers: {}, correct: 1, total: 2 } },
    }));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('CSTS'); // 어느 제품 백업인지 알려준다
    // 거부했으므로 이력이 유입되지 않아야 한다.
    expect((await s.loadHistoriesFromDB())['x-1']).toBeUndefined();
  });

  /**
   * 위 검사는 **한쪽 방향만** 봤다. 안내 문구는 백업 쪽 제품 이름(`from`)만 쓰는데,
   * 위 검사는 현재 제품이 ISTQB(기본값)라 문구에 늘 'CSTS'만 등장했다. 그래서
   * `PRODUCT_LABEL`의 `istqb: 'ISTQB'`는 **어떤 검사도 읽지 않는 값**이었다 —
   * 뮤테이션에서 이 문자열을 통째로 비워도 815개 검사가 전부 통과했다(생존 뮤턴트).
   *
   * 사용자가 읽는 문구이므로 반대 방향도 고정한다. 두 라벨 모두 문구에 실리는
   * 경로가 생겨야 둘 다 검사의 사정권에 들어온다.
   */
  it('반대 방향(CSTS에서 ISTQB 백업)도 어느 제품인지 문구로 알려준다', async () => {
    const s = await freshStorage();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { useQuizStore } = await import('../store/useQuizStore');
    useQuizStore.setState({ activeProduct: 'csts' });

    const r = await s.importUserData(backupFile({
      schemaVersion: 1, product: 'istqb',
      histories: { 'z-1': { id: 'z-1', setId: 'ISTQB-FL-V4-A', mode: 'exam', answers: {}, correct: 1, total: 2 } },
    }));

    expect(r.ok).toBe(false);
    expect(r.reason).toContain('ISTQB');
    expect((await s.loadHistoriesFromDB())['z-1']).toBeUndefined();
  });

  it('제품이 같으면 정상 가져온다', async () => {
    const s = await freshStorage();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const r = await s.importUserData(backupFile({
      schemaVersion: 1, product: 'istqb',
      histories: { 'y-1': { id: 'y-1', setId: 'ISTQB-FL-V4-A', mode: 'exam', answers: {}, correct: 1, total: 2 } },
    }));
    expect(r.ok).toBe(true);
    expect((await s.loadHistoriesFromDB())['y-1']).toBeTruthy();
  });

  it('현재/구버전(버전 없음) 백업은 이력이 DB에 커밋된다', async () => {
    const s = await freshStorage();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const ok = await s.importUserData(backupFile({
      schemaVersion: 1,
      histories: {
        'imp-1': { id: 'imp-1', setId: 'ISTQB-FL-V4-A', mode: 'exam', answers: {}, correct: 1, total: 2 },
      },
    }));
    expect(ok.ok).toBe(true);
    const loaded = await s.loadHistoriesFromDB();
    expect(loaded['imp-1']).toBeTruthy();
    expect(loaded['imp-1'].correct).toBe(1);
  });

  it('내보내기 데이터에 스키마 버전·제품 메타가 포함된다', async () => {
    const s = await freshStorage();
    // exportUserData는 다운로드 앵커를 클릭하므로 Blob 생성만 검증한다.
    let captured = '';
    const realBlob = globalThis.Blob;
    vi.stubGlobal('Blob', class extends realBlob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        captured = String(parts[0]);
      }
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
    await s.exportUserData();
    vi.unstubAllGlobals();
    const parsed = JSON.parse(captured);
    expect(parsed.schemaVersion).toBe(2);
    expect(typeof parsed.exportedAt).toBe('string');
    expect(['istqb', 'csts']).toContain(parsed.product);
  });

  it('APK(Android WebView): 네이티브 브리지가 있으면 blob 다운로드 대신 saveBackup을 쓴다', async () => {
    const s = await freshStorage();
    // 웹 다운로드 경로가 호출되면 실패로 간주 — 네이티브 경로가 우선이어야 한다.
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    let sentName = '';
    let sentPayload = '';
    const saveBackup = vi.fn((name: string, payload: string) => {
      sentName = name;
      sentPayload = payload;
      return JSON.stringify({ ok: true, fileName: name, location: '다운로드 폴더' });
    });
    (window as unknown as { AndroidBackup?: unknown }).AndroidBackup = { saveBackup };
    try {
      await s.exportUserData();
      expect(saveBackup).toHaveBeenCalledTimes(1);
      expect(clickSpy).not.toHaveBeenCalled(); // blob 다운로드로 폴백하지 않음
      expect(sentName).toMatch(/_backup_\d+\.json$/);
      const parsed = JSON.parse(sentPayload);
      expect(parsed.schemaVersion).toBe(2);
    } finally {
      delete (window as unknown as { AndroidBackup?: unknown }).AndroidBackup;
    }
  });
});

// 백업 스키마 v2 — 회차 이력에 chapterQuestions(챕터별 정답/오답 문항 id)가 추가됐다.
// 구버전 앱은 이 필드를 모르고 sanitizeHistory가 allowlist 방식이라 조용히 버린 뒤
// 그대로 DB에 저장한다. 버전을 올려 구버전이 아예 거부하게 만든 것이 이 방어의 요지다.
describe('백업 스키마 v2 — 하위 호환과 미래 버전 거부', () => {
  it('구버전 백업(v1)은 그대로 가져올 수 있다', async () => {
    const s = await freshStorage();
    const r = await s.importUserData(backupFile({
      schemaVersion: 1, product: 'istqb',
      histories: { a: { id: 'a', setId: 'ISTQB-FL-V4-A', mode: 'exam', answers: {}, correct: 1, total: 1 } },
    }));
    expect(r.ok).toBe(true);
  });

  it('버전이 없는 아주 오래된 백업도 허용한다', async () => {
    const s = await freshStorage();
    const r = await s.importUserData(backupFile({
      product: 'istqb',
      histories: { a: { id: 'a', setId: 'ISTQB-FL-V4-A', mode: 'exam', answers: {}, correct: 1, total: 1 } },
    }));
    expect(r.ok).toBe(true);
  });

  it('현재 버전(v2) 백업을 가져올 때 chapterQuestions가 살아남는다', async () => {
    const s = await freshStorage();
    const r = await s.importUserData(backupFile({
      schemaVersion: 2, product: 'istqb',
      histories: {
        a: {
          id: 'a', setId: 'ISTQB-FL-V4-A', mode: 'exam', answers: {}, correct: 1, total: 1,
          chapterStats: { 기초: { c: 1, t: 1 } },
          chapterQuestions: { 기초: { ok: ['ISTQB-FL-V4-A-001'], no: [] } },
        },
      },
    }));
    expect(r.ok).toBe(true);
    const h = s.sanitizeHistory({
      id: 'a', setId: 'S', mode: 'exam', answers: {},
      chapterQuestions: { 기초: { ok: ['Q1'], no: ['Q2'] } },
    });
    expect(h?.chapterQuestions).toEqual({ 기초: { ok: ['Q1'], no: ['Q2'] } });
  });

  it('미래 버전(v3)은 거부하고 사유를 알린다', async () => {
    const s = await freshStorage();
    const r = await s.importUserData(backupFile({ schemaVersion: 3, histories: {} }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/업데이트/);
  });
});

// 퀵은 다른 모드와 두 가지가 다르다: 회차의 setId가 'QUICK'이라는 가짜 세트이고,
// 답안 키(QUICK-quick-*)와 추첨(quickDraw)이 UI 상태에 얹힌다. 백업 왕복 테스트가
// 전부 시험/랜덤 회차로만 돼 있어 이 축은 한 번도 밟히지 않았다.
describe('백업 × 퀵 랜덤', () => {
  it('퀵 회차를 가져오면 모드와 오답의 출처 세트가 살아남는다', async () => {
    const s = await freshStorage();
    const r = await s.importUserData(backupFile({
      schemaVersion: 2, product: 'istqb',
      histories: {
        q: {
          id: 'q', setId: 'QUICK', mode: 'quick', answers: {}, correct: 8, total: 10,
          wrongItems: [
            { number: 3, myAnswer: ['a'], correctAnswer: ['b'], setId: 'ISTQB-FL-V4-A' },
            { number: 3, myAnswer: ['c'], correctAnswer: ['d'], setId: 'ISTQB-FL-V4-B' },
          ],
        },
      },
    }));
    expect(r.ok).toBe(true);
    const loaded = (await s.loadHistoriesFromDB()).q;
    // mode가 exam으로 보정되면 10문항 회차가 세트 전체 실전으로 집계된다.
    expect(loaded.mode).toBe('quick');
    // 출처 세트를 잃으면 오답노트가 '퀵 랜덤' 한 덩어리로 뭉치고,
    // 세트가 달라 같은 3번인 두 문항이 서로를 덮어쓴다.
    expect(loaded.wrongItems?.map((it) => it.setId)).toEqual(['ISTQB-FL-V4-A', 'ISTQB-FL-V4-B']);
  });

  it('내보내기에 퀵 추첨과 퀵 답안이 담긴다', async () => {
    vi.resetModules();
    // storage와 store를 같은 모듈 그래프에서 가져와야 exportUserData가 읽는 인스턴스와
    // 여기서 세팅하는 인스턴스가 같아진다.
    const s = await import('./storage');
    const { useQuizStore } = await import('../store/useQuizStore');
    useQuizStore.setState({
      mode: 'quick', setId: 'QUICK',
      quickDraw: { certification: 'istqb', items: [{ id: 'ISTQB-FL-V4-A-003', setId: 'ISTQB-FL-V4-A' }] },
      answers: { 'QUICK-quick-ISTQB-FL-V4-A-003': ['b'] },
    });

    let captured = '';
    const realBlob = globalThis.Blob;
    vi.stubGlobal('Blob', class extends realBlob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        captured = String(parts[0]);
      }
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
    await s.exportUserData();
    vi.unstubAllGlobals();

    const parsed = JSON.parse(captured);
    // quickDraw가 빠지면 백업에서 복원해도 "무엇을 뽑았는지"가 없어 진행이 사라진다.
    expect(parsed.state.quickDraw).toEqual({
      certification: 'istqb', items: [{ id: 'ISTQB-FL-V4-A-003', setId: 'ISTQB-FL-V4-A' }],
    });
    expect(parsed.answers['QUICK-quick-ISTQB-FL-V4-A-003']).toEqual(['b']);
  });

  it('가져온 퀵 추첨이 정제를 통과해 UI 상태로 복원된다', async () => {
    const s = await freshStorage();
    const ui = s.sanitizeUiState({
      mode: 'quick', setId: 'QUICK',
      quickDraw: { certification: 'istqb', items: [{ id: 'Q1', setId: 'ISTQB-FL-V4-A' }] },
    });
    // 'quick'이 VALID_MODES에서 빠지면 복원 시 모드가 통째로 무시돼 연습 화면으로 떨어진다.
    expect(ui.mode).toBe('quick');
    expect(ui.quickDraw?.items).toEqual([{ id: 'Q1', setId: 'ISTQB-FL-V4-A' }]);
  });
});
