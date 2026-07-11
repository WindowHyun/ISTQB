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
    const ok = await s.importUserData(backupFile({ schemaVersion: 999, histories: {} }));
    expect(ok).toBe(false);
    expect(errSpy).toHaveBeenCalled();
  });

  it('객체가 아닌 백업(JSON 배열/문자열)은 거부한다', async () => {
    const s = await freshStorage();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await s.importUserData(backupFile([1, 2, 3]))).toBe(false);
    expect(await s.importUserData(backupFile('"not-an-object"'))).toBe(false);
  });

  it('JSON 파싱 불가 파일은 거부한다', async () => {
    const s = await freshStorage();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = await s.importUserData(new File(['{broken'], 'b.json'));
    expect(ok).toBe(false);
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
    expect(ok).toBe(true);
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
    expect(parsed.schemaVersion).toBe(1);
    expect(typeof parsed.exportedAt).toBe('string');
    expect(['istqb', 'csts']).toContain(parsed.product);
  });
});
