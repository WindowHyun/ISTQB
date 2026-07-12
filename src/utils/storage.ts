import { useQuizStore, QuizState, QuizMode, ExamHistory } from '../store/useQuizStore';
import debounce from 'lodash-es/debounce';
import { showToast } from './toast';

const DB_NAME = "istqb-db";
const STORE_NAME = "history";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  // 열기 실패(일시 오류 등) 시 캐시를 비워 다음 호출이 재시도하도록 한다(#P2-2).
  // 거부된 Promise를 영구 캐시하면 새로고침 전까지 이력 저장/조회가 고착된다.
  p.catch(() => { if (dbPromise === p) dbPromise = null; });
  dbPromise = p;
  return p;
}

function getActiveProduct() {
  return useQuizStore.getState().activeProduct || 'istqb';
}

function uiStorageKey() {
  return getActiveProduct() === "csts" ? "csts-fl-v1-sample-ui-state" : "istqb-fl-v4-sample-ui-state";
}

function storageKey() {
  return getActiveProduct() === "csts" ? "csts-fl-v1-sample-answers" : "istqb-fl-v4-sample-answers";
}

function persistenceKey() {
  return getActiveProduct() === "csts" ? "csts-fl-v1-sample-history-snapshot" : "istqb-fl-v4-sample-history-snapshot";
}

// localStorage 쓰기 실패 추적 — saveUiState/saveAnswers는 일상 경로에선 조용히 실패해도
// 되지만(디바운스 저장), 백업 가져오기에서는 "이력만 적용된 부분 성공"을 사용자에게
// 알려야 하므로 이 플래그로 판정한다.
let persistWriteFailed = false;

// 저장 공간 임박 경고(Phase 4) — 세션당 1회. 실패 시점(무통지 유실 직전)이 아니라
// 이력이 성공적으로 쌓이는 시점에 미리 내보내기(백업)를 유도한다.
let storageWarned = false;
async function warnIfStorageAlmostFull() {
  if (storageWarned) return;
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est || !est.quota || est.usage == null) return;
    if (est.usage / est.quota >= 0.9) {
      storageWarned = true;
      showToast('저장 공간이 거의 찼습니다. 설정에서 "기록 내보내기"로 백업해 두세요.', 'info');
    }
  } catch { /* estimate 미지원 환경(구형 브라우저) 무시 */ }
}

export async function saveHistoryToDB(history: ExamHistory) {
  try {
    const db = await getDb();
    // 트랜잭션 완료를 기다리고 async 실패(쿼터 초과·abort)까지 포착한다(#P2-1).
    // 기다리지 않으면 커밋 실패 시 메모리엔 있으나 새로고침 후 사라지는 무통지 유실이 된다.
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(history);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    void warnIfStorageAlmostFull();
  } catch (err) {
    console.error("IndexedDB save failed", err);
    showToast("채점 이력 저장에 실패했습니다.", "error");
  }
}

export async function loadHistoriesFromDB(): Promise<Record<string, ExamHistory>> {
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => {
        const result: Record<string, ExamHistory> = {};
        // DB에는 구버전·가져오기 유래의 임의 데이터가 있을 수 있어 읽는 시점에 정제한다.
        request.result.forEach((raw: unknown) => {
          const h = sanitizeHistory(raw);
          if (h) result[h.id] = h;
        });
        resolve(result);
      };
      request.onerror = () => resolve({});
    });
  } catch (err) {
    console.warn("IndexedDB load failed", err);
    return {};
  }
}

async function deleteHistoriesFromDB(ids: string[]) {
  if (!ids.length) return;
  try {
    const db = await getDb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      ids.forEach((id) => {
        try { store.delete(id); } catch { /* 항목 단위 실패는 나머지 삭제를 막지 않는다 */ }
      });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  } catch (err) {
    // 실패를 삼키면 UI(메모리)는 지워졌는데 새로고침 후 이력이 되살아나는 무통지 불일치가 된다.
    console.error("IndexedDB delete failed", err);
    showToast("이력 삭제에 실패했습니다.", "error");
  }
}

