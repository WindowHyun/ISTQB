import type { ReactNode } from "react";
import type { QuestionSetSummary } from "../../features/quiz/quiz.types";

export function AppShell({ sets, selectedSetId, onSetChange, children }: { sets: QuestionSetSummary[]; selectedSetId?: string; onSetChange: (id: string) => void; children: ReactNode }) {
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><div><p>Vite + React + TypeScript</p><h1>ISTQB/CSTS 문제풀이</h1></div></div><select value={selectedSetId ?? ""} onChange={(event) => onSetChange(event.target.value)}>{sets.map((set) => <option key={set.id} value={set.id}>{set.title}</option>)}</select></aside><section className="content">{children}</section></main>;
}
