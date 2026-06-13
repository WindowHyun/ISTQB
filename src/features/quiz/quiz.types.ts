export type Certification = "ISTQB" | "CSTS";
export type QuizMode = "practice" | "exam" | "random" | "review";
export type BlockType = "paragraph" | "note" | "prompt" | "list" | "table" | "code" | "formula" | "image";

export interface QuestionSetSummary {
  id: string;
  legacySetId?: string;
  certification: Certification;
  title: string;
  path: string;
}

export interface QuestionIndex {
  schemaVersion: number;
  sets: QuestionSetSummary[];
}

export interface TextBlock {
  type: Exclude<BlockType, "list" | "table" | "image">;
  text: string;
}

export interface ListBlock {
  type: "list";
  items: string[];
}

export interface TableBlock {
  type: "table";
  headers?: string[];
  rows: string[][];
}

export interface ImageBlock {
  type: "image";
  src: string;
  alt?: string;
  caption?: string;
}

export type ContentBlock = TextBlock | ListBlock | TableBlock | ImageBlock;

export interface QuestionOption {
  key: string;
  text?: string;
  blocks?: ContentBlock[];
}

export interface QuizQuestion {
  id: string;
  number: number;
  type: "multiple_choice" | "short_answer";
  stem: ContentBlock[];
  options?: QuestionOption[];
  answer: string[];
  explanation?: ContentBlock[];
  figure?: string | null;
  tags?: string[];
  difficulty?: string;
}

export interface QuestionSet {
  meta: {
    id: string;
    certification: Certification;
    title: string;
    [key: string]: unknown;
  };
  questions: QuizQuestion[];
}

export interface SavedAnswer {
  questionId: string;
  mode: QuizMode;
  selected: string[];
  isCorrect?: boolean;
  updatedAt: number;
}

export interface QuizUiState {
  activeProduct: Certification | null;
  selectedSetId: string | null;
  currentQuestionId: string | null;
  mode: QuizMode;
  timerStartedAt: number | null;
  elapsedMs: number;
  updatedAt: number;
}

export interface QuizSnapshot {
  schemaVersion: 1;
  answers: Record<string, SavedAnswer>;
  uiState: QuizUiState;
}