// 이력 삭제 단일 진입점 — 메모리(store)와 IndexedDB를 반드시 함께 지운다.
// 한쪽만 지우는 호출부 실수는 "새로고침하면 삭제한 이력이 되살아나는" 버그 클래스를
// 재발시키므로, 호출부는 이 함수만 사용한다.
export function removeHistoriesEverywhere(ids: string[]): Promise<void> {
  useQuizStore.getState().removeHistories(ids);
  return deleteHistoriesFromDB(ids);
}

type UnknownRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((s): s is string => typeof s === "string") : [];
}

// 외부(localStorage/백업 파일) 값을 신뢰하지 않고 정제한다.
export function sanitizeAnswers(value: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (!isPlainObject(value)) return result;
  for (const [key, choices] of Object.entries(value)) {
    const filtered = stringArray(choices);
    if (filtered.length) result[key] = filtered;
  }
  return result;
}

// 이력은 풀이 모드에서만 생성된다. VALID_MODES는 여기서 파생 — 두 목록을 따로
// 관리하면 모드 추가 시 한쪽 누락으로 이력이 무단 폐기되는 사고가 난다.
const HISTORY_MODES: QuizMode[] = ["exam", "practice", "random", "review"];
const VALID_MODES: string[] = ["home", ...HISTORY_MODES];

// 외부(IndexedDB 구버전 데이터·백업 파일) 이력을 정제한다 — sanitizeAnswers/sanitizeUiState와
// 같은 계층. 필드를 검증하지 않으면 손상된 백업의 wrongItems 등이 그대로 상태에 들어가
// 오답노트·통계 렌더에서 예외를 일으킬 수 있다.
export function sanitizeHistory(value: unknown): ExamHistory | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.id !== "string" || value.id === "") return null;
  if (typeof value.setId !== "string" || value.setId === "") return null;
  // mode가 없거나 무효인 구버전/손상 레코드는 버리지 않고 'exam'으로 보정한다 —
  // id·setId가 유효한 실제 응시 기록을 필드 하나 때문에 무단 폐기하지 않는다(데이터 보존).
  const mode = HISTORY_MODES.find((m) => m === value.mode) ?? "exam";
  const out: ExamHistory = {
    id: value.id,
    setId: value.setId,
    mode,
    answers: sanitizeAnswers(value.answers),
  };
  if (value.certification === "istqb" || value.certification === "csts") {
    out.certification = value.certification;
  }
  // 모순 데이터 방어 — 음수 거부, 정답 수는 출제 수를 넘지 못하게 클램프
  // (correct=100/total=1 같은 손상 백업이 통계에 10000%로 표시되는 것 차단).
  const total = finiteNumber(value.total);
  if (total !== undefined && total >= 0) out.total = total;
  const correct = finiteNumber(value.correct);
  if (correct !== undefined && correct >= 0) {
    out.correct = out.total !== undefined ? Math.min(correct, out.total) : correct;
  }
  const elapsedSeconds = finiteNumber(value.elapsedSeconds);
  if (elapsedSeconds !== undefined) out.elapsedSeconds = elapsedSeconds;
  const createdAt = finiteNumber(value.createdAt);
  if (createdAt !== undefined) out.createdAt = createdAt;
  if (typeof value.setTitle === "string") out.setTitle = value.setTitle;
  if (isPlainObject(value.chapterStats)) {
    // 챕터 집계는 { 챕터명: {c,t} } — 유한 숫자 셀만 통과(손상 백업의 NaN 유입 차단).
    const chapterStats: Record<string, { c: number; t: number }> = {};
    for (const [ch, cell] of Object.entries(value.chapterStats)) {
      // '__proto__' 등 프로토타입 조작 키는 통과시키지 않는다(조작 백업 방어).
      if (ch === "__proto__" || ch === "constructor" || ch === "prototype") continue;
      if (!isPlainObject(cell)) continue;
      const c = finiteNumber(cell.c);
      const t = finiteNumber(cell.t);
      // correct/total과 동일 규칙 — 음수 거부, 정답 수는 출제 수를 넘지 못하게 클램프
      // (손상 백업의 {c:100,t:1}이 챕터 정답률 10000%·약점 정렬 왜곡으로 새는 것 차단).
      // t=0 셀은 정보가 없으므로 폐기 — 통과시키면 통계에 "0% (0/0)" 유령 행이 생긴다.
      if (c === undefined || t === undefined || c < 0 || t <= 0) continue;
      chapterStats[ch] = { c: Math.min(c, t), t };
    }
    if (Object.keys(chapterStats).length) out.chapterStats = chapterStats;
  }
  if (Array.isArray(value.wrongItems)) {
    out.wrongItems = value.wrongItems
      .filter(isPlainObject)
      .filter((it) => typeof it.number === "number" && Number.isFinite(it.number))
      .map((it) => ({
        number: it.number as number,
        myAnswer: stringArray(it.myAnswer),
        correctAnswer: stringArray(it.correctAnswer),
      }));
  }
  return out;
}

