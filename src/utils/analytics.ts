import { Capacitor } from '@capacitor/core';
import { safeGetItem, safeSetItem } from './safeStorage';

// GA4 최소 사용 통계 — "어떤 기능을 얼마나 쓰는가"만 센다.
//
// 이 앱의 구조(서버·계정·수집 없음)를 깨지 않으려고 세 가지를 지킨다:
//  1. 측정 ID(VITE_GA_ID)가 없으면 아무것도 하지 않는다. 로컬·E2E·CI 빌드는 ID가 없어
//     스크립트를 내려받지도, 설정 화면에 토글을 그리지도 않는다(기본값이 꺼짐).
//  2. 보내는 것은 행동 이름과 모드·제품뿐이다. 문항 id·지문·답안·점수·챕터명·세트명은
//     어떤 경로로도 실리지 않는다(문항은 제3자 저작물이고, 결과는 학습자의 것이다).
//     허용 목록은 sanitizeParams가 강제한다.
//  3. 사용자가 끌 수 있다. 끄면 ga-disable 플래그로 이미 로드된 gtag도 멈춘다.
//     브라우저의 추적 거부 신호(Global Privacy Control·Do Not Track)도 따른다.

export const OPT_OUT_KEY = 'istqb-analytics-optout';
const ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;

export type AnalyticsEventName =
  | 'mode_enter'
  | 'exam_graded'
  | 'stats_open'
  | 'wrong_note_open'
  | 'backup_export'
  | 'backup_import';

export type AnalyticsMode = 'practice' | 'exam' | 'quick' | 'review' | 'mini';
export type AnalyticsProduct = 'istqb' | 'csts';

export interface AnalyticsParams {
  mode?: AnalyticsMode;
  product?: AnalyticsProduct;
}

const MODES: readonly string[] = ['practice', 'exam', 'quick', 'review', 'mini'];
const PRODUCTS: readonly string[] = ['istqb', 'csts'];

/** 허용 목록 밖의 키·값은 버린다 — 새 파라미터는 여기에 명시적으로 추가해야만 나간다. */
export function sanitizeParams(params: AnalyticsParams | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (params?.mode && MODES.includes(params.mode)) out.mode = params.mode;
  if (params?.product && PRODUCTS.includes(params.product)) out.product = params.product;
  return out;
}

/**
 * 안내·스위치가 그릴 상태. 문자열이라 `useSyncExternalStore`의 스냅샷으로 그대로 쓸 수 있다.
 *  - unconfigured: 측정 ID가 없는 빌드 — 아무것도 그리지 않는다.
 *  - blocked: 브라우저가 추적 거부 신호를 보낸다 — 우리 스위치로는 켤 수 없다.
 *  - off-unsaved: 껐지만 저장소에 기록하지 못했다(저장 차단·용량 초과) — 이번 세션만 꺼져 있고 다음 방문에 다시 켜진다.
 */
export type AnalyticsStatus = 'unconfigured' | 'blocked' | 'on' | 'off' | 'off-unsaved';

export interface AnalyticsNoticeView {
  text: string;
  /** 누를 수 있는 스위치. 동작할 수 없으면(blocked) 버튼을 내린다 — null. */
  action: { label: string; optOut: boolean } | null;
}

/**
 * 상태별 안내 문구와 스위치 — `AnalyticsNotice`(게이트·설정)가 그대로 그린다.
 * 컴포넌트는 측정 ID가 없는 테스트 빌드에서 렌더되지 않아 E2E가 닿지 않으므로, 무엇을 말하고
 * 무엇을 누르게 하는지는 유닛이 닿는 이곳에서 정한다.
 */
export function analyticsNoticeView(status: AnalyticsStatus): AnalyticsNoticeView | null {
  switch (status) {
    case 'unconfigured':
      return null;
    case 'blocked':
      return {
        text: '브라우저의 추적 거부 신호(Global Privacy Control·Do Not Track)에 따라 사용 통계를 보내지 않습니다.',
        action: null,
      };
    case 'on':
      return {
        text: '어떤 기능을 쓰는지(모드·통계·백업 등 행동 이름)만 익명으로 집계합니다. 문항·답안·점수는 보내지 않습니다.',
        action: { label: '사용 통계 끄기', optOut: true },
      };
    case 'off':
      return { text: '사용 통계를 보내지 않는 중입니다.', action: { label: '사용 통계 켜기', optOut: false } };
    case 'off-unsaved':
      // 꺼졌다고만 말하면 거짓이 된다 — 다음 방문의 첫 전송은 다시 끄기 전에 나간다.
      return {
        text: '사용 통계를 보내지 않는 중입니다. 다만 이 브라우저에 설정을 저장하지 못했습니다 — 다음에 열면 다시 켜집니다.',
        action: { label: '사용 통계 켜기', optOut: false },
      };
  }
}

interface SignalNavigator {
  globalPrivacyControl?: unknown;
  doNotTrack?: unknown;
  msDoNotTrack?: unknown;
}

/**
 * 브라우저가 "추적하지 말라"는 신호를 보내는가.
 *
 * `navigator.doNotTrack`만 보면 대부분을 놓친다 — Firefox(135)와 Safari(12.1)는 이 속성을 없앴고,
 * 그 뒤를 잇는 신호는 Global Privacy Control이다(Firefox·Brave·DuckDuckGo 등). 남아 있는 구현의
 * 값도 갈린다: 표준은 '1', 옛 Firefox는 'yes', 옛 Safari·IE는 `window.doNotTrack`·`msDoNotTrack`.
 * 신호가 아예 없는 브라우저(Safari 등)는 여기서 알 길이 없다 — 그 사용자는 스위치로 끈다.
 */
