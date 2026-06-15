import { useQuizStore, QuizState, ExamHistory } from '../store/useQuizStore';
import debounce from 'lodash-es/debounce';

const DB_NAME = "istqb-db";
const STORE_NAME = "history";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
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
  return dbPromise;
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

export async function saveHistoryToDB(history: ExamHistory) {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(history);
  } catch (err) {
    console.error("IndexedDB save failed", err);
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
        request.result.forEach((h: ExamHistory) => {
          result[h.id] = h;
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

type UnknownRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 외부(localStorage/백업 파일) 값을 신뢰하지 않고 정제한다.
function sanitizeAnswers(value: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (!isPlainObject(value)) return result;
  for (const [key, choices] of Object.entries(value)) {
    if (Array.isArray(choices)) {
      const filtered = choices.filter((c): c is string => typeof c === "string");
      if (filtered.length) result[key] = filtered;
    }
  }
  return result;
}

const VALID_MODES = ["home", "exam", "practice", "random", "review"];

function sanitizeUiState(value: unknown): Partial<QuizState> {
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
  if (isPlainObject(value.reviewIds)) {
    const reviewIds: Record<string, string[]> = {};
    for (const [key, ids] of Object.entries(value.reviewIds)) {
      if (Array.isArray(ids)) {
        reviewIds[key] = ids.filter((id): id is string => typeof id === "string");
      }
    }
    out.reviewIds = reviewIds;
  }
  return out;
}

export async function restorePersistentSnapshot(activeProduct: 'istqb' | 'csts') {
  // temporarily set the product to fetch the correct keys
  useQuizStore.getState().setActiveProduct(activeProduct);
  
  try {
    let uiState = {};
    let answers = {};
    let histories = await loadHistoriesFromDB();
    
    // Legacy snapshot logic
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
    
    useQuizStore.getState().hydrate({
      ...sanitizeUiState(uiState),
      answers: sanitizeAnswers(answers),
      histories,
      activeProduct, // ensure it's set
    });
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
    console.error("saveAnswers error", e);
  }
}, 500);

export async function exportUserData() {
  const state = useQuizStore.getState();
  const data = {
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

export async function importUserData(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);
        
        if (data.state) saveUiState(data.state);
        if (data.answers) saveAnswers(data.answers);
        if (data.histories) {
          const db = await getDb();
          const tx = db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          Object.values(data.histories).forEach((h: ExamHistory) => store.put(h));
        }
        
        await restorePersistentSnapshot(getActiveProduct());
        resolve(true);
      } catch (err) {
        console.error("Import failed", err);
        resolve(false);
      }
    };
    reader.readAsText(file);
  });
}

useQuizStore.subscribe((state, prevState) => {
  if (!state.activeProduct) return;
  
  if (
    state.mode !== prevState.mode ||
    state.setId !== prevState.setId ||
    state.index !== prevState.index ||
    state.elapsedSeconds !== prevState.elapsedSeconds ||
    state.reviewIds !== prevState.reviewIds ||
    state.navCollapsed !== prevState.navCollapsed
  ) {
    saveUiState(state);
  }
  
  if (state.answers !== prevState.answers) {
    saveAnswers(state.answers);
  }
});
