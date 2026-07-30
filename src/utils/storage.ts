import { useQuizStore, QuizState, QuizMode, ExamHistory, sessionScopeDefaults, PLAY_MODES } from '../store/useQuizStore';
import debounce from 'lodash-es/debounce';
import { showToast } from './toast';
import { answerKeyPrefix, gradeKeyFor } from './answerKey';

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

// 삭제 성공 여부를 돌려준다 — 호출부가 "DB가 실제로 지워진 뒤에만" 메모리를 지우게 한다.
async function deleteHistoriesFromDB(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
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
    return true;
  } catch (err) {
    // 실패를 삼키면 UI(메모리)는 지워졌는데 새로고침 후 이력이 되살아나는 무통지 불일치가 된다.
    console.error("IndexedDB delete failed", err);
    showToast("이력 삭제에 실패했습니다.", "error");
    return false;
  }
}

// 이력 삭제 단일 진입점 — 메모리(store)와 IndexedDB를 반드시 함께 지운다.
// 한쪽만 지우는 호출부 실수는 "새로고침하면 삭제한 이력이 되살아나는" 버그 클래스를
// 재발시키므로, 호출부는 이 함수만 사용한다.
// 순서: 영속(DB)을 먼저 지우고 성공했을 때만 메모리를 지운다 — 반대로 하면 DB 실패 시
// 화면에서는 사라졌는데 새로고침하면 되살아나는 상태가 남는다.
// 반환값으로 성공 여부를 알려 호출부가 완료 안내를 조건부로 띄우게 한다.
export async function removeHistoriesEverywhere(ids: string[]): Promise<boolean> {
  const ok = await deleteHistoriesFromDB(ids);
  if (ok) useQuizStore.getState().removeHistories(ids);
  return ok;
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
// 'quick'이 빠지면 퀵 회차의 mode가 아래에서 'exam'으로 보정돼, isSetLevelRound가
// 10~20문항짜리 짧은 회차를 세트 전체 실전으로 세고 최고 정답률·평균을 부풀린다
// (예전에 고친 "챕터 미니 시험이 최고 정답률을 부풀림"과 같은 결함). 계약은 단위 테스트로 고정.
// 목록을 여기서 다시 적지 않는다 — 스토어의 PLAY_MODES가 단일 원천이다(둘이 갈리면
// 새 모드의 이력이 조용히 exam으로 보정된다).
export const HISTORY_MODES: QuizMode[] = [...PLAY_MODES];
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
  // 챕터 미니 시험 표식 — 없으면 세트 전체 회차(구버전 포함)로 취급된다.
  if (typeof value.chapter === "string" && value.chapter) out.chapter = value.chapter;
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
  if (isPlainObject(value.chapterQuestions)) {
    // 챕터별 문항 id 목록 — 최신 시도 집계의 입력이다. 문자열 id만 통과시키고,
    // 같은 회차 안에서 정답/오답 양쪽에 든 id는 오답으로 본다(모순 데이터는 보수적으로).
    const chapterQuestions: Record<string, { ok: string[]; no: string[] }> = {};
    for (const [ch, cell] of Object.entries(value.chapterQuestions)) {
      if (ch === "__proto__" || ch === "constructor" || ch === "prototype") continue;
      if (!isPlainObject(cell)) continue;
      const no = stringArray(cell.no);
      const wrong = new Set(no);
      const ok = stringArray(cell.ok).filter((id) => !wrong.has(id));
      if (ok.length || no.length) chapterQuestions[ch] = { ok, no };
    }
    if (Object.keys(chapterQuestions).length) out.chapterQuestions = chapterQuestions;
  }
  // CSTS 합격 판정과 통계의 표시 %는 채점 시점 가중 점수 스냅샷을 쓴다
  // (attemptStats.attemptRatePercent, chapterStats의 가중 집계). 여기서 흘리면
  // 채점 직후에는 맞다가 새로고침 뒤 통계만 단순 정답률로 떨어져, 같은 회차가
  // 결과 모달과 통계에서 다른 %로 보인다. correct/total과 같은 규칙으로 정제한다 —
  // 음수·비유한 거부, maxScore 0 폐기(0으로 나누면 NaN%가 화면에 뜬다),
  // 얻은 점수는 만점으로 클램프.
  if (isPlainObject(value.cstsWeighted)) {
    const score = finiteNumber(value.cstsWeighted.score);
    const maxScore = finiteNumber(value.cstsWeighted.maxScore);
    if (score !== undefined && maxScore !== undefined && score >= 0 && maxScore > 0) {
      out.cstsWeighted = { score: Math.min(score, maxScore), maxScore };
    }
  }
  if (Array.isArray(value.wrongItems)) {
    out.wrongItems = value.wrongItems
      .filter(isPlainObject)
      .filter((it) => typeof it.number === "number" && Number.isFinite(it.number))
      .map((it) => {
        const item: NonNullable<ExamHistory["wrongItems"]>[number] = {
          number: it.number as number,
          myAnswer: stringArray(it.myAnswer),
          correctAnswer: stringArray(it.correctAnswer),
        };
        // 퀵 회차의 setId는 'QUICK'이라는 가짜 세트라, 오답이 실제로 어느 세트에서
        // 나왔는지는 이 항목별 setId에만 남는다. allowlist에서 빠뜨리면 이 필드가
        // 사라지는데, loadHistoriesFromDB가 읽을 때마다 정제하므로 새로고침 한 번에
        // 오답노트가 '퀵 랜덤' 한 덩어리로 뭉치고 세트 간 번호 충돌로 항목이 서로를
        // 덮어쓴다. 없는 경우(일반 회차)는 만들어 붙이지 않는다 — 호출부가
        // `it.setId ?? h.setId`로 회차 setId를 폴백하기 때문이다.
        if (typeof it.setId === "string" && it.setId) item.setId = it.setId;
        return item;
      });
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
  // 음수를 막는다 — 바로 위 index와 같은 이유다. 경과 시간이 음수면 시험 남은 시간이
  // 제한시간보다 커진다(가져오기로 유입 가능한 값이다).
  if (typeof value.elapsedSeconds === "number" && Number.isFinite(value.elapsedSeconds)
      && value.elapsedSeconds >= 0) {
    out.elapsedSeconds = value.elapsedSeconds;
  }
  if (typeof value.navCollapsed === "boolean") out.navCollapsed = value.navCollapsed;
  // 오답 재풀이로 맞힌 문항 — 복원하지 않으면 새로고침마다 재풀이 목록이 원상복구된다.
  if (isPlainObject(value.reviewedOk)) {
    const ok: Record<string, number[]> = {};
    for (const [key, v] of Object.entries(value.reviewedOk)) {
      if (Array.isArray(v)) {
        const nums = v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
        if (nums.length) ok[key] = nums;
      }
    }
    out.reviewedOk = ok;
  }
  // 시험 응시 시작 시각 — 제한시간의 기준점이라 반드시 복원한다(앱을 껐다 켜도 시계가 이어지게).
  if (isPlainObject(value.examStartedAt)) {
    const at: Record<string, number> = {};
    for (const [key, v] of Object.entries(value.examStartedAt)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) at[key] = v;
    }
    out.examStartedAt = at;
  }
  // 채점 상태(graded)는 일부러 복원하지 않는다 — 재접속/모드 복귀 시 시험은 다시 풀 수 있게 초기화(#1).
  if (isPlainObject(value.reviewIds)) {
    const reviewIds: Record<string, string[]> = {};
    for (const [key, ids] of Object.entries(value.reviewIds)) {
      if (Array.isArray(ids)) reviewIds[key] = stringArray(ids);
    }
    out.reviewIds = reviewIds;
  }
  // 챕터 필터 — 비어 있지 않은 문자열만 통과(없으면 전체).
  if (typeof value.chapterFilter === 'string' && value.chapterFilter) {
    out.chapterFilter = value.chapterFilter;
  }
  // 퀵 추첨 스냅샷 — 제품과 (문항 id, 출처 세트) 쌍이 온전할 때만 통과(손상·조작 값 방어).
  // 출처 세트가 없으면 오답 귀속과 복원이 성립하지 않으므로 그 항목은 버린다.
  if (Array.isArray(value.quickRounds)) {
    // 이력과 같은 정제기를 태운다(같은 모양이므로) — 만료 판정은 읽는 쪽에서 한다.
    const rounds = value.quickRounds.map(sanitizeHistory).filter((h): h is ExamHistory => h !== null);
    if (rounds.length) out.quickRounds = rounds;
  }
  if (isPlainObject(value.quickDraw)) {
    const qd = value.quickDraw as UnknownRecord;
    const rawItems = Array.isArray(qd.items) ? qd.items : [];
    const items: { id: string; setId: string }[] = [];
    for (const it of rawItems) {
      if (!isPlainObject(it)) continue;
      const id = it.id;
      const setId = it.setId;
      if (typeof id === 'string' && id && typeof setId === 'string' && setId) items.push({ id, setId });
    }
    if (typeof qd.certification === 'string' && qd.certification && items.length) {
      out.quickDraw = { certification: qd.certification, items };
    }
  }
  // 랜덤 추첨 스냅샷 — setId·ids가 유효할 때만 통과(손상 값 방어). chapter는 없으면 null(일반 랜덤).
  if (isPlainObject(value.randomDraw)) {
    const rd = value.randomDraw as UnknownRecord;
    const ids = stringArray(rd.ids);
    if (typeof rd.setId === 'string' && rd.setId && ids.length) {
      out.randomDraw = {
        setId: rd.setId,
        chapter: typeof rd.chapter === 'string' && rd.chapter ? rd.chapter : null,
        ids,
      };
    }
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

// 복원한 답안이 최신 채점 회차(같은 세트·모드·챕터)의 답안 스냅샷과 완전히 일치하면 그
// 회차를 돌려준다(아니면 null). 키 집합과 각 키의 선택 배열까지 비교한다 — 채점 이력의
// answers는 채점 시점 스냅샷이므로 "동일 = 아직 새 응시를 시작하지 않음(이미 채점 끝난 회차)".
export function findGradedRoundMatch(
  histories: Record<string, ExamHistory>,
  setId: string,
  mode: QuizMode,
  answers: Record<string, string[]>,
  chapter: string | null = null,
): ExamHistory | null {
  const latest = Object.values(histories)
    .filter((h) => h.setId === setId && h.mode === mode && (h.chapter ?? null) === chapter)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || b.id.localeCompare(a.id))[0];
  if (!latest || !latest.answers) return null;
  const prefix = answerKeyPrefix(setId, mode);
  const restored = Object.entries(answers).filter(([k]) => k.startsWith(prefix));
  const recorded = Object.entries(latest.answers).filter(([k]) => k.startsWith(prefix));
  if (!restored.length || restored.length !== recorded.length) return null;
  const recordedMap = new Map(recorded);
  for (const [k, v] of restored) {
    const rv = recordedMap.get(k);
    if (!rv || rv.length !== v.length || rv.some((x, i) => x !== v[i])) return null;
  }
  return latest;
}

// 시험 전용 래퍼(기존 호출부 유지) — 세트 전체 시험 회차(챕터 없음)만 대상.
export function findGradedExamMatch(
  histories: Record<string, ExamHistory>,
  setId: string,
  answers: Record<string, string[]>,
): ExamHistory | null {
  return findGradedRoundMatch(histories, setId, 'exam', answers, null);
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
      // 세션 스코프 기본값(목록의 단일 원천은 스토어의 sessionScopeDefaults)을 깔아
      // 이전 제품의 상태가 새 제품으로 새어들지 않게 하고, 이 제품의 값으로 덮는다.
      ...sessionScopeDefaults(),
      // 채점 상태: 같은 제품 게이트 왕복이면 세션 값 유지, 제품 재방문이면 세션 캐시 복원 —
      // 소거하면 '채점하기'가 재노출돼 동일 답안 재채점으로 회차가 중복 적재된다.
      graded: sameProductRevisit
        ? useQuizStore.getState().graded
        : (sessionGraded[activeProduct] ?? {}),
      examStarted: restoredExamStarted,
      ...restoredUi,
      answers: sanitizedAnswers,
      histories,
      activeProduct, // ensure it's set
    });
    // 복원 직후의 답안이 '이 탭이 아는 전부'다 — 이후 삭제 판정의 기준선.
    resetWriteBaseline(sanitizedAnswers);
    // 성공 경로 진단 로그(화면 콘솔 ?debug용) — "복원은 됐는데 데이터가 이상하다"류
    // 문의에서 무엇이 몇 건 복원됐는지를 실기기에서 바로 확인할 수 있게 한다.
    console.info(
      `[data] 복원 완료: ${activeProduct} · 이력 ${Object.keys(histories).length}건 · 답안 ${Object.keys(sanitizedAnswers).length}건`,
    );
    const sid = restoredUi.setId ?? '';
    const m = restoredUi.mode;
    const store = useQuizStore.getState();
    if (m === 'random') {
      // 저장된 추첨(뽑힌 문항 id)이 있으면 새로고침이라도 같은 문항으로 이어푼다 —
      // 답안은 문항 id로 저장되므로 위치·답안이 그대로 유지된다(우발적 새로고침 진행 유실 방지).
      const draw = restoredUi.randomDraw;
      const canResume = !!draw && draw.setId === sid && draw.ids.length > 0;
      if (canResume) {
        // 이미 채점을 마친 랜덤 회차의 답안이면 이어풀기로 복원하지 않는다 — 같은 답안
        // 재채점 시 회차가 중복 적립된다(graded는 비영속이라 새로고침 후 미채점처럼 보임).
        // 기존 정책대로 답안·추첨을 비워 새로 시작한다.
        const gradedRound = findGradedRoundMatch(histories, sid, 'random', sanitizedAnswers, draw!.chapter ?? null);
        if (gradedRound) {
          store.clearAnswers(sid, 'random');
          store.setRandomDraw(null);
          store.setIndex(0);
          store.setResumePrompt(false);
          store.setResumeNotice(false);
        } else {
          // 진행 중(미채점) — 같은 추첨으로 이어푼다. 미니 시험(챕터 스코프)이면 챕터 필터도
          // 복원해 추첨 스코프를 맞춘다(chapterFilter는 비영속이라 여기서 draw 정보로 되살린다).
          if (draw!.chapter) store.setChapterFilter(draw!.chapter);
          store.setResumePrompt(false);
          // 첫 문항이 아니면 이어풀기 위치 배너를 띄운다(#A).
          store.setResumeNotice((restoredUi.index ?? 0) > 0);
        }
      } else {
        // 저장된 추첨이 없으면(구버전/최초 진입) 기존 정책대로 새로 추첨한다.
        const hadRandomProgress = Object.keys(sanitizedAnswers).some((k) =>
          k.startsWith(`${sid}-random-`),
        );
        store.clearAnswers(sid, 'random');
        store.setRandomDraw(null);
        store.setIndex(0);
        store.setResumePrompt(false);
        store.setResumeNotice(false);
        // 무통보 초기화 방지 — 진행이 실제로 사라진 경우에만 정책을 1회 안내한다.
        if (hadRandomProgress) {
          showToast('랜덤은 접속할 때마다 새로 추첨돼요 — 이전 진행은 초기화되었습니다.', 'info');
        }
      }
    } else {
      // 시험 모드로 복원했고 이전 답안이 남아 있으면 "이어풀기/새로 풀기" 선택 모달을 띄운다.
      const hasExamProgress =
        m === 'exam' &&
        Object.keys(sanitizedAnswers).some((k) => k.startsWith(`${sid}-${m}-`));
      // 복원한 시험 답안이 "최신 채점 회차의 답안"과 동일하면 이미 채점을 마친 회차다 —
      // graded는 비영속(#1)이라 새로고침 후 미채점처럼 보이고, 이어풀기→재채점하면
      // 같은 답안이 중복 회차로 적립된다. 채점 상태를 복원하고 전용 안내 모달로 분기한다.
      // (채점 후 시험 답안은 잠금돼 변할 수 없으므로 "답안 동일 = 그 회차 그대로"가 성립)
      const gradedMatch =
        hasExamProgress && !store.graded[gradeKeyFor(sid, "exam")]
          ? findGradedExamMatch(histories, sid, sanitizedAnswers)
          : null;
      if (gradedMatch) {
        useQuizStore.getState().setGraded(`${sid}-exam`, true);
        useQuizStore.getState().setGradedResume({
          correct: gradedMatch.correct ?? null,
          total: gradedMatch.total ?? null,
        });
        store.setResumePrompt(false);
        store.setResumeNotice(false);
      } else {
        store.setResumePrompt(hasExamProgress);
        // 선택 모달이 뜨는 경우엔 위치 배너는 띄우지 않는다(중복 방지). 그 외엔 첫 문항이 아니면 배너(#A).
        store.setResumeNotice(!hasExamProgress && (restoredUi.index ?? 0) > 0);
      }
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
      navCollapsed: state.navCollapsed,
      // 랜덤 추첨(뽑힌 문항 id) — 새로고침 시 같은 문항으로 이어풀기 위해 영속화.
      randomDraw: state.randomDraw,
      // 퀵 추첨 — 없으면 새로고침 시 다시 뽑혀 풀던 문항과 답안이 사라진다.
      quickDraw: state.quickDraw,
      // 챕터 집중 연습/미니 시험의 필터 — 영속화하지 않으면 새로고침 시 전체 세트로
      // 돌아가 랜덤(이어풀기)과 동작이 어긋난다. 배너의 '전체 보기'로 언제든 해제 가능.
      chapterFilter: state.chapterFilter,
      // 시험 제한시간의 기준점 — 저장하지 않으면 앱을 껐다 켠 시간이 경과에서 빠져
      // 제한시간을 무한히 늘릴 수 있다.
      examStartedAt: state.examStartedAt,
      // 오답 재풀이 진척 — 저장하지 않으면 새로고침마다 복습이 헛일이 된다.
      reviewedOk: state.reviewedOk,
      // 퀵 회차(24시간 임시). 이력(IndexedDB)이 아니라 여기 둔다 — 퀵은 회차 기록을
      // 남기지 않는 모드라 영구 저장소에 넣으면 사양과 모순된다.
      // 내보내기(exportUserData)에는 넣지 않는다: 복원 시점엔 이미 만료됐을 값이다.
      quickRounds: state.quickRounds,
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

// 멀티탭 답안 유실 방지의 핵심 규칙: localStorage가 공유 진실이다.
// 종전에는 자기 메모리의 answers를 통째로 덮어써, 탭 두 개를 쓰면 나중에 저장한 탭이
// 앞선 탭의 답안을 지웠다(양쪽 다 유실을 모름). 이제 쓰기 전에 저장된 값과 합집합을
// 만든다 — 다른 탭이 먼저 넣은 문항이 살아남는다.
// 단, '삭제'(초기화·응시 포기)는 합치면 되살아나므로 그때만 통째로 교체한다.
// 삭제 여부는 호출부(구독)가 키가 줄었는지로 판정해 알려준다.
// 내용이 같은지 비교한다. 참조만 보면 mergeWithStored가 매번 새 객체를 만들어
// setState → 구독 → 재저장이 끝없이 도는 피드백 루프가 생긴다(실제로 발생시킨 버그).
function sameAnswers(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => {
    const x = a[k];
    const y = b[k];
    return Array.isArray(y) && x.length === y.length && x.every((v, i) => v === y[i]);
  });
}

