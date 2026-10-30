import { describe, expect, it } from 'vitest';
import { createAnalytics, OPT_OUT_KEY, sanitizeParams, type AnalyticsEnv } from './analytics';

function fakeEnv(over: Partial<AnalyticsEnv> = {}) {
  const store = new Map<string, string>();
  const scripts: Array<{ async: boolean; src: string }> = [];
  const win = { location: { origin: 'https://app.example', pathname: '/' } } as AnalyticsEnv['win'] & Record<string, unknown>;
  const env: AnalyticsEnv = {
    measurementId: 'G-TEST1234',
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    win,
    doc: {
      createElement: () => {
        const s = { async: false, src: '' };
        scripts.push(s);
        return s;
      },
      head: { appendChild: () => undefined },
    },
    doNotTrack: () => false,
    platform: 'web',
    ...over,
  };
  const calls = () => ((win as { dataLayer?: unknown[] }).dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>));
  return { env, store, scripts, win, calls };
}

describe('측정 ID가 없거나 형식이 틀리면 완전히 꺼진다', () => {
  for (const id of [undefined, '', 'UA-12345', 'G-', 'g-test1234', 'G-TEST 1234', '<script>']) {
    it(`id=${JSON.stringify(id)}`, () => {
      const f = fakeEnv({ measurementId: id });
      const a = createAnalytics(f.env);
      a.init();
      a.track('mode_enter', { mode: 'exam' });
      expect(a.configured()).toBe(false);
      expect(a.enabled()).toBe(false);
      expect(f.scripts).toHaveLength(0);
      expect(f.calls()).toHaveLength(0);
    });
  }
});

describe('켜진 상태', () => {
  it('init은 스크립트를 한 번만 주입하고 config를 보낸다', () => {
    const f = fakeEnv();
    const a = createAnalytics(f.env);
    a.init();
    a.init();
    expect(f.scripts).toHaveLength(1);
    expect(f.scripts[0].src).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST1234');
    const config = f.calls().find((c) => c[0] === 'config');
    expect(config?.[1]).toBe('G-TEST1234');
    expect(config?.[2]).toMatchObject({
      page_location: 'https://app.example/',
      page_referrer: '',
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      app_platform: 'web',
    });
  });

  it('track은 gtag가 요구하는 Arguments 객체로 dataLayer에 민다(배열이 아니다)', () => {
    const f = fakeEnv();
    const a = createAnalytics(f.env);
    a.track('stats_open', { product: 'csts' });
    const dl = (f.win as { dataLayer: unknown[] }).dataLayer;
    const last = dl[dl.length - 1];
    expect(Array.isArray(last)).toBe(false);
    expect(Array.from(last as ArrayLike<unknown>)).toEqual(['event', 'stats_open', { product: 'csts' }]);
  });

  it('init 없이 track만 불러도 지연 초기화된다', () => {
    const f = fakeEnv();
    createAnalytics(f.env).track('backup_export');
    expect(f.scripts).toHaveLength(1);
  });
});