export function sanitizeUiState(value: unknown): Partial<QuizState> {
  if (!isPlainObject(value)) return {};
  const out: Partial<QuizState> = {};
  if (typeof value.mode === "string" && VALID_MODES.includes(value.mode)) {
    out.mode = value.mode as QuizState["mode"];
  }
  if (typeof value.setId === "string") out.setId = value.setId;
  if (typeof value.index === "number" && Number.isInteger(value.index) && value.index >= 0) {
    out.index = value.index;
  }
  if (typeof value.elapsedSeconds === "number" && Number.isFinite(value.elapsedSeconds)) {
    out.elapsedSeconds = value.elapsedSeconds;
  }
  if (typeof value.navCollapsed === "boolean") out.navCollapsed = value.navCollapsed;
  // 채점 상태(graded)는 일부러 복원하지 않는다 — 재접속/모드 복귀 시 시험은 다시 풀 수 있게 초기화(#1).
  if (isPlainObject(value.reviewIds)) {
    const reviewIds: Record<string, string[]> = {};
    for (const [key, ids] of Object.entries(value.reviewIds)) {
      if (Array.isArray(ids)) reviewIds[key] = stringArray(ids);
    }
    out.reviewIds = reviewIds;
  }
  return out;
}

// 직전에 복원한 제품 — 같은 제품 게이트 왕복인지(세션 상태 보존) 제품 전환인지(초기화) 구분.
// 새로고침이면 모듈이 리셋돼 null이므로 리로드 경로는 자연히 "초기화"로 판정된다
// (채점한 시험을 재접속하면 다시 풀 수 있어야 한다는 #1 롤백 동작 보존).
let lastRestoredProduct: 'istqb' | 'csts' | null = null;
// 세션 내 제품별 채점 상태 캐시 — A→B→A처럼 제품을 오가도 세션 채점 상태를 잃지 않아
// "채점하기 재노출 → 동일 답안 재채점(유령 회차)" 경로를 막는다. 리로드 시 함께 초기화.
const sessionGraded: Partial<Record<'istqb' | 'csts', QuizState['graded']>> = {};

// 백업 가져오기 전용 — 재방문 판정·채점 캐시를 무효화한다. 가져온 백업에는 graded가
// 없으므로(내보내기 대상 아님) 세션 graded를 보존하면 가져온 미채점 답안이
// '채점됨'으로 표시되는 상태 불일치가 생긴다.
function invalidateSessionRestoreCache(product: 'istqb' | 'csts') {
  lastRestoredProduct = null;
  delete sessionGraded[product];
}

