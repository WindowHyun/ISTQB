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
