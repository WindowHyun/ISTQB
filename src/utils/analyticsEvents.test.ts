import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useQuizStore } from '../store/useQuizStore';
import {
  analyticsModeOf, deriveEvents, muteTransitions, startAnalyticsEvents, type EventSlice,
} from './analyticsEvents';

const base: EventSlice = {
  mode: 'home', activeProduct: 'istqb', statsOpen: false, wrongNoteOpen: false, wrongView: null,
};
const at = (o: Partial<EventSlice>): EventSlice => ({ ...base, ...o });

describe('analyticsModeOf', () => {
  it('풀이 모드를 옮기고 random은 mini로, home은 버린다', () => {
    expect(analyticsModeOf('practice')).toBe('practice');
    expect(analyticsModeOf('exam')).toBe('exam');
    expect(analyticsModeOf('quick')).toBe('quick');
    expect(analyticsModeOf('review')).toBe('review');
    expect(analyticsModeOf('random')).toBe('mini');
    expect(analyticsModeOf('home')).toBeNull();
  });
});

describe('deriveEvents', () => {
  it('모드가 바뀌면 mode_enter(제품 포함)', () => {
    expect(deriveEvents(at({ mode: 'practice' }), at({ mode: 'exam', activeProduct: 'csts' }))).toEqual([
      { name: 'mode_enter', params: { mode: 'exam', product: 'csts' } },
    ]);
  });

  it('같은 모드로의 갱신(문항 이동 등)은 이벤트가 없다', () => {
    expect(deriveEvents(at({ mode: 'exam' }), at({ mode: 'exam' }))).toEqual([]);
  });

  it('게이트(home)로 돌아가는 것은 이벤트가 아니다', () => {
    expect(deriveEvents(at({ mode: 'exam' }), at({ mode: 'home' }))).toEqual([]);
  });

  it('미니 시험(내부 random)은 mini로 센다', () => {
    expect(deriveEvents(at({ mode: 'practice' }), at({ mode: 'random' }))[0].params?.mode).toBe('mini');
  });

  it('통계·오답 노트는 닫힘→열림에서만 센다', () => {
    expect(deriveEvents(at({}), at({ statsOpen: true })).map((e) => e.name)).toEqual(['stats_open']);
    expect(deriveEvents(at({ statsOpen: true }), at({ statsOpen: true }))).toEqual([]);
    expect(deriveEvents(at({ statsOpen: true }), at({ statsOpen: false }))).toEqual([]);
    expect(deriveEvents(at({}), at({ wrongNoteOpen: true })).map((e) => e.name)).toEqual(['wrong_note_open']);
  });

  it('오답 보기 화면에서 노트로 돌아온 것은 새로 연 것이 아니다', () => {
    const viewing = { setId: 'S', number: 3 };
    // 돌아오기: 화면이 닫히며 노트가 다시 열린다(한 번의 전이).
    expect(deriveEvents(at({ wrongView: viewing }), at({ wrongNoteOpen: true }))).toEqual([]);
    // 화면을 닫은 뒤(풀이로 나간 뒤) 다시 여는 것은 새 방문이다.
    expect(deriveEvents(at({}), at({ wrongNoteOpen: true })).map((e) => e.name)).toEqual(['wrong_note_open']);
    // 노트에서 문항을 펼치는 전이(노트가 닫힌다)는 이벤트가 없다.
    expect(deriveEvents(at({ wrongNoteOpen: true }), at({ wrongNoteOpen: true, wrongView: viewing }))).toEqual([]);
    expect(deriveEvents(at({ wrongNoteOpen: true, wrongView: viewing }), at({ wrongView: viewing }))).toEqual([]);
  });

  it('제품이 아직 없으면 product를 싣지 않는다', () => {
    const [ev] = deriveEvents(at({ mode: 'home' }), at({ mode: 'practice', activeProduct: null }));
    expect(ev.params?.product).toBeUndefined();
  });

  it('이벤트 params에는 허용 키(mode·product) 말고 아무것도 없다', () => {
    const evs = deriveEvents(at({}), at({ mode: 'exam', statsOpen: true, wrongNoteOpen: true }));
    for (const ev of evs) {
      for (const k of Object.keys(ev.params ?? {})) expect(['mode', 'product']).toContain(k);
    }
  });
});

