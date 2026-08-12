import { create } from 'zustand';
import { answerKeyPrefix, gradeKeyFor } from '../utils/answerKey';

// quick: 제품의 전 세트에서 10~20문항을 뽑아 짧게 푸는 모드. 세트 하나에 매이지 않으므로
// setId는 QUICK_SET_ID 센티넬을 쓴다(실재하는 세트 id와 겹치지 않는다 — 계약은 단위 테스트로 고정).
export type QuizMode = 'home' | 'exam' | 'practice' | 'random' | 'review' | 'quick';

/** 퀵 랜덤 회차의 setId. 어느 세트에도 속하지 않는다는 표식이다. */
export const QUICK_SET_ID = 'QUICK';

/**
 * 퀵 회차 보관 기간 — 24시간. 퀵은 회차 기록을 남기지 않는 모드라(요약·타임라인·이력
 * 목록에 나오지 않는다) 채점 결과를 어딘가 영구 보관하면 그 사양과 모순된다. 다만 방금
 * 틀린 것을 바로 못 보면 학습이 끊기므로, 만료가 있는 임시 보관으로 절충한다.
 */
export const QUICK_ROUND_TTL_MS = 24 * 60 * 60 * 1000;

/** 만료되지 않은 퀵 회차만 고른다(읽는 시점에 거른다 — 타이머를 두면 앱이 꺼진 동안 안 돈다). */
export function freshQuickRounds(rounds: ExamHistory[] | undefined, now = Date.now()): ExamHistory[] {
  if (!rounds?.length) return [];
  return rounds.filter((r) => now - (r.createdAt ?? 0) < QUICK_ROUND_TTL_MS);
}

/**
 * 실제로 풀이가 일어나는 모드 목록(게이트 'home' 제외) — 답안·채점 키가 생기는 모드다.
 * storage의 이력 허용 모드도 여기서 파생한다: 두 목록을 따로 관리하면 모드를 추가할 때
 * 한쪽 누락으로 이력이 무단 폐기되거나(그 결함이 실제로 났다) 초기화가 반쪽이 된다.
 */
export const PLAY_MODES = ['exam', 'practice', 'random', 'review', 'quick'] as const;

/** 퀵에서 고를 수 있는 문항 수. 듀오링고식 짧은 세션 규모. */
export const QUICK_SIZES = [10, 15, 20] as const;

/**
 * 문항 수를 고르지 않는 퀵 — 제품의 전 세트를 섞어 끝까지 낸다.
 *
 * 사이드바의 문항 수 선택을 없앤 뒤(끝이 정해지지 않은 모드에 '10문항'을 고르게 하는 것은
 * 거짓말이다) 진입로가 넘길 값이 없어졌다. 추첨은 useQuestions가 `Math.min(size, pool.length)`로
 * 하므로 풀보다 큰 값은 곧 '전부'다 — quickSize를 nullable로 만들어 추첨·복원·영속화
 * 세 곳에 분기를 추가하는 대신 상수 하나로 같은 뜻을 표현한다.
 */
