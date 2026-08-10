import { create } from 'zustand';
import { answerKeyPrefix, gradeKeyFor } from '../utils/answerKey';

// quick: 제품의 전 세트를 통째로 섞어 한 문항씩 무한으로 푸는 모드(구 '랜덤'을 흡수했다).
// 세트 하나에 매이지 않으므로 setId는 QUICK_SET_ID 센티넬을 쓴다
// (실재하는 세트 id와 겹치지 않는다 — 계약은 단위 테스트로 고정).
export type QuizMode = 'home' | 'exam' | 'practice' | 'review' | 'quick';

/**
 * 이력 레코드가 가질 수 있는 모드 — 지금 고를 수 있는 모드에 폐지된 'random'을 더한 것.
 *
 * 랜덤 모드는 퀵에 흡수돼 사라졌지만 **기존 사용자의 회차 이력은 보존한다**. 그래서
 * "지금 진입할 수 있는 모드"(QuizMode)와 "이력에 실려 있을 수 있는 모드"는 다르다.
 * 둘을 같은 타입으로 두면 폐지 모드를 지우는 순간 과거 이력이 타입·검증에서 탈락해
 * 조용히 폐기된다(이 저장소에서 실제로 났던 결함 유형이다).
 */
export type HistoryMode = QuizMode | 'random';

/** 퀵 회차의 setId. 어느 세트에도 속하지 않는다는 표식이다. */
export const QUICK_SET_ID = 'QUICK';

/**
 * 답안·채점 키가 생길 수 있는 모드 목록(게이트 'home' 제외).
 * storage의 이력 허용 모드도 여기서 파생한다: 두 목록을 따로 관리하면 모드를 추가할 때
 * 한쪽 누락으로 이력이 무단 폐기되거나(그 결함이 실제로 났다) 초기화가 반쪽이 된다.
 *
 * 'random'이 남아 있는 이유는 두 가지이고, 둘 다 신규 진입과는 무관하다.
 *  1) 기존 이력 보존 — HISTORY_MODES가 여기서 파생한다. 빼면 과거 랜덤 회차가 검증에서
 *     탈락해 통계·오답노트에서 통째로 사라진다.
 *  2) 흔적 정리 — resetProgressForSets('이력 비우기')가 지울 키를 여기서 조립한다.
 *     빼면 예전 랜덤 답안·채점 상태가 지워지지 않고 저장소에 영영 남는다.
 */
export const PLAY_MODES = ['exam', 'practice', 'random', 'review', 'quick'] as const;

