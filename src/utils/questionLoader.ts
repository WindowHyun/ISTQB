import type { AppData, Question } from '../hooks/useQuestions';

// 문제 데이터 공용 로더 — index.json·세트 JSON fetch의 단일 진입점.
// Promise를 캐시해 (1) 동시 마운트된 여러 훅 인스턴스의 중복 요청을 합치고
// (2) useQuestions/오답노트/세트 문항수(useSetCounts)가 같은 세트를 각자
// 다시 내려받던 3중 캐시를 하나로 통합한다. 실패한 Promise는 캐시에서 비워
// 다음 호출이 재시도할 수 있게 한다.

const jsonPromises: Record<string, Promise<unknown>> = {};
const loadListeners = new Set<() => void>();

// 배포 base 경로 기준 절대 URL — 상대경로('data/…')는 서브패스 배포에서 페이지 URL에
// 따라 다른 리소스를 가리키고 SW precache 키(/base/data/…)와 어긋난다.
const BASE = import.meta.env.BASE_URL || '/';
const dataUrl = (rel: string) => `${BASE}${rel}`;

// 로드 알림 코얼레싱 — 초기 진입 시 세트 N개가 연달아 로드되면 리스너(구독 훅)들이
// N번 재실행되며 재렌더가 증폭된다. 마이크로태스크 안에서 한 번으로 합친다.
let notifyScheduled = false;
function notifyLoadListeners() {
  if (notifyScheduled) return;
  notifyScheduled = true;
  queueMicrotask(() => {
    notifyScheduled = false;
    loadListeners.forEach((l) => l());
  });
}

// 로드 "성공"을 구독자에게 알린다. useQuestions는 인스턴스마다 마운트되므로
// 한 인스턴스의 "다시 시도"가 성공했을 때 나머지 인스턴스(사이드바·상단바 등)도
// 이 알림을 받아 캐시에서 같은 결과를 다시 읽어 화면을 복구한다.
export function subscribeLoads(listener: () => void): () => void {
  loadListeners.add(listener);
  return () => { loadListeners.delete(listener); };
}

// 성공 로그의 요약부(세트/문항 수). 화면 콘솔(?debug)에서 실기기 진단용으로 쓴다 —
// "느린 건지, 안 오는 건지, 빈 데이터인지"를 한 줄로 구분하게 해 준다.
function summarizeIndex(data: unknown): string {
  const sets = (data as AppData | null)?.sets;
  return `세트 ${Array.isArray(sets) ? sets.length : 0}개`;
}

function summarizeSet(data: unknown): string {
  const questions = Array.isArray(data)
    ? data
    : (data as { questions?: unknown[] } | null)?.questions;
  return `문항 ${Array.isArray(questions) ? questions.length : 0}개`;
}

function fetchJsonCached(url: string, summarize?: (data: unknown) => string): Promise<unknown> {
  if (!jsonPromises[url]) {
    const started = performance.now();
    const p = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
    p.then(
      (data) => {
        // 이 then은 실제 네트워크 요청당 1회만 실행된다(캐시 히트는 내부 then이 없음) —
        // 성공 로그가 호출자 수만큼 중복되지 않는다.
        const ms = Math.round(performance.now() - started);
        console.info(`[data] 로드 완료: ${url} (${ms}ms)${summarize ? ` · ${summarize(data)}` : ''}`);
        notifyLoadListeners();
      },
      // 실패는 캐시에서 비운다 — 새 요청이 이미 캐시를 교체했을 수 있어 동일성 확인.
      () => { if (jsonPromises[url] === p) delete jsonPromises[url]; },
    );
    jsonPromises[url] = p;
  }
  return jsonPromises[url];
}

export function loadIndex(): Promise<AppData> {
  return fetchJsonCached(dataUrl('data/index.json'), summarizeIndex) as Promise<AppData>;
}

// 로드 완료된 세트의 결과 캐시(정규화된 경로 키) — peekSetQuestions의 동기 반환용.
const questionArrays: Record<string, Question[]> = {};

function normalizePath(path: string): string {
  return path.replace(/^\.\//, '');
}

// 캐시 키는 실제 리소스(경로) 기준 — setId 키와 달리 (setId, path) 쌍의
// 불일치(데이터 버전 전환 등)로 다른 파일의 캐시를 돌려줄 여지가 없다.
export function loadSetQuestions(path: string): Promise<Question[]> {
  const key = normalizePath(path);
  return fetchJsonCached(dataUrl(`data/${key}`), summarizeSet).then((data) => {
    // 세트 파일은 { meta, questions: [...] } 형태(혹은 배열 자체).
    const questions: Question[] = Array.isArray(data)
      ? data
      : (data as { questions?: Question[] })?.questions || [];
    questionArrays[key] = questions;
    return questions;
  });
}

// 이미 로드 완료된 세트면 동기 반환 — 오답노트 재진입 시 로딩 프레임 없이 즉시 렌더.
export function peekSetQuestions(path: string): Question[] | null {
  return questionArrays[normalizePath(path)] ?? null;
}
