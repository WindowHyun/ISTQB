// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerBackGuard, BACK_PRIORITY, __resetBackGuardForTest } from './backGuard';

// jsdom의 history는 실제로 동작하지만 back()이 비동기라 테스트에서 다루기 번거롭다.
// 여기서는 "가드를 몇 번 쌓고 되돌렸는지"와 "뒤로가기 시 어떤 오버레이가 닫히는지"를
// 검증하는 게 목적이므로 pushState/back을 감시한다.
function popstate() {
  window.dispatchEvent(new PopStateEvent('popstate'));
}

describe('backGuard', () => {
  let pushSpy: ReturnType<typeof vi.spyOn>;
  let backSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetBackGuardForTest();
    vi.restoreAllMocks();
    pushSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    // back()은 실제 popstate를 만들지 않는다 — 테스트가 직접 popstate()로 흉내낸다.
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
  });

  it('오버레이가 열리면 history 가드를 한 번만 쌓는다', () => {
    const a = registerBackGuard({ priority: BACK_PRIORITY.modal, close: () => {} });
    expect(pushSpy).toHaveBeenCalledTimes(1);
    // 두 번째 오버레이는 같은 가드를 공유한다(뒤로가기 한 번에 하나씩 닫힌다).
    const b = registerBackGuard({ priority: BACK_PRIORITY.confirm, close: () => {} });
    expect(pushSpy).toHaveBeenCalledTimes(1);
    b();
    a();
  });

  it('UI로 전부 닫으면 쌓아둔 가드를 되돌린다', () => {
    const off = registerBackGuard({ priority: BACK_PRIORITY.modal, close: () => {} });
    off();
    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it('뒤로가기는 우선순위가 가장 높은 오버레이를 닫는다', () => {
    const closeModal = vi.fn();
    const closeConfirm = vi.fn();
    registerBackGuard({ priority: BACK_PRIORITY.modal, close: closeModal });
    registerBackGuard({ priority: BACK_PRIORITY.confirm, close: closeConfirm });

    popstate();
    expect(closeConfirm).toHaveBeenCalledTimes(1);
    expect(closeModal).not.toHaveBeenCalled();
  });

  it('드로어 위에 모달이 있으면 모달이 먼저 닫힌다', () => {
    const closeDrawer = vi.fn();
    const closeModal = vi.fn();
    registerBackGuard({ priority: BACK_PRIORITY.drawer, close: closeDrawer });
    registerBackGuard({ priority: BACK_PRIORITY.modal, close: closeModal });

    popstate();
    expect(closeModal).toHaveBeenCalledTimes(1);
    expect(closeDrawer).not.toHaveBeenCalled();
  });

  it('오버레이가 남아 있으면 가드를 다시 세운다 — 다음 뒤로가기도 앱을 벗어나지 않는다', () => {
    // 오답노트처럼 등록은 유지한 채 내부 단계만 되돌리는 경우.
    const close = vi.fn();
    registerBackGuard({ priority: BACK_PRIORITY.modal, close });

    popstate();
    expect(close).toHaveBeenCalledTimes(1);
    expect(pushSpy).toHaveBeenCalledTimes(2); // 최초 1 + 재설정 1

    popstate();
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('가드가 없을 때의 popstate는 건드리지 않는다(앱 종료·페이지 이동은 기본 동작)', () => {
    const close = vi.fn();
    popstate();
    expect(close).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('우리가 부른 back()이 만든 popstate는 오버레이를 닫지 않는다', () => {
    const close = vi.fn();
    const off = registerBackGuard({ priority: BACK_PRIORITY.modal, close });
    off();                    // UI로 닫음 → back() 호출(ignore 플래그 설정)
    close.mockClear();
    popstate();               // back()이 뒤늦게 만든 popstate
    expect(close).not.toHaveBeenCalled();
  });

  it('되돌리기가 끝나기 전에 다시 열려도 가드가 어긋나지 않는다', () => {
    // back()은 비동기다. 닫자마자 다시 여는 흐름(드로어에서 세트 선택 등)에서
    // 가드를 성급히 쌓으면 뒤늦은 back이 그것을 먹어 다음 닫기가 앱 밖으로 샌다.
    const off = registerBackGuard({ priority: BACK_PRIORITY.drawer, close: () => {} });
    off();                                  // back() 예약, 아직 popstate 전
    expect(backSpy).toHaveBeenCalledTimes(1);
    pushSpy.mockClear();

    const close2 = vi.fn();
    registerBackGuard({ priority: BACK_PRIORITY.modal, close: close2 }); // 되돌리기 도중 재오픈
    expect(pushSpy).not.toHaveBeenCalled(); // 아직 쌓지 않는다

    popstate();                             // 예약된 back이 도착 → 여기서 정리 후 재설정
    expect(close2).not.toHaveBeenCalled();  // 이 popstate는 우리 되돌리기다
    expect(pushSpy).toHaveBeenCalledTimes(1);

    // 이제 진짜 뒤로가기는 재오픈한 오버레이를 닫는다.
    popstate();
    expect(close2).toHaveBeenCalledTimes(1);
  });
});

/**
 * 안드로이드 하드웨어 뒤로가기 연결 — 웹에서는 아무 일도 하지 않아야 한다.
 *
 * 이 함수가 웹에서 Capacitor 청크를 받아 오면 번들이 9KB 늘고, StrictMode의 이중 마운트로
 * 리스너가 둘 붙으면 뒤로가기 한 번에 오버레이가 두 개 닫힌다. 둘 다 화면에서는 원인이
 * 안 보이는 종류라 여기서 고정한다(모듈 상태를 쓰므로 매번 새로 import한다).
 */
describe('initHardwareBackButton', () => {
  const freshModule = async () => {
    vi.resetModules();
    return import('./backGuard');
  };

  it('네이티브가 아니면 Capacitor 모듈을 부르지 않는다', async () => {
    const mod = await freshModule();
    const spy = vi.fn();
    vi.doMock('@capacitor/app', () => { spy(); return { App: { addListener: vi.fn() } }; });
    delete (window as { Capacitor?: unknown }).Capacitor;
    await mod.initHardwareBackButton();
    expect(spy).not.toHaveBeenCalled();
  });

  it('브리지가 있으면 backButton을 한 번만 연결한다(이중 마운트 방어)', async () => {
    const addListener = vi.fn().mockResolvedValue({ remove: vi.fn() });
    vi.doMock('@capacitor/app', () => ({ App: { addListener, exitApp: vi.fn() } }));
    const mod = await freshModule();
    (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };

    await mod.initHardwareBackButton();
    await mod.initHardwareBackButton(); // StrictMode의 두 번째 마운트
    expect(addListener).toHaveBeenCalledTimes(1);
    expect(addListener.mock.calls[0][0]).toBe('backButton');

    // 가드가 있으면(canGoBack) history.back()으로 popstate 경로에 넘기고,
    // 없으면 앱을 종료한다 — 플러그인 기본값('무동작')이면 뒤로가기가 먹통이 된다.
    const handler = addListener.mock.calls[0][1] as (e: { canGoBack: boolean }) => void;
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    handler({ canGoBack: true });
    // 호출 '횟수'로 단언하지 않는다 — 앞선 테스트가 남긴 다른 모듈 인스턴스의 popstate
    // 리스너가 같은 window에 붙어 있어 back()이 연쇄로 더 불릴 수 있다. 여기서 재는 것은
    // "가드가 있으면 history 경로로 넘긴다"이지 연쇄 횟수가 아니다.
    expect(back).toHaveBeenCalled();
    back.mockRestore();

    const { App } = await import('@capacitor/app') as unknown as { App: { exitApp: ReturnType<typeof vi.fn> } };
    handler({ canGoBack: false });
    expect(App.exitApp, '가드가 없는데 앱이 종료되지 않으면 뒤로가기가 먹통이 된다').toHaveBeenCalled();
    delete (window as { Capacitor?: unknown }).Capacitor;
  });
});
