/**
 * 바텀 시트 손잡이 — 아래로 끌어 닫는다.
 *
 * 공용 Modal의 `sheet` 변형이 쓴다. ✕·Esc·뒤로가기와 같은 닫기이고, 닫는 길이 하나 더 있는 것뿐이다.
 * 끌기 동안 패널은 손가락을 따라 내려가고(DOM을 직접 만진다 — 이동마다 리렌더하지 않는다), 충분히 내렸거나
 * 빠르게 쓸어내렸으면 닫고, 아니면 제자리로 돌아간다.
 *
 * 컴포넌트 밖의 모듈로 둔 이유: 닫기를 **받아들이지 않는 부모**(확인을 거치는 닫기 등) 아래에서도 패널이
 * 끌린 자리에 걸려 남지 않아야 하는데, 그 길은 지금 호출부가 모두 닫기를 받아들여 화면에서 드러나지 않는다.
 * 컴포넌트 안에 있으면 유닛이 닿지 못해 그런 호출부가 처음 생기는 순간 조용히 깨진다
 * (sessionDerive·roundHistory를 꺼낸 것과 같은 이유다 — lightbox.ts와 같은 바닐라 DOM 모듈).
 */

/** 이만큼(px) 넘게 끌어내리면 닫는다. */
export const SWIPE_CLOSE_PX = 96;
/** 짧게 쓸어내려도 이만큼(px)을 넘고 아래 속도보다 빠르면 닫는다(튕기기). */
export const SWIPE_FLICK_MIN_PX = 32;
/** 튕기기로 보는 최소 속도(px/ms). */
export const SWIPE_FLICK_PX_PER_MS = 0.5;

/**
 * 손을 뗀 자리가 닫을 만큼인가. `dy`는 아래로 끌린 거리(위로 끌면 음수 → 0으로 본다), `dtMs`는 걸린 시간.
 * 시스템이 제스처를 가로챈 경우(pointercancel)는 호출부가 이 함수를 부르지 않는다 — 가로챈 것은 닫으려는 뜻이 아니다.
 */
export function swipeShouldClose(dy: number, dtMs: number): boolean {
  const down = Math.max(0, dy);
  if (down > SWIPE_CLOSE_PX) return true;
  return down > SWIPE_FLICK_MIN_PX && down / Math.max(1, dtMs) > SWIPE_FLICK_PX_PER_MS;
}

/**
 * 손잡이에 끌기 동작을 단다. 떼어 낼 함수를 돌려준다.
 *
 * `getPanel`은 호출 시점에 패널을 읽는다 — 닫기를 받아들여 패널이 사라졌으면 null이라 건드릴 것이 없다.
 */
export function attachSheetGrab(
  handle: HTMLElement,
  getPanel: () => HTMLElement | null,
  onClose: () => void,
): () => void {
  let grab: { id: number; y: number; t: number } | null = null;

  const springBack = () => {
    const panel = getPanel();
    if (panel) { panel.style.transition = 'transform 0.18s ease-out'; panel.style.transform = ''; }
  };

  const onDown = (e: PointerEvent) => {
    grab = { id: e.pointerId, y: e.clientY, t: e.timeStamp };
    handle.setPointerCapture?.(e.pointerId);
    const panel = getPanel();
    if (panel) panel.style.transition = 'none';
  };

  const onMove = (e: PointerEvent) => {
    if (!grab || grab.id !== e.pointerId) return;
    const panel = getPanel();
    if (panel) panel.style.transform = `translateY(${Math.max(0, e.clientY - grab.y)}px)`;
  };

  const onUp = (e: PointerEvent) => {
    const g = grab;
    if (!g || g.id !== e.pointerId) return;
    grab = null;
    if (e.type !== 'pointercancel' && swipeShouldClose(e.clientY - g.y, e.timeStamp - g.t)) {
      onClose();
      // 닫기를 받아들이면 부모가 모달을 내려 패널이 사라지고, 다음 프레임에는 getPanel이 null이다. 받아들이지
      // 않으면(확인을 거치는 닫기 등) 패널이 끌린 자리·전환 없음 상태로 남으므로 제자리로 돌려놓는다.
      requestAnimationFrame(springBack);
      return;
    }
    springBack();
  };

  handle.addEventListener('pointerdown', onDown);
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
  return () => {
    handle.removeEventListener('pointerdown', onDown);
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
  };
}