// 이 탭이 마지막으로 저장한 내용(제품 키별). 삭제를 알아보기 위한 기준선이다.
// 저장소에는 있는데 여기에 없는 키 = 다른 탭이 새로 넣은 것(보존),
// 여기에는 있는데 지금 메모리에 없는 키 = 내가 지운 것(되살리지 않음).
let lastWritten: Record<string, string[]> = {};
let lastWrittenKey = '';

/** 복원 직후의 기준선 설정 — 이 시점의 답안이 '내가 아는 전부'다. */
function resetWriteBaseline(answers: Record<string, string[]>) {
  lastWrittenKey = storageKey();
  lastWritten = { ...answers };
}

// 다른 탭이 넣은 답안은 살리고, 내가 지운 답안은 되살리지 않는다.
// 종전에는 호출부가 넘기는 replace 플래그로 삭제를 구분했는데, flushPersist처럼
// 인자를 생략한 경로가 하나만 있어도 지운 답안이 통째로 부활했다(실제로 발생).
// 삭제 판정을 호출부가 아니라 기준선 비교로 옮겨 호출부와 무관하게 옳게 만든다.
function mergeWithStored(answers: Record<string, string[]>): Record<string, string[]> {
  try {
    const key = storageKey();
    if (key !== lastWrittenKey) resetWriteBaseline(answers); // 제품 전환 — 기준선 재설정
    const raw = localStorage.getItem(key);
    if (!raw) return answers;
    const stored = sanitizeAnswers(JSON.parse(raw));
    const merged: Record<string, string[]> = { ...answers };
    for (const k of Object.keys(stored)) {
      if (k in answers) continue;      // 내 값이 이긴다(나중 쓰기 우선)
      if (k in lastWritten) continue;  // 내가 지운 것 — 부활 금지
      merged[k] = stored[k];           // 다른 탭이 넣은 것 — 보존
    }
    return merged;
  } catch {
    return answers; // 저장값이 손상됐으면 내 것으로 간다
  }
}