export const QUICK_ALL = Number.MAX_SAFE_INTEGER;

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
  /**
   * 퀵 회차 — 이력(histories)과 분리해 둔다. 여기 있는 것은 회차 목록·요약·타임라인에
   * 들어가지 않고, 챕터 통계와 '최근 퀵 오답'에만 쓰이며 24시간 뒤 사라진다.
   */
  quickRounds: ExamHistory[];
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
  // 랜덤 '새 문제 뽑기' 트리거 — 증가하면 useQuestions가 현재 추첨을 버리고 재추첨한다.
  randomNonce: number;
  // 랜덤 현재 추첨(뽑힌 문항 id 목록)을 영속화해 새로고침 시 같은 문항으로 이어풀게 한다.
  // null이면 미추첨/재추첨 필요. 모드 진입·'새 문제 뽑기'는 이 값을 비워 새 추첨을 유도한다.
  randomDraw: { setId: string; chapter: string | null; ids: string[] } | null;
  // 퀵 추첨 스냅샷 — 전 세트에서 뽑으므로 randomDraw(세트 하나 전제)와 별도 필드다.
  // 문항 id만으로는 어느 세트에서 왔는지 알 수 없어(오답 귀속·복원에 필요) setId를 함께 남긴다.
  quickDraw: { certification: string; items: { id: string; setId: string }[] } | null;
  // 퀵에 들어가기 직전에 풀던 세트 — 나올 때 그 자리로 돌려놓는다.
  // 퀵에서는 setId가 센티넬(QUICK)이라, 이 값이 없으면 사이드바의 자동 세트 선택 effect가
  // "어느 세트도 아님"을 보고 첫 세트로 되돌린다. 퀵을 잠깐 들른 대가로 풀던 세트를 잃는 셈이다.
  preQuickSetId: string | null;
  quickSize: number;
  quickNonce: number;

  // Actions
  setActiveProduct: (product: 'istqb' | 'csts') => void;
  setMode: (mode: QuizMode) => void;
  setSetId: (setId: string) => void;
  setIndex: (index: number | ((prev: number) => number)) => void;
  setAnswer: (key: string, selected: string[]) => void;
  addHistory: (history: ExamHistory) => void;
  /** 퀵 회차를 임시 보관에 넣는다(만료된 것은 이때 함께 청소한다). */
  addQuickRound: (round: ExamHistory) => void;
  clearQuickRounds: (certification?: string | null) => void;
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
  setPendingSetChange: (setId: string | null) => void;
  setPendingRedraw: (open: boolean) => void;
  setPendingRestart: (open: boolean) => void;
  setConfirmExitExam: (open: boolean) => void;
  /** 오답 재풀이로 맞힌 문항 번호를 기록한다(재풀이 대상에서 제외). */
  markReviewed: (setId: string, numbers: number[]) => void;
  /** 다시 틀린 문항은 '복습함'에서 되돌린다 — 채점 시 호출. */
  unmarkReviewed: (setId: string, numbers: number[]) => void;
  // 세트 전환(교체 + 새 세션 + 모드별 후처리). 사이드바·확인 모달의 공용 진입점.
  commitSetChange: (setId: string) => void;
  redrawRandom: () => void;
  setRandomDraw: (draw: QuizState['randomDraw']) => void;
  setQuickDraw: (draw: QuizState['quickDraw']) => void;
  /** 퀵 진입 — 문항 수를 정하고 새로 추첨하게 한다(기존 추첨은 버린다). */
  startQuick: (size: number) => void;
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
  // 퀵도 제품 스코프다 — 제품을 바꾸면 이전 제품 문항으로 이어풀기가 되지 않게 비운다.
  quickDraw: null as { certification: string; items: { id: string; setId: string }[] } | null,
  // 퀵 회차도 제품 스코프다. 여기 없으면 hydrate가 이전 제품 값을 덮지 못해(복원 값이
  // 비어 있으면 sanitizeUiState가 필드를 아예 넣지 않는다) ISTQB 회차가 CSTS 메모리에
  // 살아남고, 이어지는 saveUiState가 그것을 CSTS 저장소 키에 기록한다 — 제품 간 오염이다.
  // 화면의 productQuickRounds 필터는 certification 없는 회차를 통과시켜 방어가 완전하지 않다.
  quickRounds: [] as ExamHistory[],
  // 사용자가 고른 퀵 문항 수. 추첨 시점에만 쓰이므로 세션 스코프로 충분하다.
  quickSize: QUICK_SIZES[0] as number,
  quickNonce: 0,
  // 제품이 바뀌면 돌아갈 세트도 남의 제품 것이 되므로 함께 비운다.
  preQuickSetId: null as string | null,
});

