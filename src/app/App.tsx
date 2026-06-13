import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";
import { QuestionCard } from "../components/quiz/QuestionCard";
import { QuestionNav } from "../components/quiz/QuestionNav";
import { ResultPanel } from "../components/quiz/ResultPanel";
import { loadQuestionIndex, loadQuestionSet } from "../features/quiz/quiz.loader";
import { answerKey, createEmptySnapshot, loadSnapshot, saveSnapshot } from "../features/quiz/quiz.storage";
import { clampQuestionIndex, toSavedAnswer } from "../features/quiz/quiz.utils";
import type { QuestionSet, QuestionSetSummary, QuizSnapshot } from "../features/quiz/quiz.types";

export function App() {
  const [sets, setSets] = useState<QuestionSetSummary[]>([]);
  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [selectedSetId, setSelectedSetId] = useState<string>();
  const [index, setIndex] = useState(0);
  const [snapshot, setSnapshot] = useState<QuizSnapshot>(() => createEmptySnapshot());
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([loadQuestionIndex(), loadSnapshot()])
      .then(([indexData, saved]) => {
        setSets(indexData.sets);
        setSnapshot(saved);
        setSelectedSetId(saved.uiState.selectedSetId ?? indexData.sets[0]?.id);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const summary = sets.find((set) => set.id === selectedSetId);
    if (!summary) return;
    setLoading(true);
    loadQuestionSet(summary)
      .then((nextSet) => {
        setQuestionSet(nextSet);
        const restoredIndex = nextSet.questions.findIndex((question) => question.id === snapshot.uiState.currentQuestionId);
        setIndex(clampQuestionIndex(restoredIndex >= 0 ? restoredIndex : 0, nextSet.questions));
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedSetId, sets, snapshot.uiState.currentQuestionId]);

  const question = questionSet?.questions[index];
  const saved = useMemo(() => question ? snapshot.answers[`${question.id}-${snapshot.uiState.mode}`] : undefined, [question, snapshot]);

  useEffect(() => setSelected(saved?.selected ?? []), [saved]);

  useEffect(() => {
    if (!question || !selectedSetId) return;
    saveSnapshot({ ...snapshot, uiState: { ...snapshot.uiState, activeProduct: questionSet?.meta.certification ?? null, selectedSetId, currentQuestionId: question.id } });
  }, [index, question?.id, selectedSetId]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!questionSet || !question) return <EmptyState />;

  const onSelect = (key: string) => {
    const nextSelected = selected.includes(key) ? selected.filter((item) => item !== key) : [key];
    const answer = toSavedAnswer(question, snapshot.uiState.mode, nextSelected);
    const nextSnapshot = { ...snapshot, answers: { ...snapshot.answers, [answerKey(answer)]: answer } };
    setSelected(nextSelected);
    setSnapshot(nextSnapshot);
    saveSnapshot(nextSnapshot);
  };

  return <AppShell sets={sets} selectedSetId={selectedSetId} onSetChange={setSelectedSetId}><QuestionCard question={question} selected={selected} onSelect={onSelect} /><ResultPanel isCorrect={saved?.isCorrect} /><QuestionNav index={index} total={questionSet.questions.length} onPrev={() => setIndex((value) => clampQuestionIndex(value - 1, questionSet.questions))} onNext={() => setIndex((value) => clampQuestionIndex(value + 1, questionSet.questions))} /></AppShell>;
}
