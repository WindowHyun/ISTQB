import { create } from 'zustand';

export type QuizMode = 'home' | 'exam' | 'practice' | 'random' | 'review';

export interface ExamHistory {
  id: string;
  setId: string;
  mode: QuizMode;
  answers: Record<string, string[]>;
}

export interface QuizState {
  activeProduct: 'istqb' | 'csts' | null;
  mode: QuizMode;
  setId: string;
  index: number;
  answers: Record<string, string[]>;
  histories: Record<string, ExamHistory>;
  reviewIds: Record<string, string[]>;
  elapsedSeconds: number;
  lastTick: number | null;
  startedAt: number | null;
  navCollapsed: boolean;

  // Actions
  setActiveProduct: (product: 'istqb' | 'csts') => void;
  setMode: (mode: QuizMode) => void;
  setSetId: (setId: string) => void;
  setIndex: (index: number | ((prev: number) => number)) => void;
  setAnswer: (key: string, selected: string[]) => void;
  addHistory: (history: ExamHistory) => void;
  setReviewIds: (setId: string, ids: string[]) => void;
  clearAnswers: (setId: string, mode: QuizMode) => void;
  clearHistory: (setId: string, mode: QuizMode) => void;
  tickTimer: () => void;
  startTimer: () => void;
  resetTimer: () => void;
  setNavCollapsed: (collapsed: boolean) => void;
  hydrate: (state: Partial<QuizState>) => void;
}

export const useQuizStore = create<QuizState>((set) => ({
  activeProduct: null,
  mode: 'home',
  setId: '',
  index: 0,
  answers: {},
  histories: {},
  reviewIds: {},
  elapsedSeconds: 0,
  lastTick: null,
  startedAt: null,
  navCollapsed: false,

  setActiveProduct: (activeProduct) => set({ activeProduct }),
  setMode: (mode) => set({ mode }),
  setSetId: (setId) => set({ setId }),
  setIndex: (indexOrFn) => set((state) => ({
    index: typeof indexOrFn === 'function' ? indexOrFn(state.index) : indexOrFn
  })),
  setAnswer: (key, selected) => set((state) => ({
    answers: { ...state.answers, [key]: selected }
  })),
  addHistory: (history) => set((state) => ({
    histories: { ...state.histories, [history.id]: history }
  })),
  setReviewIds: (setId, ids) => set((state) => ({
    reviewIds: { ...state.reviewIds, [setId]: ids }
  })),
  clearAnswers: (setId, mode) => set((state) => {
    const nextAnswers = { ...state.answers };
    for (const key in nextAnswers) {
      if (key.startsWith(`${setId}-${mode}`)) {
        delete nextAnswers[key];
      }
    }
    return { answers: nextAnswers };
  }),
  clearHistory: (setId, mode) => set((state) => {
    const nextHistories = { ...state.histories };
    for (const key in nextHistories) {
      const hist = nextHistories[key];
      if (hist.setId === setId && hist.mode === mode) {
        delete nextHistories[key];
      }
    }
    return { histories: nextHistories };
  }),
  tickTimer: () => set((state) => {
    if (!state.lastTick) return state;
    const now = Date.now();
    return {
      elapsedSeconds: state.elapsedSeconds + (now - state.lastTick) / 1000,
      lastTick: now
    };
  }),
  startTimer: () => set({ startedAt: Date.now(), lastTick: Date.now() }),
  resetTimer: () => set({ elapsedSeconds: 0, lastTick: Date.now() }),
  setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
  hydrate: (hydratedState) => set((state) => ({ ...state, ...hydratedState })),
}));
