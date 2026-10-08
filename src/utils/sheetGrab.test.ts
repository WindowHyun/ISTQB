// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SWIPE_CLOSE_PX,
  SWIPE_FLICK_MIN_PX,
  attachSheetGrab,
  swipeShouldClose,
} from './sheetGrab';

/**
 * 바텀 시트 손잡이(아래로 끌어 닫기).
 *
 * 닫을지 말지의 판정(순수)과, 닫기를 **받아들이지 않는 부모** 아래에서도 패널이 끌린 자리에 걸려 남지
 * 않는다는 것(DOM)을 고정한다. 지금의 호출부는 모두 onClose에서 모달을 내려 패널이 사라지므로 후자는
 * 화면에서 드러나지 않는다 — 닫기를 확인으로 돌리는 시트가 처음 생기는 순간 조용히 깨지는 길이다.
 */

describe('swipeShouldClose', () => {
  it('충분히 끌어내리면 느려도 닫는다', () => {
    expect(swipeShouldClose(SWIPE_CLOSE_PX + 1, 5000)).toBe(true);
  });

  it('경계: 기준 거리 그대로는 닫지 않는다(느리게 그 자리에서 뗀 경우)', () => {
    expect(swipeShouldClose(SWIPE_CLOSE_PX, 5000)).toBe(false);
  });

  it('조금만 끌고 느리게 떼면 닫지 않는다', () => {
    expect(swipeShouldClose(30, 600)).toBe(false);
    expect(swipeShouldClose(60, 1000)).toBe(false);
  });

  it('짧아도 빠르게 쓸어내리면 닫는다(튕기기)', () => {
    expect(swipeShouldClose(SWIPE_FLICK_MIN_PX + 8, 40)).toBe(true);
  });

  it('튕기기도 최소 거리는 넘어야 한다 — 빠르게 스친 정도로는 닫지 않는다', () => {
    expect(swipeShouldClose(SWIPE_FLICK_MIN_PX, 10)).toBe(false);
    expect(swipeShouldClose(10, 5)).toBe(false);
  });

  it('위로 끌면 닫지 않는다', () => {
    expect(swipeShouldClose(-200, 50)).toBe(false);
  });

  it('걸린 시간이 0이어도 나눗셈이 터지지 않는다', () => {
    expect(swipeShouldClose(50, 0)).toBe(true);
    expect(swipeShouldClose(0, 0)).toBe(false);
  });
});