export const useQuizStore = create<QuizState>((set, get) => ({
  activeProduct: null,
  mode: 'home',
  setId: '',
  index: 0,
  answers: {},
  histories: {},
  quickRounds: [],
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
  pendingRestart: false,
  confirmExitExam: false,
  reviewedOk: {},
  randomNonce: 0,
  randomDraw: null,
  quickDraw: null,
  quickSize: QUICK_SIZES[0] as number,
  quickNonce: 0,
  preQuickSetId: null,

  setActiveProduct: (activeProduct) => set({ activeProduct }),
  //
  // 퀵의 setId 못박기 — 불변식: `mode === 'quick'` ⇒ `setId === QUICK_SET_ID`.
  //
  // 퀵은 제품의 전 세트에서 뽑으므로 '현재 세트'가 없다. 그런데 답안·채점 키가
  // `${setId}-${mode}-${qid}`라, setId가 실재 세트로 남아 있으면 퀵 답안이 그 세트의
  // 네임스페이스에 쌓인다. 그러면 startQuick의 잔재 정리(QUICK-quick-* 접두 삭제)가
  // 통째로 빗나가 이전 회차의 답이 남고, 채점 키도 갈려 '이미 채점됨' 판정이 어긋난다.
  //
  // 종전에는 startQuick만 이 못을 박았다. 하지만 퀵 진입로는 둘이고(모드 세그먼트,
  // 퀵 패널의 시작 버튼) 세그먼트는 setMode만 부른다 — 그쪽으로 들어온 퀵은 직전 세트
  // id를 그대로 달고 있었다. 진입로마다 규칙을 두는 대신 모드 전환의 단일 통로인
  // 여기서 세운다(사이드바의 자동 세트 선택 effect가 이미 이 불변식을 전제로 가드한다).
  setMode: (mode) => set((state) => {
    const next: Partial<QuizState> = { mode };
    // 모드/세트가 바뀌면 챕터 필터는 의미를 잃으므로 함께 해제한다(필터는 현재 연습 세션 한정).
    // 단 "같은 모드로 재확정"하는 경로에서는 해제하지 않는다 — 복원 직후 App이 저장된 모드를
    // 그대로 setMode로 재확정하는데, 여기서 필터가 지워지면 미니 시험(랜덤+챕터) 복원이
    // 무효화돼 저장된 추첨과 스코프가 어긋나고 일반 랜덤으로 무통보 재추첨된다.
    if (state.mode !== mode) next.chapterFilter = null;
    if (mode === 'quick') {
      // 나올 때 돌아갈 자리를 기억해 둔다 — 이것이 없으면 퀵을 잠깐 들른 것만으로 풀던
      // 세트를 잃는다(사이드바 effect가 센티넬을 보고 첫 세트로 되돌려 놓는다).
      if (state.setId !== QUICK_SET_ID) next.preQuickSetId = state.setId;
      next.setId = QUICK_SET_ID;
    } else if (state.setId === QUICK_SET_ID && state.preQuickSetId) {
      next.setId = state.preQuickSetId;
      next.preQuickSetId = null;
    }
    return next;
  }),
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
  addQuickRound: (round) => set((state) => ({
    // 넣을 때 만료분을 함께 버린다 — 읽는 쪽에서도 거르지만, 저장소가 무한정 자라는 것은 막는다.
    quickRounds: [...freshQuickRounds(state.quickRounds), round],
  })),
  clearQuickRounds: (certification) => set((state) => ({
    // 이력 비우기는 현재 제품만 지운다 — 퀵도 같은 범위를 따른다.
    // certification이 없던 과거 회차는 어느 제품인지 알 수 없으므로 함께 버린다
    // (24시간 임시 목록이라 보존 가치가 없고, 남으면 지울 방법이 사라진다).
    quickRounds: certification
      ? state.quickRounds.filter((r) => !!r.certification && r.certification !== certification)
      : [],
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
  setPendingSetChange: (pendingSetChange) => set({ pendingSetChange }),
  setPendingRedraw: (pendingRedraw) => set({ pendingRedraw }),
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
      Object.keys(prev.answers).some((k) => k.startsWith(answerKeyPrefix(newSetId, 'exam')))
    ) {
      set({ resumePrompt: true });
    }
  },
  // '새 문제 뽑기' — 세대(nonce)를 올리고 저장된 추첨을 비워 useQuestions가 새로 추첨하게 한다.
  redrawRandom: () => set((state) => ({ randomNonce: state.randomNonce + 1, randomDraw: null })),
  setRandomDraw: (randomDraw) => set({ randomDraw }),
  setQuickDraw: (quickDraw) => set({ quickDraw }),
  // 추첨을 비워 새로 뽑게 한다 — 진입할 때마다 같은 문항이 나오면 '퀵'의 의미가 없다.
  startQuick: (quickSize) => set((state) => {
    // 이전 퀵 회차의 답안·채점 상태를 반드시 비운다. 퀵의 setId·mode는 항상 같아서
    // 채점 키(QUICK-quick)도 늘 같다 — 남겨 두면 두 번째 세션이 '이미 채점됨' 상태로
    // 시작해 보기가 잠기고(정답이 미리 공개된 채) 채점 버튼도 뜨지 않는다.
    // 답안도 함께 지운다: 재수록 문항이 다시 뽑히면 이전 회차의 답이 선택된 채로 보인다.
    const prefix = answerKeyPrefix(QUICK_SET_ID, 'quick');
    const nextAnswers = { ...state.answers };
    for (const key in nextAnswers) {
      if (key.startsWith(prefix)) delete nextAnswers[key];
    }
    return {
      mode: 'quick', setId: QUICK_SET_ID, quickSize, quickDraw: null, index: 0,
      chapterFilter: null, quickNonce: state.quickNonce + 1,
      answers: nextAnswers,
      graded: { ...state.graded, [gradeKeyFor(QUICK_SET_ID, 'quick')]: false },
      // 세그먼트 진입(setMode)과 같은 규칙으로 돌아갈 세트를 기억한다. 퀵 안에서 '다시 섞어
      // 시작'을 누르면 setId가 이미 센티넬이므로 그때는 앞서 기억한 값을 그대로 둔다.
      preQuickSetId: state.setId !== QUICK_SET_ID ? state.setId : state.preQuickSetId,
    };
  }),
  // 진입/캐시 복원 시 항상 최초 화면(제품 선택 게이트)으로 — 오버레이도 모두 닫는다.
  resetToGate: () => set({
    mode: 'home', activeProduct: null,
    drawerOpen: false, settingsOpen: false, statsOpen: false,
    wrongNoteOpen: false, resultOpen: false, paletteOpen: false, confirmGradeOpen: false,
    resumeNotice: false, resumePrompt: false, quitExamOpen: false, gradedResume: null,
    pendingSetChange: null, pendingRedraw: false, pendingRestart: false, confirmExitExam: false,
    // 제품 게이트로 돌아가면 시험 시작 상태도 리셋(다음 진입 시 시작 게이트 재노출).
    examStarted: {}, chapterFilter: null,
  }),
  hydrate: (hydratedState) => set((state) => {
    const next = { ...state, ...hydratedState };
    // 복원도 setMode와 같은 불변식을 지킨다(mode === 'quick' ⇒ setId === QUICK_SET_ID).
    // 저장소는 mode와 setId를 각각 담으므로 둘의 조합이 깨진 채로 돌아올 수 있다 —
    // 이 규칙이 서기 전에 퀵으로 종료한 세션, 또는 손댄 백업 파일이 그렇다.
    // 그대로 두면 퀵 답안이 실재 세트의 네임스페이스로 흘러 잔재 정리가 빗나간다.
    if (next.mode === 'quick') next.setId = QUICK_SET_ID;
    return next;
  }),
}));
