import { create } from 'zustand';

export type QuizMode = 'home' | 'exam' | 'practice' | 'random' | 'review';

export interface ExamHistory {
  id: string;
  setId: string;
  mode: QuizMode;
  // 소속 제품(채점 시 기록). 과거 기록엔 없을 수 있어 setId 기반 추론으로 폴백한다 —
  // 세트가 index.json에서 제거/개명돼도 제품 스코프 필터에서 이력이 실종되지 않게 한다.
  certification?: 'istqb' | 'csts';
  answers: Record<string, string[]>;
  // 채점 시점에 기록되는 요약 메타(통계 대시보드용). 과거 기록은 없을 수 있다.
  correct?: number;
  total?: number;
  elapsedSeconds?: number;
  createdAt?: number;
  // 오답 노트(세트 전체 회차 리스트)용으로 채점 시점에 함께 저장하는 상세(4A). 과거 기록엔 없을 수 있다.
  setTitle?: string;
  wrongItems?: { number: number; myAnswer: string[]; correctAnswer: string[] }[];
  // 챕터별 정답 집계(Phase 3 약점 분석). 채점 시점에 기록 — 과거 기록엔 없을 수 있다.
  chapterStats?: Record<string, { c: number; t: number }>;
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
  // 시험 시작 게이트(Phase 1) — 세트별로 "시작하기"를 눌러 응시를 개시했는지.
  // 비영속(새로고침 시 게이트 재노출, 답안은 보존). 키는 setId.
  examStarted: Record<string, boolean>;
  elapsedSeconds: number;
  lastTick: number | null;
  startedAt: number | null;
  navCollapsed: boolean;
  // 챕터 집중 연습 필터(Phase 3). null이면 전체. 세트/모드 전환 시 해제되며 영속화하지 않는다.
  chapterFilter: string | null;

  // UI 오버레이/드로어 상태(영속화하지 않음 — 새로고침 시 닫힘).
  drawerOpen: boolean;
  settingsOpen: boolean;
  statsOpen: boolean;
  wrongNoteOpen: boolean;
  resultOpen: boolean;
  paletteOpen: boolean;
  confirmGradeOpen: boolean;
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
  // 오답(review) 대상 문항 id 목록. 키는 `${setId}-${mode}`(과거 데이터는 setId 단독일 수 있음).
  setReviewIds: (key: string, ids: string[]) => void;
  setGraded: (key: string, value: boolean) => void;
  setExamStarted: (setId: string, value: boolean) => void;
  clearAnswers: (setId: string, mode: QuizMode) => void;
  // id 목록으로 이력을 지운다. 호출은 storage.removeHistoriesEverywhere(메모리+DB 동시 삭제)로만.
  removeHistories: (ids: string[]) => void;
  tickTimer: () => void;
  startTimer: () => void;
  resetTimer: () => void;
  // 세션 개시 의례(위치 1번 + 타이머 0) — 세트/모드 전환·시험 시작·집중 연습 진입 등
  // 모든 "새 풀이 세션" 진입점이 이 액션 하나를 호출한다(호출부마다 setIndex+resetTimer를
  // 복제하다 한 곳이 빠지는 버그 클래스 차단).
  beginSession: () => void;
  setNavCollapsed: (collapsed: boolean) => void;
  setChapterFilter: (chapter: string | null) => void;
  setDrawerOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setStatsOpen: (open: boolean) => void;
  setWrongNoteOpen: (open: boolean) => void;
  setResultOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setConfirmGradeOpen: (open: boolean) => void;
  setResumeNotice: (show: boolean) => void;
  setResumePrompt: (show: boolean) => void;
  resetToGate: () => void;
  hydrate: (state: Partial<QuizState>) => void;
}

// 세션 스코프 상태의 기본값 — "제품 전환/복원(hydrate) 시 초기화해야 할 것" 목록의
// 단일 원천(storage.restorePersistentSnapshot이 사용). 세션 스코프 필드를 추가하면
// 여기에 함께 넣는다. (resetToGate는 graded/reviewIds를 세션 내 보존하는 별개 정책)
// 함수형인 이유: 상수 객체면 중첩 {}가 모듈 공유 참조로 hydrate에 유입돼, 어딘가에서
// 직접 변이하는 코드가 생기는 순간 제품 간 상태가 오염되는 잠복 결함이 된다.
export const sessionScopeDefaults = () => ({
  graded: {} as Record<string, boolean>,
  examStarted: {} as Record<string, boolean>,
  reviewIds: {} as Record<string, string[]>,
  chapterFilter: null as string | null,
});

