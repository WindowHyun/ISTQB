// 문제 그림 확대 화면(앱 내 라이트박스). 새 탭으로 이탈하지 않는다.
// parser.tsx(바닐라 DOM)와 QuestionCard(React)에서 공유한다.
//
// 구성(위에서 아래로): 제목·조작 안내·닫기(✕) / 그림 무대 / 배율 안내·'닫고 문제로 돌아가기'.
// 그림은 두 손가락으로 늘리고, 한 손가락으로 끌고, 두 번 눌러 원래 크기로 돌아간다.
// 제스처 계산은 utils/zoomGesture(순수 — 유닛으로 고정)이고, 이 파일은 포인터 이벤트를 읽어
// 그 계산에 넘기고 결과를 DOM에 적는 배선만 맡는다.
import { lockBodyScroll } from './scrollLock';
import { BACK_PRIORITY, registerBackGuard } from './backGuard';
import {
  IDENTITY,
  clampOffset,
  isDoubleTap,
  isTap,
  isZoomed,
  panBy,
  pinch,
  toggleZoom,
  wheelScale,
  zoomAt,
  zoomHint,
  type Point,
  type Size,
  type TapRecord,
  type ViewTransform,
} from './zoomGesture';

/** 문제 그림의 대체 텍스트 — 그림마다의 설명은 데이터 작업(PDF 대조)이라 일반 라벨을 쓴다. */
export const FIGURE_IMAGE_ALT = '문제 그림 (눌러서 확대)';
/** 그림 아래 '눌러서 확대' 칩의 접근 가능한 이름과 보이는 글자. */
export const FIGURE_ZOOM_LABEL = '그림 확대해서 보기';
export const FIGURE_ZOOM_TEXT = '눌러서 확대';

/**
 * 그림 아래에 붙이는 '눌러서 확대' 칩(바닐라 DOM — parser.tsx용). React 쪽(QuestionCard)은 같은 클래스·
 * 문구 상수를 쓴다.
 *
 * 그림 자체를 누르면 확대되는 것은 그대로지만, 그것만으로는 그림이 눌린다는 것이 어디에도 드러나지
 * 않는다 — 칩이 "눌러서 확대"를 말로 알리고, 키보드·보조기기가 닿는 유일한 진입로가 된다.
 */
export function createFigureZoomChip(onOpen: () => void): HTMLButtonElement {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'figure-zoom-chip';
  chip.setAttribute('aria-label', FIGURE_ZOOM_LABEL);
  chip.textContent = FIGURE_ZOOM_TEXT;
  chip.addEventListener('click', (e) => { e.stopPropagation(); onOpen(); });
  return chip;
}

let activeOverlay: HTMLElement | null = null;

// 공용 Modal이 키 이벤트 양보 판단에 쓴다(모달 위에 라이트박스가 겹칠 수 있음).
export function isImageLightboxOpen(): boolean {
  return activeOverlay !== null;
}

