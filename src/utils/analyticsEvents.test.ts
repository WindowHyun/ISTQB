import { describe, expect, it } from 'vitest';
import { analyticsModeOf, deriveEvents, startAnalyticsEvents, type EventSlice } from './analyticsEvents';

const base: EventSlice = { mode: 'home', activeProduct: 'istqb', statsOpen: false, wrongNoteOpen: false };
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
