import type { QuizSnapshot, QuizUiState, SavedAnswer } from "./quiz.types";

const DB_NAME = "istqb-quiz";
const STORE_NAME = "snapshots";
const SNAPSHOT_KEY = "current";
const LOCAL_FALLBACK_KEY = "istqb.react.snapshot.v1";

const defaultUiState: QuizUiState = {
  activeProduct: null,
  selectedSetId: null,
  currentQuestionId: null,
  mode: "practice",
  timerStartedAt: null,
  elapsedMs: 0,
  updatedAt: 0,
};

export const createEmptySnapshot = (): QuizSnapshot => ({
  schemaVersion: 1,
  answers: {},
  uiState: { ...defaultUiState },
});

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = fn(tx.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

export async function loadSnapshot(): Promise<QuizSnapshot> {
  try {
    return (await withStore<QuizSnapshot>("readonly", (store) => store.get(SNAPSHOT_KEY))) ?? createEmptySnapshot();
  } catch {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    return raw ? JSON.parse(raw) : createEmptySnapshot();
  }
}

export async function saveSnapshot(snapshot: QuizSnapshot): Promise<void> {
  const next = { ...snapshot, uiState: { ...snapshot.uiState, updatedAt: Date.now() } };
  try {
    await withStore<IDBValidKey>("readwrite", (store) => store.put(next, SNAPSHOT_KEY));
  } catch {
    localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(next));
  }
}

export const answerKey = (answer: SavedAnswer) => `${answer.questionId}-${answer.mode}`;