export async function restorePersistentSnapshot(activeProduct: 'istqb' | 'csts') {
  // 떠나는 제품의 채점 상태를 세션 캐시에 보관(제품 재방문 시 복원).
  if (lastRestoredProduct && lastRestoredProduct !== activeProduct) {
    sessionGraded[lastRestoredProduct] = useQuizStore.getState().graded;
  }
  const sameProductRevisit = lastRestoredProduct === activeProduct;
  lastRestoredProduct = activeProduct;
  // temporarily set the product to fetch the correct keys
  useQuizStore.getState().setActiveProduct(activeProduct);

  try {
    let uiState = {};
    let answers = {};
    const histories = await loadHistoriesFromDB();
    
    // Legacy snapshot logic — localStorage 파싱은 독립적으로 감싼다. 한 조각이 손상돼
    // JSON.parse가 throw해도, 이미 읽어온 정상 이력(histories)까지 폐기되지 않게 한다.
    try {
      const snapshotRaw = localStorage.getItem(persistenceKey());
      if (snapshotRaw) {
        const snapshot = JSON.parse(snapshotRaw);
        uiState = snapshot.uiState || {};
        answers = snapshot.answers || {};
      } else {
        const uiStateRaw = localStorage.getItem(uiStorageKey());
        if (uiStateRaw) uiState = JSON.parse(uiStateRaw);

        const answersRaw = localStorage.getItem(storageKey());
        if (answersRaw) answers = JSON.parse(answersRaw);
      }
    } catch (e) {
      console.error("스냅샷 파싱 실패 — UI/답안은 건너뛰고 이력만 복원합니다:", e);
      uiState = {};
      answers = {};
    }
    
    const restoredUi = sanitizeUiState(uiState);
    const sanitizedAnswers = sanitizeAnswers(answers);
    // 시험 답안이 남아 있는 세트는 "응시 개시됨"으로 복원한다 — examStarted는 영속화하지
    // 않지만, 진행 중 답안의 존재가 곧 응시 개시의 증거다. 이것이 없으면 새로고침 한 번으로
    // 응시 중 세트/모드 잠금이 풀리고(구 확인 모달 대비 회귀), 답안을 모두 지웠을 때
    // 시작 게이트가 재출현해 타이머를 소거하는 부작용도 생긴다.
    // 데이터 규약: 답안 키는 `${setId}-${mode}-${qid}`이고 setId·qid에는 '-exam-' 부분열이
    // 없다(현행 12세트·626문항 전수 확인). 규약이 깨지면 아래 최초 일치 파싱이 오판한다.
    const restoredExamStarted: Record<string, boolean> = {};
    for (const key of Object.keys(sanitizedAnswers)) {
      const sep = key.indexOf('-exam-');
      if (sep > 0) restoredExamStarted[key.slice(0, sep)] = true;
    }
    useQuizStore.getState().hydrate({
      // 제품 전환 시 이전 제품의 세션 상태(채점 여부·응시 게이트·오답 대상·챕터 필터)가
      // 새 제품으로 새어들지 않도록 기본값으로 깔고, 이 제품의 복원값(restoredUi)으로 덮는다.
      // 단, 같은 제품 게이트 왕복(리로드 아님)에서는 세션 내 채점 상태를 보존한다 —
      // 소거하면 '채점하기'가 재노출돼 동일 답안 재채점으로 회차가 중복 적재된다.
      graded: sameProductRevisit
        ? useQuizStore.getState().graded
        : (sessionGraded[activeProduct] ?? {}),
      examStarted: restoredExamStarted,
      reviewIds: {}, chapterFilter: null,
      ...restoredUi,
      answers: sanitizedAnswers,
      histories,
      activeProduct, // ensure it's set
    });
    // 성공 경로 진단 로그(화면 콘솔 ?debug용) — "복원은 됐는데 데이터가 이상하다"류
    // 문의에서 무엇이 몇 건 복원됐는지를 실기기에서 바로 확인할 수 있게 한다.
    console.info(
      `[data] 복원 완료: ${activeProduct} · 이력 ${Object.keys(histories).length}건 · 답안 ${Object.keys(sanitizedAnswers).length}건`,
    );
    const sid = restoredUi.setId ?? '';
    const m = restoredUi.mode;
    const store = useQuizStore.getState();
    if (m === 'random') {
      // 랜덤은 재접속 시 재추첨되어 이어풀기가 무의미하므로 이전 답안을 비우고
      // 처음부터 새로 시작한다(랜덤은 이어풀기 없음). 선택 모달·배너도 띄우지 않는다.
      store.clearAnswers(sid, 'random');
      store.setIndex(0);
      store.setResumePrompt(false);
      store.setResumeNotice(false);
    } else {
      // 시험 모드로 복원했고 이전 답안이 남아 있으면 "이어풀기/새로 풀기" 선택 모달을 띄운다.
      const hasExamProgress =
        m === 'exam' &&
        Object.keys(sanitizedAnswers).some((k) => k.startsWith(`${sid}-${m}-`));
      store.setResumePrompt(hasExamProgress);
      // 선택 모달이 뜨는 경우엔 위치 배너는 띄우지 않는다(중복 방지). 그 외엔 첫 문항이 아니면 배너(#A).
      store.setResumeNotice(!hasExamProgress && (restoredUi.index ?? 0) > 0);
    }
  } catch (e) {
    console.error("Failed to restore snapshot:", e);
  }
}

