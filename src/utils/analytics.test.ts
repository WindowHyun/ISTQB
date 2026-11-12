import { describe, expect, it } from 'vitest';
import {
  analyticsNoticeView, browserSignalsNoTracking, createAnalytics, OPT_OUT_KEY, sanitizeParams,
  type AnalyticsEnv, type AnalyticsStatus,
} from './analytics';

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

describe('status — 안내·스위치가 그릴 상태', () => {
  it('측정 ID가 없으면 unconfigured(브라우저 신호보다 먼저다 — 꺼진 빌드는 아무 말도 하지 않는다)', () => {
    expect(createAnalytics(fakeEnv({ measurementId: undefined }).env).status()).toBe('unconfigured');
    expect(createAnalytics(fakeEnv({ measurementId: undefined, doNotTrack: () => true }).env).status()).toBe('unconfigured');
  });

  it('브라우저 신호가 있으면 저장된 선택과 무관하게 blocked', () => {
    const f = fakeEnv({ doNotTrack: () => true });
    const a = createAnalytics(f.env);
    expect(a.status()).toBe('blocked');
    a.setOptOut(true);
    expect(a.status()).toBe('blocked');
  });

  it('켜짐 ↔ 꺼짐: 저장이 되면 on / off', () => {
    const a = createAnalytics(fakeEnv().env);
    expect(a.status()).toBe('on');
    a.setOptOut(true);
    expect(a.status()).toBe('off');
    a.setOptOut(false);
    expect(a.status()).toBe('on');
  });

  it('껐는데 저장되지 않았으면 off-unsaved — 다음 방문에 다시 켜진다는 것을 알릴 수 있다', () => {
    const a = createAnalytics(fakeEnv({ setItem: () => undefined }).env);
    a.setOptOut(true);
    expect(a.status()).toBe('off-unsaved');
    expect(a.enabled()).toBe(false);
    // 다시 켠 것도 저장되지 않지만, 켜짐은 기본값이라 알릴 것이 없다.
    a.setOptOut(false);
    expect(a.status()).toBe('on');
  });

  it('이전 방문에서 저장된 끄기는 저장이 막힌 지금도 그냥 off다(남아 있는 값이다)', () => {
    const f = fakeEnv({ setItem: () => undefined });
    f.store.set(OPT_OUT_KEY, '1');
    expect(createAnalytics(f.env).status()).toBe('off');
  });
});

describe('analyticsNoticeView — 상태별 문구와 스위치', () => {
  it('꺼진 빌드는 아무것도 그리지 않는다', () => {
    expect(analyticsNoticeView('unconfigured')).toBeNull();
  });

  it('브라우저가 막았으면 눌러도 안 켜지는 버튼을 내린다', () => {
    const v = analyticsNoticeView('blocked');
    expect(v?.action).toBeNull();
    expect(v?.text).toContain('Global Privacy Control');
    expect(v?.text).toContain('Do Not Track');
  });

  it('버튼은 지금 상태의 반대로 가는 일을 이름과 동작 모두에서 말한다', () => {
    expect(analyticsNoticeView('on')?.action).toEqual({ label: '사용 통계 끄기', optOut: true });
    expect(analyticsNoticeView('off')?.action).toEqual({ label: '사용 통계 켜기', optOut: false });
    expect(analyticsNoticeView('off-unsaved')?.action).toEqual({ label: '사용 통계 켜기', optOut: false });
  });

  it('켜져 있을 때만 "집계합니다"라고 말한다', () => {
    const says = (s: AnalyticsStatus) => analyticsNoticeView(s)?.text ?? '';
    expect(says('on')).toContain('집계합니다');
    for (const s of ['off', 'off-unsaved', 'blocked'] as const) {
      expect(says(s)).not.toContain('집계합니다');
      expect(says(s)).toContain('보내지 않');
    }
  });

  it('저장되지 않은 끄기는 다음 방문에 다시 켜진다고 알린다 — 저장된 끄기는 그 말을 하지 않는다', () => {
    expect(analyticsNoticeView('off-unsaved')?.text).toContain('다시 켜집니다');
    expect(analyticsNoticeView('off')?.text).not.toContain('다시 켜집니다');
  });

  it('스위치를 누른 결과가 화면이 말한 상태가 된다(문구 ↔ 동작 왕복)', () => {
    const a = createAnalytics(fakeEnv().env);
    for (const expected of ['off', 'on', 'off'] as const) {
      const action = analyticsNoticeView(a.status())?.action;
      a.setOptOut(action!.optOut);
      expect(a.status()).toBe(expected);
    }
  });
});

describe('browserSignalsNoTracking — 브라우저의 추적 거부 신호', () => {
  it('신호가 없으면 false(속성이 없는 브라우저 포함)', () => {
    expect(browserSignalsNoTracking(undefined, undefined)).toBe(false);
    expect(browserSignalsNoTracking({}, {})).toBe(false);
    expect(browserSignalsNoTracking({ doNotTrack: null, globalPrivacyControl: false }, {})).toBe(false);
    expect(browserSignalsNoTracking({ doNotTrack: '0' }, { doNotTrack: 'unspecified' })).toBe(false);
  });

  it('Global Privacy Control — DNT를 없앤 브라우저(Firefox 등)의 신호', () => {
    expect(browserSignalsNoTracking({ globalPrivacyControl: true }, {})).toBe(true);
    // 불리언 true만 신호다(문자열 등 다른 값을 넓게 받아들이지 않는다).
    expect(browserSignalsNoTracking({ globalPrivacyControl: 'true' }, {})).toBe(false);
  });

  it('Do Not Track — 표준 값과 옛 구현의 자리·값', () => {
    expect(browserSignalsNoTracking({ doNotTrack: '1' }, {})).toBe(true);
    expect(browserSignalsNoTracking({ doNotTrack: 'yes' }, {})).toBe(true);
    expect(browserSignalsNoTracking({ msDoNotTrack: '1' }, {})).toBe(true);
    expect(browserSignalsNoTracking({}, { doNotTrack: '1' })).toBe(true);
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
