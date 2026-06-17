import { create } from 'zustand';

export type QuizMode = 'home' | 'exam' | 'practice' | 'random' | 'review';

export interface ExamHistory {
  id: string;
  setId: string;
  mode: QuizMode;
  answers: Record<string, string[]>;
  // 채점 시점에 기록되는 요약 메타(통계 대시보드용). 과거 기록은 없을 수 있다.
  correct?: number;
  total?: number;
  elapsedSeconds?: number;
  createdAt?: number;
}

export interface QuizState {
  activeProduct: 'istqb' | 'csts' | null;
  mode: QuizMode;
  setId: string;
  index: number;
  answers: Record<string, string[]>;
  histories: Record<string, ExamHistory>;
  reviewIds: Record<string, string[]>;
  graded: Record<string, boolean>;
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
  setGraded: (key: string, value: boolean) => void;
  clearAnswers: (setId: string, mode: QuizMode) => void;
  clearHistory: (setId: string, mode: QuizMode) => void;
  clearHistories: () => void;
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
  graded: {},
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
  setGraded: (key, value) => set((state) => ({
    graded: { ...state.graded, [key]: value }
  })),
  clearAnswers: (setId, mode) => set((state) => {
    const nextAnswers = { ...state.answers };
    for (const key in nextAnswers) {
      if (key.startsWith(`${setId}-${mode}`)) {
        delete nextAnswers[key];
      }
    }
    // 해당 세트/모드의 채점 상태도 함께 초기화
    return { answers: nextAnswers, graded: { ...state.graded, [`${setId}-${mode}`]: false } };
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
  clearHistories: () => set({ histories: {} }),
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