describe('끄기', () => {
  it('옵트아웃이면 스크립트도 이벤트도 없다', () => {
    const f = fakeEnv();
    f.store.set(OPT_OUT_KEY, '1');
    const a = createAnalytics(f.env);
    a.init();
    a.track('mode_enter', { mode: 'quick' });
    expect(a.enabled()).toBe(false);
    expect(f.scripts).toHaveLength(0);
    expect(f.calls()).toHaveLength(0);
  });

  it('세션 중에 끄면 이후 이벤트가 멈추고 ga-disable 플래그가 선다', () => {
    const f = fakeEnv();
    const a = createAnalytics(f.env);
    a.track('mode_enter', { mode: 'practice' });
    const before = f.calls().length;
    a.setOptOut(true);
    a.track('mode_enter', { mode: 'exam' });
    expect(f.calls()).toHaveLength(before);
    expect((f.win as Record<string, unknown>)['ga-disable-G-TEST1234']).toBe(true);
    expect(f.store.get(OPT_OUT_KEY)).toBe('1');
  });

  it('다시 켜면 플래그가 풀리고 이벤트가 나간다', () => {
    const f = fakeEnv();
    const a = createAnalytics(f.env);
    a.track('mode_enter', { mode: 'practice' });
    a.setOptOut(true);
    a.setOptOut(false);
    const before = f.calls().length;
    a.track('mode_enter', { mode: 'exam' });
    expect(f.calls()).toHaveLength(before + 1);
    expect((f.win as Record<string, unknown>)['ga-disable-G-TEST1234']).toBe(false);
  });

  it('저장이 막혀 옵트아웃이 저장되지 않아도 이번 세션에서는 멈춘다', () => {
    // 쓰기가 조용히 실패하는 환경(용량 초과·프라이빗 모드) — safeSetItem이 예외를 삼킨다.
    const f = fakeEnv({ setItem: () => undefined });
    const a = createAnalytics(f.env);
    a.track('mode_enter', { mode: 'practice' });
    const before = f.calls().length;
    a.setOptOut(true);
    a.track('mode_enter', { mode: 'exam' });
    expect(a.enabled()).toBe(false);
    expect(f.calls()).toHaveLength(before);
    expect((f.win as Record<string, unknown>)['ga-disable-G-TEST1234']).toBe(true);
  });

  it('저장이 막힌 채 다시 켤 수도 있다(메모리 상태가 우선)', () => {
    const f = fakeEnv({ setItem: () => undefined });
    const a = createAnalytics(f.env);
    a.setOptOut(true);
    a.setOptOut(false);
    expect(a.enabled()).toBe(true);
  });

  it('저장이 정상이면 메모리 상태를 쓰지 않아 다른 탭의 변경이 반영된다', () => {
    const f = fakeEnv();
    const a = createAnalytics(f.env);
    a.setOptOut(true);
    f.store.set(OPT_OUT_KEY, '0'); // 다른 탭에서 다시 켬
    expect(a.enabled()).toBe(true);
  });

  it('다른 탭에서 끄면 이 탭의 중단 플래그도 선다(storage 이벤트)', () => {
    const f = fakeEnv();
    const listeners: Array<(e: { key: string | null }) => void> = [];
    (f.win as { addEventListener?: unknown }).addEventListener = (_t: string, fn: (e: { key: string | null }) => void) => {
      listeners.push(fn);
    };
    const a = createAnalytics(f.env);
    a.track('mode_enter', { mode: 'practice' }); // 이 탭은 이미 gtag를 로드했다
    expect((f.win as Record<string, unknown>)['ga-disable-G-TEST1234']).toBe(false);

    f.store.set(OPT_OUT_KEY, '1'); // 다른 탭이 저장소에 쓴다
    listeners.forEach((fn) => fn({ key: OPT_OUT_KEY }));
    expect((f.win as Record<string, unknown>)['ga-disable-G-TEST1234']).toBe(true);

    f.store.set(OPT_OUT_KEY, '0'); // 다른 탭이 다시 켠다
    listeners.forEach((fn) => fn({ key: OPT_OUT_KEY }));
    expect((f.win as Record<string, unknown>)['ga-disable-G-TEST1234']).toBe(false);
  });

  it('상관없는 키의 storage 이벤트는 플래그를 건드리지 않는다, 저장소 전체 삭제(key=null)는 반영한다', () => {
    const f = fakeEnv();
    const listeners: Array<(e: { key: string | null }) => void> = [];
    (f.win as { addEventListener?: unknown }).addEventListener = (_t: string, fn: (e: { key: string | null }) => void) => {
      listeners.push(fn);
    };
    const a = createAnalytics(f.env);
    a.track('mode_enter', { mode: 'practice' });
    f.store.set(OPT_OUT_KEY, '1');
    listeners.forEach((fn) => fn({ key: 'other-key' }));
    expect((f.win as Record<string, unknown>)['ga-disable-G-TEST1234']).toBe(false);
    listeners.forEach((fn) => fn({ key: null }));
    expect((f.win as Record<string, unknown>)['ga-disable-G-TEST1234']).toBe(true);
  });

  it('상태가 바뀌면 구독자에게 알린다 — 이 탭에서 바꿀 때와 다른 탭의 storage 이벤트 모두', () => {
    const f = fakeEnv();
    const storageListeners: Array<(e: { key: string | null }) => void> = [];
    (f.win as { addEventListener?: unknown }).addEventListener = (_t: string, fn: (e: { key: string | null }) => void) => {
      storageListeners.push(fn);
    };
    const a = createAnalytics(f.env);
    let calls = 0;
    const unsubscribe = a.subscribe(() => { calls += 1; });

    a.setOptOut(true);
    expect(calls).toBe(1);
    storageListeners.forEach((fn) => fn({ key: OPT_OUT_KEY }));
    expect(calls).toBe(2);
    storageListeners.forEach((fn) => fn({ key: 'other-key' })); // 상관없는 키는 알리지 않는다
    expect(calls).toBe(2);

    unsubscribe();
    a.setOptOut(false);
    expect(calls).toBe(2);
  });

  it('Do Not Track이면 켤 수 없다', () => {
    const f = fakeEnv({ doNotTrack: () => true });
    const a = createAnalytics(f.env);
    a.setOptOut(false);
    a.track('mode_enter', { mode: 'exam' });
    expect(a.enabled()).toBe(false);
    expect(f.scripts).toHaveLength(0);
  });

  it('window·document가 없는 환경(SSR·유닛)에서도 던지지 않는다', () => {
    const a = createAnalytics(fakeEnv({ win: undefined, doc: undefined }).env);
    expect(() => { a.init(); a.track('stats_open'); }).not.toThrow();
  });
});

describe('sanitizeParams — 허용 목록 밖은 어떤 경로로도 나가지 않는다', () => {
  it('허용된 값만 통과', () => {
    expect(sanitizeParams({ mode: 'mini', product: 'istqb' })).toEqual({ mode: 'mini', product: 'istqb' });
  });

  it('문항·점수·챕터 같은 임의 키는 버린다', () => {
    const dirty = { mode: 'exam', questionId: 'ISTQB-A-001', score: 31, chapter: '테스트 기초', answers: ['A'] } as never;
    expect(sanitizeParams(dirty)).toEqual({ mode: 'exam' });
  });

  it('허용 목록에 없는 값은 버린다', () => {
    expect(sanitizeParams({ mode: 'random' as never, product: 'ISTQB 샘플문제 A' as never })).toEqual({});
    expect(sanitizeParams(undefined)).toEqual({});
  });

  it('track이 sanitize를 거친다', () => {
    const f = fakeEnv();
    const a = createAnalytics(f.env);
    a.track('exam_graded', { mode: 'exam', score: 99, questionId: 'X' } as never);
    const ev = f.calls().find((c) => c[0] === 'event');
    expect(ev?.[2]).toEqual({ mode: 'exam' });
  });
});