export function browserSignalsNoTracking(
  nav: SignalNavigator | undefined,
  win: { doNotTrack?: unknown } | undefined,
): boolean {
  if (nav?.globalPrivacyControl === true) return true;
  return [nav?.doNotTrack, nav?.msDoNotTrack, win?.doNotTrack].some((v) => v === '1' || v === 'yes');
}

interface GtagWindow {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  location: { origin: string; pathname: string };
  addEventListener?: (type: 'storage', listener: (e: { key: string | null }) => void) => void;
  [key: string]: unknown;
}

interface AnalyticsDoc {
  createElement(tag: 'script'): { async: boolean; src: string };
  head: { appendChild(node: unknown): unknown };
}

export interface AnalyticsEnv {
  measurementId: string | undefined;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  win: GtagWindow | undefined;
  doc: AnalyticsDoc | undefined;
  doNotTrack: () => boolean;
  platform: string;
}

/** 환경을 주입받는 팩토리 — 유닛이 window·localStorage 없이 계약을 검사할 수 있다. */
export function createAnalytics(env: AnalyticsEnv) {
  const id = env.measurementId && ID_PATTERN.test(env.measurementId) ? env.measurementId : null;
  let loaded = false;
  // 저장이 막힌 환경(용량 초과·프라이빗 모드)에서는 옵트아웃을 쓰지 못한다 — safeSetItem이 실패를
  // 삼키므로 저장소만 다시 읽으면 "끄기"를 눌러도 전송이 멈추지 않는다. 쓴 값이 읽히지 않을 때만
  // 이번 세션의 메모리 값으로 대신한다(저장이 되는 환경에서는 쓰지 않아 다른 탭의 변경이 반영된다).
  let fallbackOptOut: boolean | null = null;
  // 켜짐/꺼짐이 바뀌면 화면의 안내·스위치가 따라가야 한다(다른 탭에서 바꾼 경우 포함).
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());
  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  const configured = () => id !== null;
  const optedOut = () => fallbackOptOut ?? env.getItem(OPT_OUT_KEY) === '1';
  const enabled = () => id !== null && !optedOut() && !env.doNotTrack();
  function status(): AnalyticsStatus {
    if (id === null) return 'unconfigured';
    if (env.doNotTrack()) return 'blocked';
    if (!optedOut()) return 'on';
    return fallbackOptOut === true ? 'off-unsaved' : 'off';
  }

  function syncDisableFlag() {
    // GA가 공식으로 지원하는 중단 스위치 — 이미 로드된 gtag.js도 이 값을 보고 전송을 멈춘다.
    if (id && env.win) env.win[`ga-disable-${id}`] = !enabled();
  }

  // 다른 탭에서 켜고 끈 것을 이 탭의 중단 플래그에 옮긴다. 플래그는 window마다 따로라서, 한 탭에서
  // 끄면 이미 gtag를 로드한 다른 탭은 우리 track()이 멈춰도 gtag 자체의 자동 이벤트
  // (user_engagement 등)를 계속 보낸다. storage 이벤트는 값을 바꾼 탭이 아닌 **다른** 탭에만 온다.
  // key가 null이면 저장소 전체를 비운 것이다(그때도 상태가 바뀐다).
  env.win?.addEventListener?.('storage', (e) => {
    if (e.key === null || e.key === OPT_OUT_KEY) {
      syncDisableFlag();
      notify();
    }
  });

  function init() {
    syncDisableFlag();
    if (!enabled() || loaded || !env.win || !env.doc || !id) return;
    loaded = true;
    const win = env.win;
    const dataLayer: unknown[] = (win.dataLayer = win.dataLayer ?? []);
    win.gtag = function gtag() {
      // gtag.js는 배열이 아니라 Arguments 객체를 요구한다(배열로 밀면 명령이 처리되지 않는다).
      // eslint-disable-next-line prefer-rest-params
      dataLayer.push(arguments);
    };
    const script = env.doc.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    env.doc.head.appendChild(script);
    win.gtag('js', new Date());
    win.gtag('config', id, {
      // 주소의 쿼리(?debug 등)와 리퍼러는 보내지 않는다.
      page_location: `${win.location.origin}${win.location.pathname}`,
      page_referrer: '',
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      app_platform: env.platform,
    });
  }

  function track(name: AnalyticsEventName, params?: AnalyticsParams) {
    if (!enabled()) return;
    init();
    env.win?.gtag?.('event', name, sanitizeParams(params));
  }

  function setOptOut(optOut: boolean) {
    const value = optOut ? '1' : '0';
    env.setItem(OPT_OUT_KEY, value);
    fallbackOptOut = env.getItem(OPT_OUT_KEY) === value ? null : optOut;
    syncDisableFlag();
    notify();
  }

  return { configured, enabled, status, init, track, setOptOut, subscribe };
}

const hasWindow = typeof window !== 'undefined';

const instance = createAnalytics({
  measurementId: import.meta.env.VITE_GA_ID,
  getItem: safeGetItem,
  setItem: safeSetItem,
  win: hasWindow ? (window as unknown as GtagWindow) : undefined,
  doc: typeof document !== 'undefined' ? (document as unknown as AnalyticsDoc) : undefined,
  doNotTrack: () => browserSignalsNoTracking(
    typeof navigator !== 'undefined' ? navigator : undefined,
    hasWindow ? (window as { doNotTrack?: unknown }) : undefined,
  ),
  platform: Capacitor.getPlatform(),
});

export const initAnalytics = instance.init;
export const track = instance.track;
export const setAnalyticsOptOut = instance.setOptOut;
export const analyticsStatus = instance.status;
export const subscribeAnalytics = instance.subscribe;
