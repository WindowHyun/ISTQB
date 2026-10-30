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
}

export interface DerivedEvent {
  name: AnalyticsEventName;
  params?: AnalyticsParams;
}

/**
 * 내부 모드를 사용 통계의 모드 이름으로 옮긴다.
 * 내부 모드 `random`은 모드 탭에 없고 통계의 챕터 미니 시험으로만 들어오므로 'mini'다.
 * 풀이가 아닌 모드(home)는 null.
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
  if (!prev.wrongNoteOpen && next.wrongNoteOpen) events.push({ name: 'wrong_note_open', params: { product } });
  return events;
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
    for (const ev of deriveEvents(prev, state)) send(ev.name, ev.params);
  });
}