export const saveUiState = debounce((state: Partial<QuizState>) => {
  if (!state.activeProduct) return;
  try {
    const safeState = {
      mode: state.mode,
      setId: state.setId,
      index: state.index,
      elapsedSeconds: state.elapsedSeconds,
      reviewIds: state.reviewIds,
      navCollapsed: state.navCollapsed
    };
    localStorage.setItem(uiStorageKey(), JSON.stringify(safeState));
    
    // Also build legacy snapshot
    const snapshotRaw = localStorage.getItem(persistenceKey());
    const snapshot = snapshotRaw ? JSON.parse(snapshotRaw) : { answers: state.answers };
    
    snapshot.updatedAt = Date.now();
    snapshot.uiState = safeState;
    localStorage.setItem(persistenceKey(), JSON.stringify(snapshot));
  } catch (e) {
    persistWriteFailed = true; // import 부분 성공 판정용(아래 importUserData 참고)
    console.error("saveUiState error", e);
  }
}, 500);

export const saveAnswers = debounce((answers: Record<string, string[]>) => {
  if (!useQuizStore.getState().activeProduct) return;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(answers));
    
    // update snapshot
    const snapshotRaw = localStorage.getItem(persistenceKey());
    if (snapshotRaw) {
      const snapshot = JSON.parse(snapshotRaw);
      snapshot.answers = answers;
      snapshot.updatedAt = Date.now();
      localStorage.setItem(persistenceKey(), JSON.stringify(snapshot));
    }
  } catch (e) {
    persistWriteFailed = true; // import 부분 성공 판정용
    console.error("saveAnswers error", e);
  }
}, 500);

// 백업 파일 스키마 버전(Phase 4) — 구조가 바뀌면 올린다. import는 이보다 높은(미래)
// 버전을 거부해 알 수 없는 구조가 절반만 적용되는 사고를 막는다(버전 없음 = 구버전, 허용).
const BACKUP_SCHEMA_VERSION = 1;

