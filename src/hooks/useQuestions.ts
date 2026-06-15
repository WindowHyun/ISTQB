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

export interface Question {
  id?: string;
  number: number;
  type?: string;
  stem: string;
  options: { key: string; text: string }[];
  answer: string[];
  explanation?: string;
  figure?: string;
}

export interface SetData {
  id: string;
  title: string;
  file: string;
  questions?: Question[];
}

export interface AppData {
  istqb: { sets: SetData[] };
  csts: { sets: SetData[] };
}

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

    let targetSet: SetData | undefined;
    if (setId.startsWith('csts')) {
      targetSet = appData.csts.sets.find((s) => s.id === setId);
    } else {
      targetSet = appData.istqb.sets.find((s) => s.id === setId);
    }

    if (!targetSet) return;

    if (targetSet.questions) {
      applyMode(targetSet.questions);
    } else {
      fetch(`data/${targetSet.file}`)
        .then((res) => res.json())
        .then((data) => {
          targetSet!.questions = data;
          applyMode(data);
        })
        .catch((err) => console.error('Failed to load set', err));
    }

    function applyMode(questions: Question[]) {
      if (mode === 'random') {
        const shuffled = shuffleQuestions(questions);
        const take = Math.min(40, shuffled.length);
        setCurrentQuestions(shuffled.slice(0, take));
      } else if (mode === 'review') {
        const ids = reviewIds[setId] || [];
        const reviews = questions.filter((q) => ids.includes(q.id || `legacy-${q.number}`));
        setCurrentQuestions(reviews);
      } else {
        setCurrentQuestions(questions);
      }
    }
  }, [appData, setId, mode, reviewIds]);

  return { appData, currentQuestions };
}
