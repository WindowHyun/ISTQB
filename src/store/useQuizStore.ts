import { create } from 'zustand';
import { answerKeyPrefix, gradeKeyFor } from '../utils/answerKey';

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
  // 챕터별 정답/오답 문항 id. 개수만으로는 재풀이 여부를 알 수 없어 분모가 계속 부풀었다 —
  // id가 있어야 합산에서 문항별 '가장 최근 결과'만 골라 셀 수 있다. 과거 기록엔 없다.
  chapterQuestions?: Record<string, { ok: string[]; no: string[] }>;
  // CSTS 검정방법별 가중 점수(채점 시점 스냅샷) — 4지선다·서답형 1.5점/진위형 1.0점 배점.
  // ISTQB 이력에는 없음(단순 정답률 기준이라 불필요). 과거(수정 전) CSTS 기록엔 없을 수 있다.
  cstsWeighted?: { score: number; maxScore: number };
  // 챕터 미니 시험(랜덤 모드 + 챕터 필터) 회차 표식. 세트 전체 회차가 아니므로
  // 타임라인·직전 대비 비교에서는 같은 챕터끼리만 비교한다(챕터 통계에는 그대로 반영).
  chapter?: string;
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
  // 시험 응시 시작 벽시계 시각(세트별). 제한시간은 여기서부터 흐른다 — 경과 누계만
  // 쓰면 앱을 껐다 켠 시간이 빠져 60/90분 제한을 무한히 늘릴 수 있다.
  // 영속화되므로 앱을 완전히 종료했다 다시 열어도 남은 시간이 이어진다.
  examStartedAt: Record<string, number>;
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
  // 응시 포기 확인 모달 — 응시 중 잠금의 공식 탈출구(답안 삭제·회차 기록 없음).
  quitExamOpen: boolean;
  // 복원한 시험 답안이 최신 채점 회차와 동일할 때 띄우는 "채점 완료된 회차" 안내.
  // 같은 답안 재채점으로 회차가 중복 적립되는 것을 막는다. null이면 비표시.
  gradedResume: { correct: number | null; total: number | null } | null;
  // 랜덤 진행 중 세트를 바꾸려 할 때, 확인을 받기까지 보류한 대상 세트 id.
  // 랜덤은 세트별로 추첨을 보관하지 않으므로(F4) 세트를 바꾸면 진행이 사라진다 —
  // 소리 없이 버리지 않고 한 번 묻는다. null이면 보류 중인 변경이 없다.
  // 세트 선택은 사이드바, 확인 모달은 AppModals라 스토어가 둘의 접점이다.
  pendingSetChange: string | null;
  // 랜덤 '새 문제 뽑기' 확인 — 세트 변경과 같은 손실(현재 추첨·답안 폐기)인데
  // 종전에는 이 경로만 확인 없이 즉시 실행돼 규칙이 갈렸다.
  pendingRedraw: boolean;
  // 시험 응시 중 이탈 확인 — 제한시간이 벽시계로 흐르므로 나가 있는 동안에도 시간이
  // 줄어든다. 실수로 뒤로가기 한 번에 시험 시간을 잃지 않게 한 단계를 둔다.
  confirmExitExam: boolean;
  // 오답 모드에서 다시 풀어 맞힌 문항 번호(세트별). 재풀이 대상에서 빠지고,
  // 오답노트에는 '복습함'으로 남는다 — 오답 모드에는 채점 경로가 없어 아무리 맞혀도
  // 목록이 줄지 않던(학습 루프가 닫히지 않던) 문제를 여기서 닫는다.
  // 다시 채점해 또 틀리면 해당 번호는 제거돼 재풀이 대상으로 돌아온다.
  reviewedOk: Record<string, number[]>;
  // 랜덤 '새 문제 뽑기' 트리거 — 증가하면 useQuestions가 현재 추첨을 버리고 재추첨한다.
  randomNonce: number;
  // 랜덤 현재 추첨(뽑힌 문항 id 목록)을 영속화해 새로고침 시 같은 문항으로 이어풀게 한다.
  // null이면 미추첨/재추첨 필요. 모드 진입·'새 문제 뽑기'는 이 값을 비워 새 추첨을 유도한다.
  randomDraw: { setId: string; chapter: string | null; ids: string[] } | null;

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
  /** 시험 응시 개시 시각 기록/해제 — 제한시간의 기준점. */
  setExamStartedAt: (setId: string, at: number | null) => void;
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
  setQuitExamOpen: (open: boolean) => void;
  setGradedResume: (info: QuizState['gradedResume']) => void;
  setPendingSetChange: (setId: string | null) => void;
  setPendingRedraw: (open: boolean) => void;
  setConfirmExitExam: (open: boolean) => void;
  /** 오답 재풀이로 맞힌 문항 번호를 기록한다(재풀이 대상에서 제외). */
  markReviewed: (setId: string, numbers: number[]) => void;
  /** 다시 틀린 문항은 '복습함'에서 되돌린다 — 채점 시 호출. */
  unmarkReviewed: (setId: string, numbers: number[]) => void;
  // 세트 전환(교체 + 새 세션 + 모드별 후처리). 사이드바·확인 모달의 공용 진입점.
  commitSetChange: (setId: string) => void;
  redrawRandom: () => void;
  setRandomDraw: (draw: QuizState['randomDraw']) => void;
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
  examStartedAt: {} as Record<string, number>,
  reviewedOk: {} as Record<string, number[]>,
  reviewIds: {} as Record<string, string[]>,
  chapterFilter: null as string | null,
  // 제품 전환 시 이전 제품의 랜덤 추첨이 새 제품으로 새지 않게 초기화(복원 시 해당 제품 값으로 덮음).
  randomDraw: null as { setId: string; chapter: string | null; ids: string[] } | null,
});