describe('attachSheetGrab', () => {
  let handle: HTMLElement;
  let panel: HTMLElement;
  let detach: (() => void) | null;
  let panelRef: HTMLElement | null;

  // 포인터 이벤트 흉내 — jsdom 버전에 따라 PointerEvent가 없으므로 MouseEvent에 필요한 필드를 얹는다.
  const pointer = (type: string, y: number, t: number, id = 1) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: y, button: 0 });
    Object.defineProperty(e, 'pointerId', { value: id });
    Object.defineProperty(e, 'timeStamp', { value: t });
    handle.dispatchEvent(e);
  };
  /** 손잡이를 `dy`px 끌고 놓는다 — 800ms에 걸쳐(느리게) 움직여 튕기기로 닫히는 길을 타지 않는다. */
  const drag = (dy: number, up: 'pointerup' | 'pointercancel' = 'pointerup') => {
    pointer('pointerdown', 100, 1000);
    pointer('pointermove', 100 + dy, 1400);
    pointer(up, 100 + dy, 1800);
  };
  const nextFrame = () => vi.advanceTimersByTime(50);

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    panel = document.createElement('section');
    handle = document.createElement('span');
    panel.appendChild(handle);
    document.body.appendChild(panel);
    panelRef = panel;
    detach = null;
  });
  afterEach(() => {
    detach?.();
    vi.useRealTimers();
  });

  const attach = (onClose: () => void) => {
    detach = attachSheetGrab(handle, () => panelRef, onClose);
  };

  it('끄는 동안 패널이 손가락을 따라 내려가고 전환을 끈다', () => {
    attach(vi.fn());
    pointer('pointerdown', 100, 1000);
    pointer('pointermove', 160, 1100);
    expect(panel.style.transform).toBe('translateY(60px)');
    expect(panel.style.transition).toBe('none');
  });

  it('위로 끌어도 패널은 제자리 위로 올라가지 않는다', () => {
    attach(vi.fn());
    pointer('pointerdown', 100, 1000);
    pointer('pointermove', 40, 1100);
    expect(panel.style.transform).toBe('translateY(0px)');
  });

  it('충분히 끌어내리면 onClose를 한 번 부른다', () => {
    const onClose = vi.fn();
    attach(onClose);
    drag(200);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // 이 파일이 지키려는 것: 부모가 닫기를 거절하면 패널은 끌린 자리에 걸린 채 남는다.
  it('닫기를 받아들이지 않으면(부모가 그대로 둔다) 다음 프레임에 제자리로 돌아온다', () => {
    attach(vi.fn()); // 모달을 내리지 않는 부모
    drag(200);
    expect(panel.style.transform).toBe('translateY(200px)'); // 이 프레임에는 아직 끌린 자리

    nextFrame();
    expect(panel.style.transform, '끌린 자리에 걸린 채 남았다').toBe('');
    expect(panel.style.transition).toContain('transform');
  });

  it('닫기를 받아들여 패널이 사라지면 다음 프레임이 지나도 오류 없이 지나간다', () => {
    attach(() => { panelRef = null; panel.remove(); });
    drag(200);
    expect(() => nextFrame()).not.toThrow();
  });

  it('조금만 끌었다 놓으면 닫지 않고 바로 제자리로 돌아온다', () => {
    const onClose = vi.fn();
    attach(onClose);
    drag(30);
    expect(onClose).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe('');
  });

  it('시스템이 제스처를 가로채면(pointercancel) 멀리 끌렸어도 닫지 않는다', () => {
    const onClose = vi.fn();
    attach(onClose);
    drag(300, 'pointercancel');
    expect(onClose).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe('');
  });

  it('다른 포인터의 이동·떼기는 무시한다', () => {
    const onClose = vi.fn();
    attach(onClose);
    pointer('pointerdown', 100, 1000, 1);
    pointer('pointermove', 400, 1100, 2);
    pointer('pointerup', 400, 1800, 2);
    expect(onClose).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe(''); // 2번 포인터의 이동은 패널을 움직이지 않았다
  });

  it('끌지 않은 채 떼는 이벤트만 오면 아무 일도 없다', () => {
    const onClose = vi.fn();
    attach(onClose);
    pointer('pointerup', 500, 1800);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('떼어 낸 뒤에는 반응하지 않는다(모달이 내려갈 때 리스너가 남지 않는다)', () => {
    const onClose = vi.fn();
    attach(onClose);
    detach?.();
    detach = null;
    drag(300);
    expect(onClose).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe('');
    // 눌렀을 때 전환을 끄는 것까지 — 네 리스너 중 하나만 남아도 패널의 스타일을 건드린다.
    expect(panel.style.transition).toBe('');
  });

  // 끌던 도중에 모달이 내려가는 경우(예: 뒤로가기) — 이동·떼기 리스너가 남아 있으면 사라진 패널을 계속 만진다.
  it('끌던 도중에 떼어 내면 이후의 이동·떼기·가로채기는 무시한다', () => {
    const onClose = vi.fn();
    attach(onClose);
    pointer('pointerdown', 100, 1000);
    detach?.();
    detach = null;
    pointer('pointermove', 300, 1400);
    pointer('pointerup', 300, 1800);
    expect(onClose).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe('');
  });

  it('끌던 도중에 떼어 낸 뒤 pointercancel이 와도 패널을 건드리지 않는다', () => {
    attach(vi.fn());
    pointer('pointerdown', 100, 1000);
    expect(panel.style.transition).toBe('none');
    detach?.();
    detach = null;
    pointer('pointercancel', 100, 1100);
    expect(panel.style.transition, '떼어 낸 뒤에도 취소 리스너가 패널을 되돌렸다').toBe('none');
  });
});
