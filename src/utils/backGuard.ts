// 뒤로가기로 오버레이(모달·드로어) 닫기.
//
// 문제: 이 앱은 라우터가 없고 오버레이가 전부 boolean 상태라 history 항목이 쌓이지
// 않는다. 그래서 안드로이드에서 오답노트를 보다 하드웨어 뒤로가기를 누르면 모달이
// 닫히는 게 아니라 앱이 그대로 종료됐다(웹에서도 브라우저 뒤로가기가 앱을 벗어났다).
//
// 해결: 오버레이가 하나라도 열리면 history 항목("가드")을 하나 쌓는다. 뒤로가기는 그
// 항목을 소비하고, 우리는 popstate에서 가장 위 오버레이를 닫는다. 남은 오버레이가
// 있으면 가드를 다시 세운다. 오버레이가 전부 닫히면 가드를 되돌린다(history.back()).
//
// 안드로이드는 @capacitor/app의 backButton 이벤트를 받아 같은 흐름으로 잇는다.
// 가드가 없을 때(=오버레이가 없을 때)만 앱을 종료한다 — 플러그인의 기본 동작은
// canGoBack이 false면 아무것도 하지 않아 뒤로가기가 먹통이 되므로 직접 처리한다.

export const BACK_PRIORITY = {
  /** 모바일 드로어 — 가장 아래. 그 위에 열린 모달이 먼저 닫힌다. */
  drawer: 10,
  /** 설정·통계·오답노트·결과·문항이동 등 주 모달. */
  modal: 20,
  /** 확인 대화상자·사용설명서 — 주 모달 위에서 열리므로 먼저 닫는다. */
  confirm: 30,
} as const;

interface Guard {
  priority: number;
  close: () => void;
}

const guards = new Set<Guard>();
/** history에 우리 가드 항목이 올라가 있는지. */
let pushed = false;
/** 우리가 부른 history.back()이 만든 popstate 1회를 무시하기 위한 플래그. */
let ignorePop = false;

function canUseHistory(): boolean {
  return typeof window !== 'undefined' && typeof window.history?.pushState === 'function';
}

/** 열려 있는 오버레이 중 가장 위(priority 최대)를 닫는다. 같은 값이면 나중에 열린 쪽. */
function closeTop(): void {
  let top: Guard | null = null;
  for (const g of guards) {
    if (!top || g.priority >= top.priority) top = g;
  }
  top?.close();
}

/** 열린 오버레이 수에 맞춰 history 가드를 세우거나 되돌린다. */
function sync(): void {
  if (!canUseHistory()) return;
  // 되돌리기(history.back())가 아직 처리되지 않았다면 기다린다.
  // back()은 비동기라, 이 사이에 새 오버레이가 열려 가드를 또 쌓으면 뒤늦게 도착한
  // back이 그 가드를 먹어치우고 다음 닫기가 앱 밖으로 새어 나간다.
  // popstate로 되돌리기가 확인된 직후 sync를 다시 돌려 상태를 맞춘다.
  if (ignorePop) return;
  if (guards.size > 0 && !pushed) {
    pushed = true;
    window.history.pushState({ __overlayGuard: true }, '');
  } else if (guards.size === 0 && pushed) {
    pushed = false;
    ignorePop = true;
    window.history.back();
  }
}

function onPopState(): void {
  if (ignorePop) {
    ignorePop = false;
    sync(); // 되돌리는 사이에 새로 열린 오버레이가 있으면 여기서 가드를 세운다
    return;
  }
  if (!pushed) return; // 우리 항목이 아니다 — 기본 동작(페이지 이동)에 맡긴다.
  pushed = false;
  closeTop();
  // 여기서의 guards는 아직 React 리렌더 전이라 닫은 오버레이가 남아 있을 수 있다.
  // 그래도 sync()를 부르는 이유: 오버레이 '안'에서 단계만 되돌리는 경우(오답노트의
  // 문항→목록→세트)에는 등록이 유지돼 리렌더로 sync가 다시 불리지 않기 때문이다.
  // 실제로 닫힌 경우엔 곧이어 해제 → sync()가 이 가드를 되돌리므로 결과는 같다.
  sync();
}

if (canUseHistory()) {
  window.addEventListener('popstate', onPopState);
}

/**
 * 오버레이가 열려 있는 동안 뒤로가기 대상으로 등록한다.
 * 반환한 해제 함수를 호출하면(=오버레이가 닫히면) 가드도 함께 정리된다.
 */
export function registerBackGuard(guard: Guard): () => void {
  guards.add(guard);
  sync();
  return () => {
    guards.delete(guard);
    sync();
  };
}

/**
 * 안드로이드 하드웨어 뒤로가기 연결. 앱 시작 시 1회 호출한다.
 * 웹에서는 backButton 이벤트가 없어 아무 일도 일어나지 않는다(popstate 경로가 담당).
 */
let hardwareBackBound = false;

export async function initHardwareBackButton(): Promise<void> {
  if (typeof window === 'undefined') return;
  // StrictMode는 개발 빌드에서 마운트 effect를 두 번 돌린다 — 리스너가 둘이면
  // 뒤로가기 한 번에 history.back()이 두 번 나가 오버레이가 두 개 닫힌다.
  if (hardwareBackBound) return;
  hardwareBackBound = true;
  // 네이티브 브리지가 없는 순수 웹에서는 backButton 이벤트 자체가 오지 않는다.
  // 여기서 끊어 Capacitor 런타임 청크(≈9KB)를 아예 내려받지 않게 한다 —
  // 웹의 뒤로가기는 아래 popstate 리스너가 이미 처리한다.
  // (Capacitor 전역은 네이티브가 앱 스크립트보다 먼저 주입한다.)
  const bridge = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (!bridge?.isNativePlatform?.()) return;
  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('backButton', ({ canGoBack }) => {
      // 가드가 있으면 popstate로 이어져 오버레이가 닫힌다.
      if (canGoBack) window.history.back();
      // 없으면 종전과 같이 앱을 종료한다(플러그인 기본값은 '무동작'이라 먹통이 된다).
      else void App.exitApp();
    });
  } catch {
    /* 네이티브 브리지가 없는 환경(웹·테스트) — 무시한다. */
    hardwareBackBound = false; // 실패했으면 다음 시도를 막지 않는다
  }
}

/** 테스트 전용 — 모듈 상태를 초기화한다. */
export function __resetBackGuardForTest(): void {
  guards.clear();
  pushed = false;
  ignorePop = false;
}