export const saveAnswers = debounce((answers: Record<string, string[]>) => {
  if (!useQuizStore.getState().activeProduct) return;
  try {
    const merged = mergeWithStored(answers);
    // 내용이 같으면 메모리를 건드리지 않는다 — 참조만 바꾸면 구독이 다시 돌아
    // 저장이 무한 반복된다.
    const changed = !sameAnswers(merged, answers);
    const next = changed ? merged : answers;
    localStorage.setItem(storageKey(), JSON.stringify(next));
    resetWriteBaseline(next); // 다음 저장의 삭제 판정 기준
    // 다른 탭이 넣은 문항을 이 탭의 진행 표시에도 반영한다(내용이 실제로 늘었을 때만).
    if (changed) useQuizStore.setState({ answers: next });

    // update snapshot
    const snapshotRaw = localStorage.getItem(persistenceKey());
    if (snapshotRaw) {
      const snapshot = JSON.parse(snapshotRaw);
      snapshot.answers = next;
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
//
// v2: 회차 이력에 chapterQuestions(챕터별 정답/오답 문항 id)가 추가됐다. 버전을 올리는
// 이유는 이 필드가 구버전 앱에서 조용히 파괴되기 때문이다 — sanitizeHistory는 아는 필드만
// 골라 새 객체를 만드는 allowlist 방식이라 모르는 필드를 버리고, 가져오기는 그렇게 정제한
// 결과를 그대로 DB에 put한다. 즉 신버전 백업을 구버전 앱에서 한 번 가져오면 문항 id가
// 사라진 채 저장되고, 그 회차들은 이후 영영 '문항 정보 없는 과거 회차'로 남는다.
// 서비스 워커가 prompt 방식이라 사용자가 업데이트를 미룰 수 있어 구버전이 한동안 살아 있다.
// 버전을 올리면 구버전이 "앱을 업데이트한 뒤 가져오세요"로 거부한다 — 가져오지 못하는 쪽이
// 조용히 잃는 쪽보다 낫다. 구버전 백업(v1·버전 없음)을 신버전이 읽는 것은 그대로 된다.
const BACKUP_SCHEMA_VERSION = 2;

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
      navCollapsed: state.navCollapsed,
      randomDraw: state.randomDraw,
      quickDraw: state.quickDraw,
      chapterFilter: state.chapterFilter,
    },
    answers: state.answers,
    histories: state.histories,
  };
  const json = JSON.stringify(data, null, 2);
  const fileName = `${getActiveProduct()}_backup_${new Date().getTime()}.json`;

  // APK(Android WebView): 브라우저의 <a download> blob 다운로드는 WebView에서
  // 동작하지 않는다(다운로드 리스너 없음). MainActivity가 노출한 네이티브 브리지로
  // 공개 다운로드 폴더에 저장하고 결과를 토스트로 안내한다.
  const bridge = typeof window !== 'undefined' ? window.AndroidBackup : undefined;
  if (bridge && typeof bridge.saveBackup === 'function') {
    try {
      const res = JSON.parse(bridge.saveBackup(fileName, json)) as {
        ok: boolean; fileName?: string; location?: string; error?: string;
      };
      if (res.ok) {
        showToast(`백업을 저장했습니다 — ${res.location || res.fileName || fileName}`, 'success', 5000);
      } else {
        showToast(`백업 저장 실패: ${res.error || '알 수 없는 오류'}`, 'error', 5000);
      }
    } catch (e) {
      console.error('AndroidBackup.saveBackup error', e);
      showToast('백업 저장 중 오류가 발생했습니다.', 'error', 5000);
    }
    return;
  }

  // 웹(브라우저): blob 다운로드.
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
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

/** 가져오기 결과. 실패 사유를 호출부(토스트)까지 전달해 사용자가 무엇을 고칠지 알 수 있게 한다. */
export interface ImportResult {
  ok: boolean;
  /** 사용자에게 보여줄 실패 사유. 성공이면 없음. */
  reason?: string;
}

const PRODUCT_LABEL: Record<string, string> = { istqb: 'ISTQB', csts: 'CSTS' };

export async function importUserData(file: File): Promise<ImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);
        if (!isPlainObject(data)) {
          console.error("백업 형식이 올바르지 않습니다(객체 아님) — 가져오기를 중단합니다.");
          resolve({ ok: false, reason: '파일 형식이 올바르지 않습니다.' });
          return;
        }
        // 미래 스키마 버전 거부 — 알 수 없는 구조를 절반만 적용하는 것보다 안전하다.
        if (typeof data.schemaVersion === "number" && data.schemaVersion > BACKUP_SCHEMA_VERSION) {
          console.error(
            `백업 스키마 v${data.schemaVersion}은 이 앱 버전(v${BACKUP_SCHEMA_VERSION})보다 새롭습니다 — 앱을 업데이트한 뒤 가져오세요.`,
          );
          resolve({ ok: false, reason: '이 백업은 더 최신 버전 앱에서 만들어졌습니다. 앱을 업데이트해 주세요.' });
          return;
        }
        const product = getActiveProduct();
        // 제품이 다른 백업을 그대로 적용하면 현재 제품의 답안이 통째로 교체되고,
        // 가져온 이력은 certification 필터에 걸려 통계에도 안 보인다 — 무엇을 잃었는지
        // 알 수 없는 파괴다. 백업에는 export 시점에 product를 이미 기록해 두므로(위 exportUserData)
        // 읽어서 다르면 손대지 않고 거부한다.
        if (typeof data.product === 'string' && data.product !== product) {
          const from = PRODUCT_LABEL[data.product] ?? data.product;
          const to = PRODUCT_LABEL[product] ?? product;
          console.error(`백업 제품(${from})이 현재 제품(${to})과 다릅니다 — 가져오기를 중단합니다.`);
          resolve({
            ok: false,
            reason: `이 백업은 ${from} 기록입니다. ${from}으로 전환한 뒤 가져오세요.`,
          });
          return;
        }

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
            resolve({ ok: false, reason: '저장 공간이 부족해 가져오지 못했습니다.' });
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
        resolve({ ok: true });
      } catch (err) {
        console.error("Import failed", err);
        resolve({ ok: false, reason: '파일을 해석하지 못했습니다(형식 확인 필요).' });
      }
    };
    // 읽기 실패(권한·디스크 오류 등) 시에도 반드시 resolve해 호출부 토스트가 뜨게 한다.
    reader.onerror = () => {
      console.error("Import file read failed", reader.error);
      resolve({ ok: false, reason: '파일을 읽지 못했습니다.' });
    };
    reader.readAsText(file);
  });
}