export const useQuizStore = create<QuizState>((set, get) => ({
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
  examStartedAt: {},
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
  quitExamOpen: false,
  gradedResume: null,
  pendingSetChange: null,
  pendingRedraw: false,
  confirmExitExam: false,
  reviewedOk: {},
  randomNonce: 0,
  randomDraw: null,

  setActiveProduct: (activeProduct) => set({ activeProduct }),
  // 모드/세트가 바뀌면 챕터 필터는 의미를 잃으므로 함께 해제한다(필터는 현재 연습 세션 한정).
  // 단 "같은 모드로 재확정"하는 경로에서는 해제하지 않는다 — 복원 직후 App이 저장된 모드를
  // 그대로 setMode로 재확정하는데, 여기서 필터가 지워지면 미니 시험(랜덤+챕터) 복원이
  // 무효화돼 저장된 추첨과 스코프가 어긋나고 일반 랜덤으로 무통보 재추첨된다.
  setMode: (mode) => set((state) => (state.mode === mode ? { mode } : { mode, chapterFilter: null })),
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
  setExamStartedAt: (setId, at) => set((state) => {
    const next = { ...state.examStartedAt };
    if (at == null) delete next[setId];
    else next[setId] = at;
    return { examStartedAt: next };
  }),
  clearAnswers: (setId, mode) => set((state) => {
    const nextAnswers = { ...state.answers };
    for (const key in nextAnswers) {
      // 답안 키는 `${setId}-${mode}-${qid}` — 구분자까지 포함해 유사 접두 세트id 오삭제를 방지.
      if (key.startsWith(answerKeyPrefix(setId, mode))) {
        delete nextAnswers[key];
      }
    }
    // 해당 세트/모드의 채점 상태 초기화 + 시험 재응시 시 시작 게이트가 다시 뜨도록 examStarted도 해제.
    const nextExamStarted = mode === 'exam'
      ? { ...state.examStarted, [setId]: false }
      : state.examStarted;
    // 제한시간 기준점도 함께 비운다 — 남겨두면 다음 응시 전까지 지난 회차의 시각이 떠 있다.
    const nextExamStartedAt = { ...state.examStartedAt };
    if (mode === 'exam') delete nextExamStartedAt[setId];
    return {
      answers: nextAnswers,
      graded: { ...state.graded, [gradeKeyFor(setId, mode)]: false },
      examStarted: nextExamStarted,
      examStartedAt: nextExamStartedAt,
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
  startTimer: () => set({ lastTick: Date.now() }),
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
  setQuitExamOpen: (quitExamOpen) => set({ quitExamOpen }),
  setGradedResume: (gradedResume) => set({ gradedResume }),
  setPendingSetChange: (pendingSetChange) => set({ pendingSetChange }),
  setPendingRedraw: (pendingRedraw) => set({ pendingRedraw }),
  setConfirmExitExam: (confirmExitExam) => set({ confirmExitExam }),
  markReviewed: (setId, numbers) => set((state) => {
    const merged = new Set([...(state.reviewedOk[setId] ?? []), ...numbers]);
    return { reviewedOk: { ...state.reviewedOk, [setId]: [...merged].sort((a, b) => a - b) } };
  }),
  unmarkReviewed: (setId, numbers) => set((state) => {
    const prev = state.reviewedOk[setId];
    if (!prev?.length || !numbers.length) return state;
    const drop = new Set(numbers);
    const next = prev.filter((n) => !drop.has(n));
    if (next.length === prev.length) return state;
    return { reviewedOk: { ...state.reviewedOk, [setId]: next } };
  }),
  // 세트 전환 의례 — 세트 교체 + 새 세션 개시 + 모드별 후처리를 한 곳에 모은다.
  // 사이드바(즉시 전환)와 확인 모달(랜덤 진행 중 승인 후 전환)이 같은 경로를 타야
  // 한쪽만 답안 정리를 빠뜨리는 어긋남이 생기지 않는다(beginSession과 같은 이유).
  commitSetChange: (newSetId) => {
    const prev = get();
    // 세트 교체 + 새 세션 개시(beginSession과 동일) + 드로어 닫기 + 보류 해제.
    set({
      setId: newSetId, chapterFilter: null,
      index: 0, elapsedSeconds: 0, lastTick: Date.now(),
      drawerOpen: false, pendingSetChange: null,
    });
    if (prev.mode === 'random') {
      // 랜덤은 이어풀기 없음 — 바꾼 세트의 랜덤 답안을 비우고 새로 시작한다(F4).
      get().clearAnswers(newSetId, 'random');
    } else if (
      // 바꾼 세트가 시험 모드에 이전 답안을 갖고 있으면 "이어풀기/새로 풀기" 선택 모달을 띄운다.
      prev.mode === 'exam' &&
      Object.keys(prev.answers).some((k) => k.startsWith(`${newSetId}-exam-`))
    ) {
      set({ resumePrompt: true });
    }
  },
  // '새 문제 뽑기' — 세대(nonce)를 올리고 저장된 추첨을 비워 useQuestions가 새로 추첨하게 한다.
  redrawRandom: () => set((state) => ({ randomNonce: state.randomNonce + 1, randomDraw: null })),
  setRandomDraw: (randomDraw) => set({ randomDraw }),
  // 진입/캐시 복원 시 항상 최초 화면(제품 선택 게이트)으로 — 오버레이도 모두 닫는다.
  resetToGate: () => set({
    mode: 'home', activeProduct: null,
    drawerOpen: false, settingsOpen: false, statsOpen: false,
    wrongNoteOpen: false, resultOpen: false, paletteOpen: false, confirmGradeOpen: false,
    resumeNotice: false, resumePrompt: false, quitExamOpen: false, gradedResume: null,
    pendingSetChange: null, pendingRedraw: false, confirmExitExam: false,
    // 제품 게이트로 돌아가면 시험 시작 상태도 리셋(다음 진입 시 시작 게이트 재노출).
    examStarted: {}, chapterFilter: null,
  }),
  hydrate: (hydratedState) => set((state) => ({ ...state, ...hydratedState })),
}));