export async function exportUserData() {
  const state = useQuizStore.getState();
  const data = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    product: getActiveProduct(),
    state: {
      mode: state.mode,
      setId: state.setId,
      index: state.index,
      elapsedSeconds: state.elapsedSeconds,
      reviewIds: state.reviewIds,
      navCollapsed: state.navCollapsed
    },
    answers: state.answers,
    histories: state.histories,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${getActiveProduct()}_backup_${new Date().getTime()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 현재 상태(경과 시간 포함)를 즉시 영속화한다(숨김/언마운트 시점 저장, #71).
export function flushPersist() {
  const state = useQuizStore.getState();
  if (!state.activeProduct) return;
  saveUiState(state);
  saveAnswers(state.answers);
  saveUiState.flush();
  saveAnswers.flush();
}

export async function importUserData(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);
        if (!isPlainObject(data)) {
          console.error("백업 형식이 올바르지 않습니다(객체 아님) — 가져오기를 중단합니다.");
          resolve(false);
          return;
        }
        // 미래 스키마 버전 거부 — 알 수 없는 구조를 절반만 적용하는 것보다 안전하다.
        if (typeof data.schemaVersion === "number" && data.schemaVersion > BACKUP_SCHEMA_VERSION) {
          console.error(
            `백업 스키마 v${data.schemaVersion}은 이 앱 버전(v${BACKUP_SCHEMA_VERSION})보다 새롭습니다 — 앱을 업데이트한 뒤 가져오세요.`,
          );
          resolve(false);
          return;
        }
        const product = getActiveProduct();

        // 원자성(Phase 4): 실패할 수 있는 IndexedDB(이력) 커밋을 먼저 끝내고, 성공한 뒤에만
        // localStorage(UI 상태·답안)를 덮는다 — 역순이면 커밋 실패로 "실패" 토스트가 떠도
        // UI 상태·답안은 이미 백업본으로 바뀐 반쪽 적용 상태가 남는다.
        let importedHistories = 0;
        if (data.histories) {
          const db = await getDb();
          const tx = db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          // 손상·조작된 백업 항목을 정제해 걸러낸다(#P2-3 keyPath 누락 방어 포함).
          // 정제 없이 put하면 keyPath('id') 없는 항목이 동기 throw로 트랜잭션을 깨뜨리고,
          // 임의 필드가 상태에 유입돼 오답노트/통계 렌더 예외를 유발할 수 있다. 각 put도 예외 격리.
          Object.values(data.histories)
            .map(sanitizeHistory)
            .filter((h): h is ExamHistory => h !== null)
            .forEach((h) => {
              try { store.put(h); importedHistories += 1; } catch (err) { console.warn("이력 항목 건너뜀", err); }
            });
          // 복원이 DB를 읽기 전에 트랜잭션 커밋을 기다린다.
          // 쿼터 초과 등은 error가 아닌 abort로 온다 — 핸들러가 없으면 await가 영구 pending된다.
          const committed = await new Promise<boolean>((res) => {
            tx.oncomplete = () => res(true);
            tx.onerror = () => res(false);
            tx.onabort = () => res(false);
          });
          if (!committed) {
            // put 호출 수(importedHistories)와 무관하게 커밋이 실패하면 아무것도 저장되지
            // 않았고 localStorage도 아직 건드리지 않았다 — 온전한 실패로 처리한다.
            console.error("이력 트랜잭션 커밋 실패(쿼터 초과 등) — 가져오기를 실패로 처리합니다.");
            resolve(false);
            return;
          }
        }

        // 이력 커밋 성공 후에만 localStorage 반영.
        // activeProduct를 함께 넣어 saveUiState의 early-return을 피하고, 즉시 flush로 디바운스 우회(#59).
        persistWriteFailed = false;
        if (data.state) {
          saveUiState({ ...data.state, activeProduct: product });
          saveUiState.flush();
        }
        if (data.answers) {
          // 원시 저장만 하고 실제 유입은 복원 단계의 sanitizeAnswers가 정제한다(종전 동작 동일).
          saveAnswers(data.answers as Record<string, string[]>);
          saveAnswers.flush();
        }
        if (persistWriteFailed) {
          // 이력은 커밋됐지만 UI 상태/답안 저장이 실패(쿼터 등)한 부분 성공 — 조용히
          // "완료"로 넘기지 않고 알린다(새로고침 시 이력은 유지, 풀던 위치·답안은 미복원).
          showToast('이력은 가져왔지만 풀이 상태 저장에 실패했습니다(저장 공간 부족 가능). 공간 확보 후 다시 시도하세요.', 'error');
        }

        console.info(`[data] 백업 가져오기 완료: ${file.name} · 이력 ${importedHistories}건`);
        // 세션 채점 캐시 무효화 — 백업에는 graded가 없으므로 보존하면 가져온 미채점
        // 답안이 '채점됨'으로 표시된다. 무효화 후 복원하면 온전한 미채점 상태로 유입.
        invalidateSessionRestoreCache(product);
        await restorePersistentSnapshot(product);
        resolve(true);
      } catch (err) {
        console.error("Import failed", err);
        resolve(false);
      }
    };
    // 읽기 실패(권한·디스크 오류 등) 시에도 반드시 resolve해 호출부 토스트가 뜨게 한다.
    reader.onerror = () => {
      console.error("Import file read failed", reader.error);
      resolve(false);
    };
    reader.readAsText(file);
  });
}

useQuizStore.subscribe((state, prevState) => {
  if (!state.activeProduct) return;
  
  if (
    // elapsedSeconds는 매 초 바뀌므로 제외(초당 localStorage 쓰기 방지, #71).
    // 경과 시간은 다른 상태 변경 시점과 flushPersist(숨김/언마운트)에 함께 저장된다.
    state.mode !== prevState.mode ||
    state.setId !== prevState.setId ||
    state.index !== prevState.index ||
    state.reviewIds !== prevState.reviewIds ||
    state.navCollapsed !== prevState.navCollapsed
  ) {
    saveUiState(state);
  }
  
  if (state.answers !== prevState.answers) {
    saveAnswers(state.answers);
  }
});
