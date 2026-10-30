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
//     브라우저의 Do Not Track도 따른다.

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

interface GtagWindow {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  location: { origin: string; pathname: string };
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

  const configured = () => id !== null;
  const optedOut = () => fallbackOptOut ?? env.getItem(OPT_OUT_KEY) === '1';
  const enabled = () => id !== null && !optedOut() && !env.doNotTrack();

  function syncDisableFlag() {
    // GA가 공식으로 지원하는 중단 스위치 — 이미 로드된 gtag.js도 이 값을 보고 전송을 멈춘다.
    if (id && env.win) env.win[`ga-disable-${id}`] = !enabled();
  }

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
  }

  return { configured, enabled, init, track, setOptOut, blockedByBrowser: env.doNotTrack };
}

const hasWindow = typeof window !== 'undefined';

const instance = createAnalytics({
  measurementId: import.meta.env.VITE_GA_ID,
  getItem: safeGetItem,
  setItem: safeSetItem,
  win: hasWindow ? (window as unknown as GtagWindow) : undefined,
  doc: typeof document !== 'undefined' ? (document as unknown as AnalyticsDoc) : undefined,
  doNotTrack: () => typeof navigator !== 'undefined' && navigator.doNotTrack === '1',
  platform: Capacitor.getPlatform(),
});

export const analyticsConfigured = instance.configured;
export const isAnalyticsEnabled = instance.enabled;
export const initAnalytics = instance.init;
export const track = instance.track;
export const setAnalyticsOptOut = instance.setOptOut;
export const analyticsBlockedByBrowser = instance.blockedByBrowser;
