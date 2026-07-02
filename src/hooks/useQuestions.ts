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
    if (!appData || !setId) return;

    const targetSet = appData.sets.find((s) => s.id === setId);
    if (!targetSet) return;

    function applyMode(questions: Question[]) {
      if (mode === 'random') {
        const shuffled = shuffleQuestions(questions);
        const take = Math.min(40, shuffled.length);
        setCurrentQuestions(shuffled.slice(0, take));
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
