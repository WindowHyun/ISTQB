import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../store/useQuizStore';
import { loadIndex, loadSetQuestions, subscribeLoads } from '../utils/questionLoader';

// Fisher–Yates shuffle: 균일 분포를 보장한다. (sort 비교자에 Math.random을 쓰면 편향됨)
function shuffleQuestions<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// stem/explanation은 ContentBlock[] 또는 문자열일 수 있다(RichText가 둘 다 처리).
export interface Question {
  id?: string;
  number: number;
  type?: string;
  stem: unknown;
  options: { key: string; text: string }[];
  answer: string[];
  explanation?: unknown;
  figure?: string | null;
  // 대단원 분류(Phase 0, 약점 분석용). taxonomy.json의 챕터명 또는 null(미태깅).
  chapter?: string | null;
  // 세부 주제 태그(향후 확장). 현재는 비어 있을 수 있음.
  tags?: string[];
  difficulty?: string;
}

// index.json의 세트 요약(평면 배열, certification 포함).
export interface SetSummary {
  id: string;
  certification: string;
  title: string;
  path: string;
  legacySetId?: string;
}

export interface AppData {
  schemaVersion?: number;
  sets: SetSummary[];
}

// 랜덤 모드의 현재 추첨(모듈 공유). 두 가지를 보장한다:
// 1) 채점(setReviewIds)으로 effect가 재실행돼도 재추첨하지 않음 — 재추첨되면
//    채점 화면·점수가 새 추첨 기준으로 뒤바뀐다.
// 2) 이 훅을 쓰는 모든 컴포넌트(사이드바·워크스페이스·팔레트)가 동일한 추첨을 공유.
// 랜덤 모드를 벗어나면 폐기되어 다음 진입 때 새로 뽑는다.
let randomDraw: { setId: string; questions: Question[] } | null = null;

export function useQuestions() {
  const [appData, setAppData] = useState<AppData | null>(null);
  const [currentQuestions, setCurrentQuestions] = useState<Question[]>([]);
  // 로드 실패 사용자 노출용(무한 스켈레톤 방지). retryLoad로 재시도한다.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // 슬라이스 구독(O1) — 타이머 틱·답안 변경에 이 훅이 리렌더를 유발하지 않는다.
  const { setId, mode, reviewIds } = useQuizStore(useShallow((s) => ({
    setId: s.setId, mode: s.mode, reviewIds: s.reviewIds,
  })));

  // 다른 인스턴스의 "다시 시도"가 성공하면 이 인스턴스도 캐시에서 다시 읽어 복구한다 —
  // 없으면 재시도 버튼이 있는 워크스페이스만 살아나고 사이드바·상단바는 빈 채로 남는다.
  useEffect(() => subscribeLoads(() => setReloadKey((k) => k + 1)), []);

  useEffect(() => {
    let cancelled = false;
    // 공용 로더(Promise 캐시) — 여러 훅 인스턴스가 동시에 마운트돼도 요청은 1회다.
    loadIndex()
      .then((data) => {
        if (cancelled) return;
        setLoadError(null);
        setAppData(data);
      })
      .catch((err) => {
        console.error('Failed to load index.json', err);
        if (!cancelled) setLoadError('문제 목록을 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.');
      });
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => {
    // 랜덤 모드를 벗어나면 추첨을 버려 다음 진입 때 새로 뽑는다.
    if (mode !== 'random') randomDraw = null;

    if (!appData || !setId) return;

    const targetSet = appData.sets.find((s) => s.id === setId);
    if (!targetSet) return;

    // 세트를 빠르게 전환하면 이전 요청이 늦게 도착해 현재 세트의 문항을
    // 덮어쓸 수 있다 — cleanup으로 이전 effect의 응답 반영을 취소한다.
    let cancelled = false;

    function applyMode(questions: Question[]) {
      if (mode === 'random') {
        if (randomDraw?.setId === setId) {
          setCurrentQuestions(randomDraw.questions);
          return;
        }
        const shuffled = shuffleQuestions(questions);
        const take = Math.min(40, shuffled.length);
        const drawn = shuffled.slice(0, take);
        randomDraw = { setId, questions: drawn };
        setCurrentQuestions(drawn);
      } else if (mode === 'review') {
        // 시험·랜덤 각각의 오답 합집합(+구버전 setId 단독 키 호환)을 복습 대상으로 한다.
        const ids = new Set([
          ...(reviewIds[`${setId}-exam`] || []),
          ...(reviewIds[`${setId}-random`] || []),
          ...(reviewIds[setId] || []),
        ]);
        const reviews = questions.filter((q) => ids.has(q.id || `legacy-${q.number}`));
        setCurrentQuestions(reviews);
      } else {
        setCurrentQuestions(questions);
      }
    }

    loadSetQuestions(targetSet.path)
      .then((questions) => {
        if (cancelled) return;
        setLoadError(null);
        applyMode(questions);
      })
      .catch((err) => {
        console.error('Failed to load set', err);
        if (cancelled) return;
        setLoadError('문제 세트를 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.');
        // 이전 세트의 문항을 남기면 새 setId 아래 옛 문항이 표시되고
        // 답안이 새 세트 키로 저장돼 데이터가 오염된다 — 비워서 에러 UI로 전환한다.
        setCurrentQuestions([]);
      });
    return () => { cancelled = true; };
  }, [appData, setId, mode, reviewIds, reloadKey]);

  // 실패 배너의 "다시 시도" — 에러를 지우고 두 로드 effect를 재실행한다.
  const retryLoad = () => {
    setLoadError(null);
    setReloadKey((k) => k + 1);
  };

  return { appData, currentQuestions, loadError, retryLoad };
}