describe('startAnalyticsEvents', () => {
  it('구독해서 전이마다 보내고, 해제하면 멈춘다', () => {
    let listener: ((s: EventSlice, p: EventSlice) => void) | null = null;
    const store = { subscribe: (l: (s: EventSlice, p: EventSlice) => void) => { listener = l; return () => { listener = null; }; } };
    const sent: string[] = [];
    const stop = startAnalyticsEvents(store, (name) => sent.push(name));
    listener!(at({ mode: 'exam', statsOpen: true }), at({ mode: 'practice' }));
    expect(sent).toEqual(['mode_enter', 'stats_open']);
    stop();
    expect(listener).toBeNull();
  });
});

// 순수 함수만 보면 "돌아오기가 한 번의 전이로 온다"는 전제가 검사 밖에 남는다 — 실제 스토어의
// 액션을 그대로 밟아, 화면이 부르는 순서대로 이벤트를 센다.
describe('실제 스토어 × 오답 노트 동선', () => {
  const view = (number: number) => ({ setId: 'ISTQB-FL-V4-A', number, myAnswer: ['A'], correctAnswer: ['B'] });
  let sent: string[];
  let stop: () => void;

  beforeEach(() => {
    useQuizStore.setState({ wrongNoteOpen: false, wrongView: null, statsOpen: false });
    sent = [];
    stop = startAnalyticsEvents(useQuizStore, (name) => sent.push(name));
  });
  afterEach(() => stop());

  it('노트를 한 번 열어 문항 다섯 개를 보고 와도 wrong_note_open은 1회다', () => {
    const s = useQuizStore.getState();
    s.setWrongNoteOpen(true);
    for (let n = 1; n <= 5; n += 1) {
      // AppModals의 '오답 보기': 화면을 열고 노트를 닫는다.
      s.setWrongView(view(n));
      s.setWrongNoteOpen(false);
      // WrongViewScreen의 '← 오답 노트'·뒤로가기.
      s.backToWrongNote();
      expect(useQuizStore.getState().wrongNoteOpen).toBe(true);
      expect(useQuizStore.getState().wrongView).toBeNull();
    }
    expect(sent).toEqual(['wrong_note_open']);
  });

  it('노트를 닫았다가 다시 열면 새 방문으로 센다', () => {
    const s = useQuizStore.getState();
    s.setWrongNoteOpen(true);
    s.setWrongView(view(1));
    s.setWrongNoteOpen(false);
    s.backToWrongNote();
    s.setWrongNoteOpen(false);
    s.setWrongNoteOpen(true);
    expect(sent).toEqual(['wrong_note_open', 'wrong_note_open']);
  });
});

describe('muteTransitions — 백업 가져오기가 스토어를 덮는 동안은 세지 않는다', () => {
  let sent: Array<[string, unknown]>;
  let stop: () => void;

  beforeEach(() => {
    useQuizStore.setState({ mode: 'practice', activeProduct: 'istqb', statsOpen: false, wrongNoteOpen: false, wrongView: null });
    sent = [];
    stop = startAnalyticsEvents(useQuizStore, (name, params) => sent.push([name, params]));
  });
  afterEach(() => stop());

  it('가져온 백업의 모드로 덮여도 mode_enter가 나가지 않고, 끝난 뒤의 전환은 다시 센다', async () => {
    const result = await muteTransitions(async () => {
      // importUserData → restorePersistentSnapshot이 하는 일: 저장된 모드로 hydrate.
      useQuizStore.getState().hydrate({ mode: 'exam' });
      return 'done';
    });
    expect(result).toBe('done');
    expect(useQuizStore.getState().mode).toBe('exam');
    expect(sent).toEqual([]);

    useQuizStore.getState().setMode('practice');
    expect(sent).toEqual([['mode_enter', { mode: 'practice', product: 'istqb' }]]);
  });

  it('덮어쓰기 없이는 같은 hydrate가 mode_enter다(세션 복원은 그대로 센다)', () => {
    useQuizStore.getState().hydrate({ mode: 'exam' });
    expect(sent.map(([n]) => n)).toEqual(['mode_enter']);
  });

  it('가져오기가 던져도 멈춤이 풀린다', async () => {
    await expect(muteTransitions(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    useQuizStore.getState().setMode('review');
    expect(sent.map(([n]) => n)).toEqual(['mode_enter']);
  });

  it('겹쳐 불러도 바깥이 끝날 때까지 멈춘다', async () => {
    await muteTransitions(async () => {
      await muteTransitions(async () => undefined);
      useQuizStore.getState().setMode('exam');
    });
    expect(sent).toEqual([]);
  });
});