/** 이 거리(px)를 넘게 움직이면 탭이 아니라 끌기다. zoomGesture.isTap의 기본값과 같다. */
const DRAG_THRESHOLD = 10;
/** 끌기·핀치가 끝난 직후의 click은 배경 탭이 아니다(손가락이 배경 위에서 떨어져도 닫히지 않게). */
const CLICK_SUPPRESS_MS = 350;
/** 키보드 이동·확대 단위. */
const KEY_PAN_PX = 40;
const KEY_ZOOM_STEP = 1.25;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function openImageLightbox(src: string): void {
  if (typeof document === 'undefined' || !src) return;
  if (activeOverlay) return; // 중복 오픈 방지

  const overlay = el('div', 'figure-lightbox');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '이미지 확대 보기');
  overlay.setAttribute('data-testid', 'figure-lightbox');
  overlay.tabIndex = -1;

  // ── 머리: 제목·조작 안내·닫기 ───────────────────────────────────────────
  const head = el('header', 'fl-head');
  const titles = el('div', 'fl-titles');
  titles.appendChild(el('div', 'fl-title', '그림 확대'));
  // 입력 수단에 맞는 안내만 보인다(CSS가 (hover) 미디어로 가른다) — 마우스 사용자에게 '두 손가락'은 낯선 말이다.
  const hint = el('div', 'fl-hint');
  hint.appendChild(el('span', 'fl-hint-touch', '두 손가락으로 확대 · 한 손가락으로 이동'));
  hint.appendChild(el('span', 'fl-hint-mouse', '휠로 확대 · 끌어서 이동 · 두 번 눌러 확대'));
  titles.appendChild(hint);

  const closeBtn = el('button', 'figure-lightbox-close');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', '닫기');
  closeBtn.textContent = '✕';
  head.appendChild(titles);
  head.appendChild(closeBtn);

  // ── 무대: 그림 + 제스처 ─────────────────────────────────────────────────
  const stage = el('div', 'fl-stage');
  const img = el('img', 'figure-lightbox-img');
  img.src = src;
  img.alt = '확대된 문제 이미지';
  img.draggable = false;
  stage.appendChild(img);

  // ── 바닥: 배율 안내 · 닫고 돌아가기 ─────────────────────────────────────
  const foot = el('footer', 'fl-foot');
  const scaleLabel = el('div', 'fl-scale', zoomHint(IDENTITY.scale));
  // 닫기 버튼이 둘이지만 탭 정지점은 ✕ 하나다 — 아래 키 처리가 Tab을 늘 ✕에 머물게 한다(포커스 트랩).
  // 이 버튼은 터치·마우스·보조기기의 가상 커서용 진입로다.
  const closeBottom = el('button', 'fl-close-bottom', '닫고 문제로 돌아가기');
  closeBottom.type = 'button';
  closeBottom.tabIndex = -1;
  foot.appendChild(scaleLabel);
  foot.appendChild(closeBottom);

  overlay.appendChild(head);
  overlay.appendChild(stage);
  overlay.appendChild(foot);

  const unlock = lockBodyScroll();
  const prevFocused = document.activeElement as HTMLElement | null;

  // ── 변환 ───────────────────────────────────────────────────────────────
  let view: ViewTransform = IDENTITY;
  const stageSize = (): Size => ({ w: stage.clientWidth, h: stage.clientHeight });
  // 레이아웃 크기(offset*)는 transform의 영향을 받지 않는다 — 배율 1에서 맞춰 앉은 크기다.
  const contentSize = (): Size => ({ w: img.offsetWidth, h: img.offsetHeight });
  const rel = (e: { clientX: number; clientY: number }): Point => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const apply = (next: ViewTransform, animate = false) => {
    view = next;
    img.style.transition = animate ? 'transform 0.18s ease-out' : 'none';
    img.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    scaleLabel.textContent = zoomHint(next.scale);
    stage.dataset.zoomed = isZoomed(next.scale) ? 'true' : 'false';
  };
  apply(IDENTITY);

  // ── 포인터: 끌기 · 핀치 · 두 번 누르기 ──────────────────────────────────
  const pointers = new Map<number, Point>();
  type Gesture =
    | { kind: 'pan'; start: Point; from: ViewTransform }
    | { kind: 'pinch'; start: [Point, Point]; from: ViewTransform };
  let gesture: Gesture | null = null;
  let down: TapRecord | null = null; // 첫 손가락이 닿은 순간 — 탭 판정용
  let moved = false; // 탭 한계를 넘어 움직였거나 핀치였다
  let lastTap: TapRecord | null = null;
  let suppressClickUntil = 0;
  const now = () => performance.now();

  const pair = (): [Point, Point] => {
    const [a, b] = [...pointers.values()];
    return [a, b];
  };

  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, rel(e));
    if (!gesture) return;
    if (gesture.kind === 'pinch' && pointers.size >= 2) {
      apply(pinch(gesture.from, gesture.start, pair(), stageSize(), contentSize()));
      return;
    }
    if (gesture.kind === 'pan') {
      const p = pointers.get(e.pointerId) as Point;
      const dx = p.x - gesture.start.x;
      const dy = p.y - gesture.start.y;
      if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) moved = true;
      if (moved) apply(panBy(gesture.from, dx, dy, stageSize(), contentSize()));
    }
  };

  const stopTracking = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };

  function onUp(e: PointerEvent) {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size === 1) {
      // 핀치를 끝내고 손가락 하나가 남았다 — 거기서 이동을 이어 간다(기준을 다시 잡아 그림이 튀지 않게).
      const [rest] = [...pointers.values()];
      gesture = { kind: 'pan', start: rest, from: view };
      return;
    }
    if (pointers.size > 0) return;
    // 마지막 손가락이 떨어졌다.
    stopTracking();
    const p = rel(e);
    const up: TapRecord = { t: e.timeStamp, x: p.x, y: p.y };
    if (e.type === 'pointercancel') moved = true; // 시스템이 가져간 제스처는 탭이 아니다
    if (moved) {
      suppressClickUntil = now() + CLICK_SUPPRESS_MS;
      lastTap = null;
    } else if (down && isTap(down, up)) {
      if (isDoubleTap(lastTap, up)) {
        apply(toggleZoom(view, p, stageSize(), contentSize()), true);
        lastTap = null;
      } else {
        lastTap = up;
      }
    }
    gesture = null;
    down = null;
  }

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = rel(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      down = { t: e.timeStamp, x: p.x, y: p.y };
      moved = false;
      gesture = { kind: 'pan', start: p, from: view };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    } else if (pointers.size === 2) {
      gesture = { kind: 'pinch', start: pair(), from: view };
      moved = true;
    }
  };
  stage.addEventListener('pointerdown', onDown);

  // 휠·트랙패드 핀치(ctrl+휠) — 포인터 아래 지점을 고정한 채 확대한다.
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // 줄 단위(Firefox)를 픽셀로
    apply(zoomAt(view, rel(e), wheelScale(view.scale, dy), stageSize(), contentSize()));
  }, { passive: false });

  // 창 크기·방향이 바뀌면 이동 한계가 달라진다 — 그림이 무대 밖에 남지 않게 다시 자른다.
  const onResize = () => apply(clampOffset(view, stageSize(), contentSize()));
  window.addEventListener('resize', onResize);

  let closed = false;
  const close = () => {
    // 닫는 경로가 다섯이다(✕ · 아래 버튼 · 배경 탭 · Esc · 뒤로가기) — 겹쳐도 한 번만 정리한다.
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    stopTracking();
    unregisterBack();
    overlay.remove();
    unlock();
    activeOverlay = null;
    prevFocused?.focus?.();
  };

  // 하드웨어/브라우저 뒤로가기로도 닫는다. 모달 위에 겹칠 수 있으므로 우선순위가 가장 높다 —
  // 등록하지 않으면 뒤로가기가 이 오버레이를 지나쳐 아래 모달을 닫거나 앱을 벗어난다.
  const unregisterBack = registerBackGuard({ priority: BACK_PRIORITY.lightbox, close: () => close() });

  const zoomBy = (factor: number) => {
    const s = stageSize();
    apply(zoomAt(view, { x: s.w / 2, y: s.h / 2 }, view.scale * factor, s, contentSize()), true);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    // 포커스 트랩: 탭 정지점은 ✕ 하나이므로 Tab은 항상 거기에 머문다.
    if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); return; }
    // 마우스 없이도 확대·이동할 수 있어야 한다(제스처의 키보드 대안 — WCAG 2.5.1).
    // 화살표는 확대 여부와 무관하게 여기서 삼킨다 — 놓아 두면 뒤의 문항 이동이 라이트박스 밑에서 돌아간다.
    switch (e.key) {
      case '+': case '=': e.stopPropagation(); zoomBy(KEY_ZOOM_STEP); return;
      case '-': case '_': e.stopPropagation(); zoomBy(1 / KEY_ZOOM_STEP); return;
      case '0': e.stopPropagation(); apply(IDENTITY, true); return;
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
        e.stopPropagation();
        if (!isZoomed(view.scale)) return;
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? KEY_PAN_PX : e.key === 'ArrowRight' ? -KEY_PAN_PX : 0;
        const dy = e.key === 'ArrowUp' ? KEY_PAN_PX : e.key === 'ArrowDown' ? -KEY_PAN_PX : 0;
        apply(panBy(view, dx, dy, stageSize(), contentSize()), true);
        return;
      }
    }
  };

  // 배경을 누르면 닫힌다. 그림을 누르는 것은 닫기가 아니다(두 번 누르기·끌기가 그림 위에서 일어난다).
  // 끌기·핀치가 끝나며 생긴 click도 무시한다 — 손가락이 배경 위에서 떨어졌다고 닫히면 안 된다.
  overlay.addEventListener('click', (e) => {
    if (now() < suppressClickUntil) return;
    const target = e.target as Element | null;
    if (target?.closest('button, .figure-lightbox-img')) return;
    close();
  });
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
  closeBottom.addEventListener('click', (e) => { e.stopPropagation(); close(); });
  document.addEventListener('keydown', onKey, true);

  document.body.appendChild(overlay);
  activeOverlay = overlay;
  closeBtn.focus(); // 공용 Modal과 동일하게 첫 포커스를 모달 내부로 이동
}
