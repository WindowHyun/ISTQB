import type { AppData, Question } from '../hooks/useQuestions';

// 문제 데이터 공용 로더 — index.json·세트 JSON fetch의 단일 진입점.
// Promise를 캐시해 (1) 동시 마운트된 여러 훅 인스턴스의 중복 요청을 합치고
// (2) useQuestions/오답노트/세트 문항수(useSetCounts)가 같은 세트를 각자
// 다시 내려받던 3중 캐시를 하나로 통합한다. 실패한 Promise는 캐시에서 비워
// 다음 호출이 재시도할 수 있게 한다.

const jsonPromises: Record<string, Promise<unknown>> = {};
const loadListeners = new Set<() => void>();

// 로드 "성공"을 구독자에게 알린다. useQuestions는 인스턴스마다 마운트되므로
// 한 인스턴스의 "다시 시도"가 성공했을 때 나머지 인스턴스(사이드바·상단바 등)도
// 이 알림을 받아 캐시에서 같은 결과를 다시 읽어 화면을 복구한다.
export function subscribeLoads(listener: () => void): () => void {
  loadListeners.add(listener);
  return () => { loadListeners.delete(listener); };
}

function fetchJsonCached(url: string): Promise<unknown> {
  if (!jsonPromises[url]) {
    const p = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
    p.then(
      () => loadListeners.forEach((l) => l()),
      // 실패는 캐시에서 비운다 — 새 요청이 이미 캐시를 교체했을 수 있어 동일성 확인.
      () => { if (jsonPromises[url] === p) delete jsonPromises[url]; },
    );
    jsonPromises[url] = p;
  }
  return jsonPromises[url];
}

export function loadIndex(): Promise<AppData> {
  return fetchJsonCached('data/index.json') as Promise<AppData>;
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
  return fetchJsonCached(`data/${key}`).then((data) => {
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
