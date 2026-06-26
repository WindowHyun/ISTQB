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
  // 오답 노트(세트 전체 회차 리스트)용으로 채점 시점에 함께 저장하는 상세(4A). 과거 기록엔 없을 수 있다.
  setTitle?: string;
  wrongItems?: { number: number; myAnswer: string[]; correctAnswer: string[] }[];
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

  // UI 오버레이/드로어 상태(영속화하지 않음 — 새로고침 시 닫힘).
  drawerOpen: boolean;
  settingsOpen: boolean;
  statsOpen: boolean;
  wrongNoteOpen: boolean;
  resultOpen: boolean;
  paletteOpen: boolean;
  confirmGradeOpen: boolean;
  // 시험 모드 진행 중 다른 모드로 전환 시도 시, 확인 대기 중인 목표 모드(null이면 대기 없음).
  pendingMode: QuizMode | null;
  // 저장된 진행을 중간 위치에서 복원했을 때 "이어풀기" 안내 배너를 띄울지 여부.
  resumeNotice: boolean;
  // 시험/랜덤 모드로 복원했고 이전 답안이 있을 때 "이어풀기/새로 풀기" 선택 모달을 띄울지 여부.
  resumePrompt: boolean;

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
  setDrawerOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setStatsOpen: (open: boolean) => void;
  setWrongNoteOpen: (open: boolean) => void;
  setResultOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setConfirmGradeOpen: (open: boolean) => void;
  setPendingMode: (mode: QuizMode | null) => void;
  setResumeNotice: (show: boolean) => void;
  setResumePrompt: (show: boolean) => void;
  resetToGate: () => void;
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

  drawerOpen: false,
  settingsOpen: false,
  statsOpen: false,
  wrongNoteOpen: false,
  resultOpen: false,
  paletteOpen: false,
  confirmGradeOpen: false,
  pendingMode: null,
  resumeNotice: false,
  resumePrompt: false,

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
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setStatsOpen: (statsOpen) => set({ statsOpen }),
  setWrongNoteOpen: (wrongNoteOpen) => set({ wrongNoteOpen }),
  setResultOpen: (resultOpen) => set({ resultOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setConfirmGradeOpen: (confirmGradeOpen) => set({ confirmGradeOpen }),
  setPendingMode: (pendingMode) => set({ pendingMode }),
  setResumeNotice: (resumeNotice) => set({ resumeNotice }),
  setResumePrompt: (resumePrompt) => set({ resumePrompt }),
  // 진입/캐시 복원 시 항상 최초 화면(제품 선택 게이트)으로 — 오버레이도 모두 닫는다.
  resetToGate: () => set({
    mode: 'home', activeProduct: null,
    drawerOpen: false, settingsOpen: false, statsOpen: false,
    wrongNoteOpen: false, resultOpen: false, paletteOpen: false, confirmGradeOpen: false,
    pendingMode: null, resumeNotice: false, resumePrompt: false,
  }),
  hydrate: (hydratedState) => set((state) => ({ ...state, ...hydratedState })),
}));