// 다른 탭의 쓰기를 받아 이 탭의 메모리를 맞춘다.
// 쓰기 쪽(mergeWithStored)이 합집합을 만들어 저장하므로, 받는 쪽은 저장값을 그대로
// 진실로 받아들이면 두 탭이 같은 상태로 수렴한다. 구독이 없던 종전에는 두 탭이
// 조용히 갈라진 뒤 나중 쓰기가 앞선 답안을 지웠다.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    const store = useQuizStore.getState();
    if (!store.activeProduct) return;
    // 이 제품의 답안 키만 반응한다(다른 제품·다른 앱 키는 무시).
    if (e.key !== storageKey() || e.newValue == null) return;
    try {
      const incoming = sanitizeAnswers(JSON.parse(e.newValue));
      // 참조가 같으면 리렌더가 없으므로 내용 비교로 불필요한 갱신을 막는다.
      if (JSON.stringify(incoming) === JSON.stringify(store.answers)) return;
      useQuizStore.setState({ answers: incoming });
      resetWriteBaseline(incoming); // 채택한 값이 새 기준선(그 뒤 지우면 삭제로 인식)
      console.info('[data] 다른 탭의 답안 변경을 반영했습니다.');
    } catch {
      /* 손상된 값은 무시 — 다음 정상 쓰기에서 맞춰진다 */
    }
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
    state.navCollapsed !== prevState.navCollapsed ||
    state.randomDraw !== prevState.randomDraw ||
    state.quickDraw !== prevState.quickDraw ||
    state.chapterFilter !== prevState.chapterFilter ||
    // 시험 시작 시각이 잡히는 순간 즉시 저장한다 — 이걸 놓치면 앱을 껐다 켰을 때
    // 기준점이 없어 제한시간이 처음부터 다시 흐른다.
    state.examStartedAt !== prevState.examStartedAt ||
    state.reviewedOk !== prevState.reviewedOk
  ) {
    saveUiState(state);
  }
  
  if (state.answers !== prevState.answers) {
    saveAnswers(state.answers);
  }
});