export interface ExamHistory {
  id: string;
  setId: string;
  // 폐지된 'random'을 포함한다 — 기존 회차 이력을 보존하기 위해서다(HistoryMode 주석 참고).
  mode: HistoryMode;
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
  // setId: 그 문항이 실제로 실려 있는 세트. 퀵처럼 회차의 setId가 센티넬이라 출처를
  // 알 수 없는 경우에만 채운다(일반 회차는 회차의 setId가 곧 출처라 비어 있다).
  // qid: 문항의 이력 식별자(chapterStats.questionKey). reviewIds가 쓰는 것과 같은 값이라,
  // 회차를 지운 뒤 남은 회차로 오답 대상을 **재계산**할 수 있다. 없으면 재계산이 불가능해
  // 지운 회차의 오답이 오답 모드에 계속 출제된다. 과거 기록엔 없다(그때는 키를 비운다).
  wrongItems?: { number: number; myAnswer: string[]; correctAnswer: string[]; setId?: string; qid?: string }[];
  // 챕터별 정답 집계(Phase 3 약점 분석). 채점 시점에 기록 — 과거 기록엔 없을 수 있다.
  chapterStats?: Record<string, { c: number; t: number }>;
  // 챕터별 정답/오답 문항 id. 개수만으로는 재풀이 여부를 알 수 없어 분모가 계속 부풀었다 —
  // id가 있어야 합산에서 문항별 '가장 최근 결과'만 골라 셀 수 있다. 과거 기록엔 없다.
  chapterQuestions?: Record<string, { ok: string[]; no: string[] }>;
  // CSTS 검정방법별 가중 점수(채점 시점 스냅샷) — 4지선다·서답형 1.5점/진위형 1.0점 배점.
  // ISTQB 이력에는 없음(단순 정답률 기준이라 불필요). 과거(수정 전) CSTS 기록엔 없을 수 있다.
  cstsWeighted?: { score: number; maxScore: number };
  // 레거시 — 폐지된 챕터 미니 시험(랜덤 모드 + 챕터 필터) 회차 표식. 신규 기록에는 실리지
  // 않지만, 과거 회차를 세트 전체 회차와 섞어 비교하지 않으려면 읽는 쪽은 계속 봐야 한다.
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
  // 연습 모드 전용이다 — 이 필터를 쓰던 다른 경로(챕터 미니 시험 = 랜덤 + 필터)는 폐지됐다.
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
  // 이어풀기 배너의 '처음부터' 확인 — 종전에는 인덱스만 0으로 되돌리고 답안은 그대로
  // 뒀다. 버튼 이름('처음부터', 짝은 '계속하기')이 약속한 것은 초기화인데 실제로는
  // 첫 문항으로 이동만 해서, 사용자는 "초기화가 안 된다"로 겪었다. 이제 실제로 지우되
  // 답안 소실은 되돌릴 수 없으므로 세트 변경·새 문제 뽑기와 같은 확인 단계를 둔다.
  pendingRestart: boolean;
  // 시험 응시 중 이탈 확인 — 제한시간이 벽시계로 흐르므로 나가 있는 동안에도 시간이
  // 줄어든다. 실수로 뒤로가기 한 번에 시험 시간을 잃지 않게 한 단계를 둔다.
  confirmExitExam: boolean;
  // 오답 모드에서 다시 풀어 맞힌 문항 번호(세트별). 재풀이 대상에서 빠지고,
  // 오답노트에는 '복습함'으로 남는다 — 오답 모드에는 채점 경로가 없어 아무리 맞혀도
  // 목록이 줄지 않던(학습 루프가 닫히지 않던) 문제를 여기서 닫는다.
  // 다시 채점해 또 틀리면 해당 번호는 제거돼 재풀이 대상으로 돌아온다.
  reviewedOk: Record<string, number[]>;
  /**
   * 퀵 출제 순서 — 제품의 전 세트를 한 번씩만 담아 섞은 목록이다(재수록 문항은 대표 하나).
   * index가 이 목록을 앞으로만 훑는 커서이고, 끝에 닿으면 '한 바퀴 완료'로 세션이 끝난다.
   *
   * 종전에는 10~20문항만 뽑아 담았다. 무한 모드가 되면서 목록 전체를 담는데, 그래야
   * "같은 문제가 두 번 나오지 않는다"를 커서 하나로 보장할 수 있다 — 매번 다시 뽑으면
   * 이미 푼 문항을 걸러낼 별도 기록이 필요해지고, 그 기록이 곧 '기록을 남기지 않는다'는
   * 사양과 부딪힌다.
   *
   * 문항 id만으로는 어느 세트에서 왔는지 알 수 없어(복원 시 어떤 세트를 로드할지) setId를 함께 남긴다.
   */
  quickDraw: { certification: string; items: { id: string; setId: string }[] } | null;
  // 퀵 재추첨 트리거 — 증가하면 useQuestions가 현재 순서를 버리고 새로 섞는다.
  quickNonce: number;

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
  /**
   * 주어진 세트들의 풀이 흔적을 한 번에 비운다 — 답안·채점 상태·시험 게이트·오답 대상·
   * 재풀이 진척까지. 이력(IndexedDB) 삭제와 짝을 이룬다: 이력만 지우면 오답노트에는
   * 없는데 오답 모드에는 나오는 유령 상태가 남는다.
   */
  resetProgressForSets: (setIds: string[]) => void;
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
  setPendingRestart: (open: boolean) => void;
  setConfirmExitExam: (open: boolean) => void;
  /** 오답 재풀이로 맞힌 문항 번호를 기록한다(재풀이 대상에서 제외). */
  markReviewed: (setId: string, numbers: number[]) => void;
  /** 다시 틀린 문항은 '복습함'에서 되돌린다 — 채점 시 호출. */
  unmarkReviewed: (setId: string, numbers: number[]) => void;
  // 세트 전환(교체 + 새 세션 + 모드별 후처리). 사이드바·확인 모달의 공용 진입점.
  commitSetChange: (setId: string) => void;
  setQuickDraw: (draw: QuizState['quickDraw']) => void;
  /** 퀵 진입/다시 시작 — 이전 진행을 비우고 전 세트를 새로 섞게 한다. */
  startQuick: () => void;
  /** 퀵 '다음 문제' — 커서를 앞으로만 옮긴다(되돌아갈 수 없는 것이 이 모드의 규칙이다). */
  advanceQuick: () => void;
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
  // 퀵은 제품 스코프다 — 제품을 바꾸면 이전 제품 문항으로 이어풀기가 되지 않게 비운다.
  quickDraw: null as { certification: string; items: { id: string; setId: string }[] } | null,
  quickNonce: 0,
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
  pendingRestart: false,
  confirmExitExam: false,
  reviewedOk: {},
  quickDraw: null,
  quickNonce: 0,

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
  resetProgressForSets: (setIds) => set((state) => {
    if (!setIds.length) return state;
    // 접두 일치로 지우면 유사한 이름의 다른 세트까지 함께 날아간다 —
    // (setId, mode) 조합으로 정확한 키를 만들어 지운다.
    const answerPrefixes = setIds.flatMap((id) => PLAY_MODES.map((m) => answerKeyPrefix(id, m)));
    const gradeKeys = new Set(setIds.flatMap((id) => PLAY_MODES.map((m) => gradeKeyFor(id, m))));

    const answers = { ...state.answers };
    for (const key in answers) {
      if (answerPrefixes.some((p) => key.startsWith(p))) delete answers[key];
    }
    const graded = { ...state.graded };
    const reviewIds = { ...state.reviewIds };
    for (const key of gradeKeys) {
      delete graded[key];
      // 오답 대상 — 남기면 삭제된 회차의 오답이 오답 모드에 계속 출제된다.
      delete reviewIds[key];
    }
    const examStarted = { ...state.examStarted };
    const examStartedAt = { ...state.examStartedAt };
    const reviewedOk = { ...state.reviewedOk };
    for (const id of setIds) {
      delete examStarted[id];
      delete examStartedAt[id];
      delete reviewedOk[id];
    }
    return { answers, graded, reviewIds, examStarted, examStartedAt, reviewedOk };
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
  setPendingRestart: (pendingRestart) => set({ pendingRestart }),
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
  // 사이드바와 이어풀기 선택 모달이 같은 경로를 타야 한쪽만 답안 정리를 빠뜨리는
  // 어긋남이 생기지 않는다(beginSession과 같은 이유).
  commitSetChange: (newSetId) => {
    const prev = get();
    // 세트 교체 + 새 세션 개시(beginSession과 동일) + 드로어 닫기.
    set({
      setId: newSetId, chapterFilter: null,
      index: 0, elapsedSeconds: 0, lastTick: Date.now(),
      drawerOpen: false,
    });
    if (
      // 바꾼 세트가 시험 모드에 이전 답안을 갖고 있으면 "이어풀기/새로 풀기" 선택 모달을 띄운다.
      prev.mode === 'exam' &&
      Object.keys(prev.answers).some((k) => k.startsWith(answerKeyPrefix(newSetId, 'exam')))
    ) {
      set({ resumePrompt: true });
    }
  },
  setQuickDraw: (quickDraw) => set({ quickDraw }),
  // 순서를 비워 새로 섞게 한다 — 진입할 때마다 같은 순서가 나오면 '랜덤'의 의미가 없다.
  startQuick: () => set((state) => {
    // 이전 퀵 세션의 답안을 반드시 비운다. 퀵의 setId·mode는 항상 같아서 답안 키 공간도
    // 늘 같다 — 남겨 두면 새 세션에서 그 문항이 다시 나올 때 이전 답이 선택되고 정답·해설이
    // 미리 펼쳐진 채로 보인다(즉시 피드백 모드라 '푸는' 단계 자체가 건너뛰어진다).
    const prefix = answerKeyPrefix(QUICK_SET_ID, 'quick');
    const nextAnswers = { ...state.answers };
    for (const key in nextAnswers) {
      if (key.startsWith(prefix)) delete nextAnswers[key];
    }
    return {
      mode: 'quick', setId: QUICK_SET_ID, quickDraw: null, index: 0,
      chapterFilter: null, quickNonce: state.quickNonce + 1,
      answers: nextAnswers,
      // 퀵은 채점이 없는 모드지만, 예전 버전에서 남은 채점 플래그가 있으면 보기가 잠긴
      // 채로 시작한다(graded면 QuestionCard가 locked). 진입할 때 확실히 내려 둔다.
      graded: { ...state.graded, [gradeKeyFor(QUICK_SET_ID, 'quick')]: false },
    };
  }),
  // 앞으로만 간다 — 되돌아가기를 허용하면 이미 정답을 본 문항을 다시 세게 되고,
  // 진행·연속 정답 집계가 커서 기준이라 그 순간 수치가 흔들린다.
  advanceQuick: () => set((state) => ({ index: state.index + 1 })),
  // 진입/캐시 복원 시 항상 최초 화면(제품 선택 게이트)으로 — 오버레이도 모두 닫는다.
  resetToGate: () => set({
    mode: 'home', activeProduct: null,
    drawerOpen: false, settingsOpen: false, statsOpen: false,
    wrongNoteOpen: false, resultOpen: false, paletteOpen: false, confirmGradeOpen: false,
    resumeNotice: false, resumePrompt: false, quitExamOpen: false, gradedResume: null,
    pendingRestart: false, confirmExitExam: false,
    // 제품 게이트로 돌아가면 시험 시작 상태도 리셋(다음 진입 시 시작 게이트 재노출).
    examStarted: {}, chapterFilter: null,
  }),
  hydrate: (hydratedState) => set((state) => ({ ...state, ...hydratedState })),
}));
