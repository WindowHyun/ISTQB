import { useState, useEffect } from 'react';
import { useQuizStore } from '../store/useQuizStore';

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

// setId별 로드된 문항 캐시(appData 객체를 변형하지 않음).
const questionCache: Record<string, Question[]> = {};

// 랜덤 모드의 현재 추첨(모듈 공유). 두 가지를 보장한다:
// 1) 채점(setReviewIds)으로 effect가 재실행돼도 재추첨하지 않음 — 재추첨되면
//    채점 화면·점수가 새 추첨 기준으로 뒤바뀐다.
// 2) 이 훅을 쓰는 모든 컴포넌트(사이드바·워크스페이스·팔레트)가 동일한 추첨을 공유.
// 랜덤 모드를 벗어나면 폐기되어 다음 진입 때 새로 뽑는다.
let randomDraw: { setId: string; questions: Question[] } | null = null;

export function useQuestions() {
  const [appData, setAppData] = useState<AppData | null>(null);
  const [currentQuestions, setCurrentQuestions] = useState<Question[]>([]);
  const { setId, mode, reviewIds } = useQuizStore();

  useEffect(() => {
    fetch('data/index.json')
      .then((res) => res.json())
      .then((data: AppData) => setAppData(data))
      .catch((err) => console.error('Failed to load index.json', err));
  }, []);

  useEffect(() => {
    // 랜덤 모드를 벗어나면 추첨을 버려 다음 진입 때 새로 뽑는다.
    if (mode !== 'random') randomDraw = null;

    if (!appData || !setId) return;

    const targetSet = appData.sets.find((s) => s.id === setId);
    if (!targetSet) return;

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

    if (questionCache[setId]) {
      applyMode(questionCache[setId]);
      return;
    }

    const path = targetSet.path.replace(/^\.\//, '');
    fetch(`data/${path}`)
      .then((res) => res.json())
      .then((data) => {
        // 세트 파일은 { meta, questions: [...] } 형태(혹은 배열 자체).
        const questions: Question[] = Array.isArray(data) ? data : data?.questions || [];
        questionCache[setId] = questions;
        applyMode(questions);
      })
      .catch((err) => console.error('Failed to load set', err));
  }, [appData, setId, mode, reviewIds]);

  return { appData, currentQuestions };
}
