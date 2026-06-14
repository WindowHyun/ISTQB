import { useState, useEffect } from 'react';
import { useQuizStore } from '../store/useQuizStore';

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
        const shuffled = [...questions].sort(() => Math.random() - 0.5);
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