export const useQuizStore = create<QuizState>((set) => ({
  activeProduct: null,
  mode: 'home',
  setId: '',
  index: 0,
  answers: {},
  histories: {},
  reviewIds: {},
  graded: {},
  examStarted: {},
  elapsedSeconds: 0,
  lastTick: null,
  startedAt: null,
  navCollapsed: false,
  chapterFilter: null,

  drawerOpen: false,
  settingsOpen: false,
  statsOpen: false,
  wrongNoteOpen: false,
  resultOpen: false,
  paletteOpen: false,
  confirmGradeOpen: false,
  resumeNotice: false,
  resumePrompt: false,

  setActiveProduct: (activeProduct) => set({ activeProduct }),
  // 모드/세트가 바뀌면 챕터 필터는 의미를 잃으므로 함께 해제한다(필터는 현재 연습 세션 한정).
  setMode: (mode) => set({ mode, chapterFilter: null }),
  setSetId: (setId) => set({ setId, chapterFilter: null }),
  setIndex: (indexOrFn) => set((state) => ({
    index: typeof indexOrFn === 'function' ? indexOrFn(state.index) : indexOrFn
  })),
  setAnswer: (key, selected) => set((state) => ({
    answers: { ...state.answers, [key]: selected }
  })),
  addHistory: (history) => set((state) => ({
    histories: { ...state.histories, [history.id]: history }
  })),
  setReviewIds: (key, ids) => set((state) => ({
    reviewIds: { ...state.reviewIds, [key]: ids }
  })),
  setGraded: (key, value) => set((state) => ({
    graded: { ...state.graded, [key]: value }
  })),
  setExamStarted: (setId, value) => set((state) => ({
    examStarted: { ...state.examStarted, [setId]: value }
  })),
  clearAnswers: (setId, mode) => set((state) => {
    const nextAnswers = { ...state.answers };
    for (const key in nextAnswers) {
      // 답안 키는 `${setId}-${mode}-${qid}` — 구분자까지 포함해 유사 접두 세트id 오삭제를 방지.
      if (key.startsWith(`${setId}-${mode}-`)) {
        delete nextAnswers[key];
      }
    }
    // 해당 세트/모드의 채점 상태 초기화 + 시험 재응시 시 시작 게이트가 다시 뜨도록 examStarted도 해제.
    const nextExamStarted = mode === 'exam'
      ? { ...state.examStarted, [setId]: false }
      : state.examStarted;
    return {
      answers: nextAnswers,
      graded: { ...state.graded, [`${setId}-${mode}`]: false },
      examStarted: nextExamStarted,
    };
  }),
  removeHistories: (ids) => set((state) => {
    const nextHistories = { ...state.histories };
    ids.forEach((id) => { delete nextHistories[id]; });
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
  beginSession: () => set({ index: 0, elapsedSeconds: 0, lastTick: Date.now() }),
  setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
  setChapterFilter: (chapterFilter) => set({ chapterFilter }),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setStatsOpen: (statsOpen) => set({ statsOpen }),
  setWrongNoteOpen: (wrongNoteOpen) => set({ wrongNoteOpen }),
  setResultOpen: (resultOpen) => set({ resultOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setConfirmGradeOpen: (confirmGradeOpen) => set({ confirmGradeOpen }),
  setResumeNotice: (resumeNotice) => set({ resumeNotice }),
  setResumePrompt: (resumePrompt) => set({ resumePrompt }),
  // 진입/캐시 복원 시 항상 최초 화면(제품 선택 게이트)으로 — 오버레이도 모두 닫는다.
  resetToGate: () => set({
    mode: 'home', activeProduct: null,
    drawerOpen: false, settingsOpen: false, statsOpen: false,
    wrongNoteOpen: false, resultOpen: false, paletteOpen: false, confirmGradeOpen: false,
    resumeNotice: false, resumePrompt: false,
    // 제품 게이트로 돌아가면 시험 시작 상태도 리셋(다음 진입 시 시작 게이트 재노출).
    examStarted: {}, chapterFilter: null,
  }),
  hydrate: (hydratedState) => set((state) => ({ ...state, ...hydratedState })),
}));
