import type { QuizMode } from '../store/useQuizStore';
import type { AnalyticsEventName, AnalyticsMode, AnalyticsParams, AnalyticsProduct } from './analytics';

// 스토어 전이를 사용 통계 이벤트로 옮긴다 — 순수 함수라 유닛이 닿는다.
// 컴포넌트마다 track 호출을 흩어 두면 새 진입로가 생길 때 한 곳이 빠지기 쉽다
// (이 저장소에서 "입구가 둘인 동작의 가드가 한쪽에만 남는" 결함이 반복됐다).

export interface EventSlice {
  mode: QuizMode;
  activeProduct: AnalyticsProduct | null;
  statsOpen: boolean;
  wrongNoteOpen: boolean;
  /** 오답 보기 화면(노트에서 문항 하나를 펼친 본문 화면). 열려 있으면 null이 아니다. */
  wrongView: unknown;
}

export interface DerivedEvent {
  name: AnalyticsEventName;
  params?: AnalyticsParams;
}

/**
 * 내부 모드를 사용 통계의 모드 이름으로 옮긴다. 풀이가 아닌 모드(home)는 null.
 *
 * 내부 모드 `random`은 모드 탭에 없고 통계의 챕터 미니 시험으로만 들어오므로 'mini'다.
 * 미니 시험에서 세트를 바꾸거나, 채점한 미니 시험이 복원되면 챕터 제한이 풀린 세트 전체
 * 랜덤이 되는데 그것도 'mini'로 센다 — 들어온 길이 미니 시험이라는 점은 같고, 챕터 필터는
 * 모드가 바뀐 **뒤에** 따로 놓이는 값이라(진입·복원 모두) 전이 시점에는 둘을 가를 수 없다.
 * 같은 이유로 `exam_graded`도 필터를 보지 않는다(보면 진입은 mini, 채점은 다른 이름이 된다).
 */
export function analyticsModeOf(mode: QuizMode): AnalyticsMode | null {
  switch (mode) {
    case 'practice':
    case 'exam':
    case 'quick':
    case 'review':
      return mode;
    case 'random':
      return 'mini';
    default:
      return null;
  }
}

export function deriveEvents(prev: EventSlice, next: EventSlice): DerivedEvent[] {
  const events: DerivedEvent[] = [];
  const product = next.activeProduct ?? undefined;

  if (next.mode !== prev.mode) {
    const mode = analyticsModeOf(next.mode);
    if (mode) events.push({ name: 'mode_enter', params: { mode, product } });
  }
  if (!prev.statsOpen && next.statsOpen) events.push({ name: 'stats_open', params: { product } });
  // 오답 보기 화면에서 '← 오답 노트'(또는 뒤로가기)로 돌아오면 노트가 다시 열리지만, 그것은
  // 같은 방문의 계속이다 — 세면 문항을 하나 볼 때마다 한 번씩 더해진다. 돌아오는 전이는
  // 직전 상태에 오답 보기 화면이 있다(스토어의 backToWrongNote가 한 번의 set으로 만든다).
  if (!prev.wrongNoteOpen && next.wrongNoteOpen && prev.wrongView == null) {
    events.push({ name: 'wrong_note_open', params: { product } });
  }
  return events;
}

// 사용자가 고르지 않은 상태 덮어쓰기(백업 가져오기)가 진행 중인 동안은 전이를 세지 않는다.
// 가져오기는 저장된 모드로 스토어를 통째로 덮는데, 그것은 "모드에 들어갔다"가 아니라
// "백업을 가져왔다"이고 그쪽은 `backup_import`가 이미 센다. 세션 복원(게이트 → 저장된 모드)은
// 사용자가 제품을 골라 들어간 것이라 여기에 해당하지 않는다.
let muted = 0;

/** `run`이 끝날 때까지(던져도) 스토어 전이를 이벤트로 옮기지 않는다. */
export async function muteTransitions<T>(run: () => Promise<T>): Promise<T> {
  muted += 1;
  try {
    return await run();
  } finally {
    muted -= 1;
  }
}

interface Subscribable {
  subscribe(listener: (state: EventSlice, prev: EventSlice) => void): () => void;
}

/** 스토어를 구독해 전이마다 이벤트를 보낸다. 반환값은 구독 해제 함수. */
export function startAnalyticsEvents(
  store: Subscribable,
  send: (name: AnalyticsEventName, params?: AnalyticsParams) => void,
): () => void {
  return store.subscribe((state, prev) => {
    if (muted > 0) return;
    for (const ev of deriveEvents(prev, state)) send(ev.name, ev.params);
  });
}
