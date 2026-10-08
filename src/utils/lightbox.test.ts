// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  openImageLightbox, createFigureZoomChip, FIGURE_IMAGE_ALT, FIGURE_ZOOM_LABEL, FIGURE_ZOOM_TEXT,
} from './lightbox';
import { registerBackGuard, BACK_PRIORITY, __resetBackGuardForTest } from './backGuard';

describe('openImageLightbox', () => {
  beforeEach(() => { document.body.innerHTML = ''; document.body.style.overflow = ''; });
  // Esc로 정상 종료시켜 모듈 내부 상태(activeOverlay)까지 초기화 → 테스트 격리.
  afterEach(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });

  it('호출하면 앱 내 라이트박스 오버레이를 만든다(새 탭 아님)', () => {
    openImageLightbox('/images/questions/foo.png');
    const overlay = document.querySelector<HTMLElement>('.figure-lightbox');
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('role')).toBe('dialog');
    expect(overlay?.querySelector('img')?.getAttribute('src')).toBe('/images/questions/foo.png');
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('중복 호출해도 오버레이는 하나만 존재한다', () => {
    openImageLightbox('/a.png');
    openImageLightbox('/b.png');
    expect(document.querySelectorAll('.figure-lightbox').length).toBe(1);
  });

  it('Esc 키로 닫히고 body 스크롤이 복원된다', () => {
    openImageLightbox('/a.png');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.figure-lightbox')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('배경 클릭으로 닫힌다', () => {
    openImageLightbox('/a.png');
    document.querySelector<HTMLElement>('.figure-lightbox')?.click();
    expect(document.querySelector('.figure-lightbox')).toBeNull();
  });

  // 빈 경로로 열면 아무 일도 없어야 한다 — figure가 비어 있는 문항에서 빈 오버레이가
  // 뜨면 배경이 잠긴 채 이미지 없는 검은 화면만 남는다(닫기 버튼은 있지만 원인 불명).
  it('src가 비어 있으면 열지 않는다', () => {
    openImageLightbox('');
    expect(document.querySelector('.figure-lightbox')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  // 포커스 트랩: 닫기 버튼이 유일한 포커스 대상이라 Tab은 늘 그 자리에 머문다.
  // 트랩이 풀리면 배경의 문항 보기로 포커스가 새어 나가 키보드 사용자가 길을 잃는다.
  it('Tab을 눌러도 포커스가 닫기 버튼을 벗어나지 않는다', () => {
    openImageLightbox('/b.png');
    const closeBtn = document.querySelector<HTMLElement>('.figure-lightbox button');
    (document.body as HTMLElement).focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(closeBtn);
  });

  // 닫기 버튼 클릭은 배경 클릭과 같은 경로로 가면 안 된다(이벤트가 겹쳐 두 번 닫힌다).
  it('닫기 버튼으로 닫힌다', () => {
    openImageLightbox('/c.png');
    document.querySelector<HTMLElement>('.figure-lightbox button')?.click();
    expect(document.querySelector('.figure-lightbox')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});

/**
 * 뒤로가기로 닫기 — 라이트박스는 **모달 위에도 뜨는 유일한 오버레이**다.
 *
 * 종전에는 backGuard에 등록돼 있지 않았다. 그래서 그림을 확대한 상태에서 하드웨어
 * 뒤로가기를 누르면 라이트박스는 그대로 남고 **그 아래 모달이 닫히거나**, 오버레이가
 * 라이트박스뿐이면 가드가 아예 없어 **앱을 벗어났다**. Esc·배경 탭·✕는 멀쩡히
 * 동작했으므로 웹 조작으로는 드러나지 않고 APK에서만 나타나는 결함이었다.
 */
describe('openImageLightbox — 뒤로가기 가드', () => {
  const popstate = () => window.dispatchEvent(new PopStateEvent('popstate'));
  let pushSpy: ReturnType<typeof vi.spyOn>;
  let backSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
    __resetBackGuardForTest();
    vi.restoreAllMocks();
    pushSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    // jsdom의 back()은 실제 popstate를 만들지 않는다 — 테스트가 직접 흉내낸다.
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
  });
  afterEach(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });

  it('열면 history 가드를 쌓는다', () => {
    openImageLightbox('/a.png');
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });

  it('뒤로가기로 닫히고 body 스크롤이 복원된다', () => {
    openImageLightbox('/a.png');
    popstate();
    expect(document.querySelector('.figure-lightbox')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('UI로 닫으면 쌓아둔 가드도 함께 되돌린다(뒤로가기가 새지 않는다)', () => {
    openImageLightbox('/a.png');
    document.querySelector<HTMLElement>('.figure-lightbox button')?.click();
    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it('모달 위에 겹치면 아래 모달이 아니라 라이트박스가 먼저 닫힌다', () => {
    const closeModal = vi.fn();
    const offModal = registerBackGuard({ priority: BACK_PRIORITY.modal, close: closeModal });
    openImageLightbox('/a.png');

    popstate();
    expect(document.querySelector('.figure-lightbox')).toBeNull();
    expect(closeModal, '라이트박스를 지나쳐 아래 모달이 닫혔다').not.toHaveBeenCalled();

    // 라이트박스만 사라졌을 뿐 모달의 가드는 남아 있다 — 다음 뒤로가기가 모달을 닫는다.
    popstate();
    expect(closeModal).toHaveBeenCalledTimes(1);
    offModal();
  });

  // 뒤로가기로 닫을 때는 되돌리기를 하면 안 된다 — 그 뒤로가기가 이미 가드를 소비했다.
  // 여기서 back()이 한 번 더 나가면 히스토리를 두 칸 물러나 페이지를 벗어난다.
  it('뒤로가기로 닫을 때는 되돌리기를 덧붙이지 않는다', () => {
    openImageLightbox('/a.png');
    popstate();
    expect(backSpy).not.toHaveBeenCalled();
  });

  // 닫힌 뒤 상태가 남으면(가드 해제 누락) 다음 확대는 가드 없이 열려 뒤로가기가 샌다.
  it('닫았다 다시 열면 가드를 새로 쌓는다', () => {
    openImageLightbox('/a.png');
    popstate();
    openImageLightbox('/b.png');
    expect(document.querySelector('.figure-lightbox')).not.toBeNull();
    expect(pushSpy).toHaveBeenCalledTimes(2);
  });
});


/**
 * 확대 화면의 구성과 제스처 배선.
 *
 * 계산은 zoomGesture.test.ts가 고정한다 — 여기서는 포인터·휠·키 입력이 그 계산에 닿고, 결과가
 * 배율 안내에 반영되며, **닫기와 제스처가 서로를 오작동시키지 않는다**는 것을 본다. jsdom에는 레이아웃이
 * 없어 크기를 직접 정한다(무대 390×700, 그림 358×200).
 */
describe('openImageLightbox — 구성과 제스처', () => {
  const q = <T extends Element>(sel: string) => document.querySelector(sel) as T;
  const label = () => q<HTMLElement>('.fl-scale').textContent;
  const open = () => document.querySelector('.figure-lightbox') !== null;

  // 포인터 이벤트 흉내 — jsdom 버전에 따라 PointerEvent가 없으므로 MouseEvent에 필요한 필드를 얹는다.
  const pointer = (target: EventTarget, type: string, x: number, y: number, t: number, id = 1) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(e, 'pointerId', { value: id });
    Object.defineProperty(e, 'pointerType', { value: 'touch' });
    Object.defineProperty(e, 'timeStamp', { value: t });
    target.dispatchEvent(e);
  };
  const tap = (x: number, y: number, t: number) => {
    pointer(q('.fl-stage'), 'pointerdown', x, y, t);
    pointer(window, 'pointerup', x, y, t + 40);
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
    __resetBackGuardForTest();
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return this.classList.contains('fl-stage') ? 390 : 0; } });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return this.classList.contains('fl-stage') ? 700 : 0; } });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return this.classList.contains('figure-lightbox-img') ? 358 : 0; } });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return this.classList.contains('figure-lightbox-img') ? 200 : 0; } });
  });
  afterEach(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    for (const prop of ['clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight']) {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop];
    }
  });

  it('제목·조작 안내·배율 안내·닫고 돌아가기가 있다', () => {
    openImageLightbox('/a.png');
    expect(q('.fl-title').textContent).toBe('그림 확대');
    expect(q('.fl-hint-touch').textContent).toBe('두 손가락으로 확대 · 한 손가락으로 이동');
    expect(label()).toBe('확대 100% · 두 번 누르면 확대');
    expect(q('.fl-close-bottom').textContent).toBe('닫고 문제로 돌아가기');
  });

  it('✕가 첫 버튼이고 포커스를 받는다(탭 정지점은 ✕ 하나)', () => {
    openImageLightbox('/a.png');
    const buttons = document.querySelectorAll<HTMLElement>('.figure-lightbox button');
    expect(buttons[0].classList.contains('figure-lightbox-close')).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    expect(q<HTMLElement>('.fl-close-bottom').tabIndex).toBe(-1);
  });

  it('아래 "닫고 문제로 돌아가기" 버튼으로 닫힌다', () => {
    openImageLightbox('/a.png');
    q<HTMLElement>('.fl-close-bottom').click();
    expect(open()).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('그림을 누르는 것은 닫기가 아니다(두 번 누르기·끌기가 그림 위에서 일어난다)', () => {
    openImageLightbox('/a.png');
    q<HTMLElement>('.figure-lightbox-img').click();
    expect(open()).toBe(true);
  });

  it('두 번 누르면 확대하고, 다시 두 번 누르면 원래 크기로 돌아간다', () => {
    openImageLightbox('/a.png');
    tap(195, 350, 1000);
    tap(195, 350, 1150);
    expect(label()).toBe('확대 250% · 두 번 누르면 원래 크기로');
    tap(195, 350, 2000);
    tap(195, 350, 2150);
    expect(label()).toBe('확대 100% · 두 번 누르면 확대');
  });

  it('느리게 두 번 누르면 두 번 누르기가 아니다(확대하지 않는다)', () => {
    openImageLightbox('/a.png');
    tap(195, 350, 1000);
    tap(195, 350, 1900);
    expect(label()).toBe('확대 100% · 두 번 누르면 확대');
  });

  it('끌고 손가락을 배경 위에서 떼도 닫히지 않는다(끝난 직후의 click은 배경 탭이 아니다)', () => {
    openImageLightbox('/a.png');
    pointer(q('.fl-stage'), 'pointerdown', 100, 100, 1000);
    pointer(window, 'pointermove', 220, 140, 1050);
    pointer(window, 'pointerup', 220, 140, 1100);
    // 브라우저는 끌기가 끝난 자리에 click을 이어 보낸다 — 공통 조상(여기선 오버레이)이 대상이 된다.
    q<HTMLElement>('.figure-lightbox').click();
    expect(open(), '끌기가 끝나며 닫혔다').toBe(true);
  });

  it('두 손가락으로 벌리면 확대되고 배율 안내가 따라간다', () => {
    openImageLightbox('/a.png');
    const stage = q('.fl-stage');
    pointer(stage, 'pointerdown', 145, 350, 1000, 1);
    pointer(stage, 'pointerdown', 245, 350, 1005, 2);
    pointer(window, 'pointermove', 95, 350, 1050, 1);
    pointer(window, 'pointermove', 295, 350, 1055, 2);
    expect(label()).toBe('확대 200% · 두 번 누르면 원래 크기로');
    pointer(window, 'pointerup', 95, 350, 1100, 1);
    pointer(window, 'pointerup', 295, 350, 1105, 2);
    // 핀치가 끝난 직후의 click도 닫지 않는다.
    q<HTMLElement>('.figure-lightbox').click();
    expect(open()).toBe(true);
  });

  it('휠로 확대하고 기본 동작(페이지 스크롤)을 막는다', () => {
    openImageLightbox('/a.png');
    const e = new WheelEvent('wheel', { deltaY: -200, clientX: 195, clientY: 350, bubbles: true, cancelable: true });
    q('.fl-stage').dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(label()).toBe('확대 149% · 두 번 누르면 원래 크기로');
  });

  it('키보드: + 확대 · - 축소 · 0 원래 크기', () => {
    openImageLightbox('/a.png');
    const press = (key: string) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    press('+');
    expect(label()).toBe('확대 125% · 두 번 누르면 원래 크기로');
    press('=');
    expect(label()).toBe('확대 156% · 두 번 누르면 원래 크기로');
    press('-');
    expect(label()).toBe('확대 125% · 두 번 누르면 원래 크기로');
    press('0');
    expect(label()).toBe('확대 100% · 두 번 누르면 확대');
  });

  // 화살표를 놓아 두면 뒤 화면의 문항 이동(document keydown)이 라이트박스 밑에서 돌아간다.
  it('화살표 키를 삼킨다(뒤의 문항 이동이 돌지 않는다)', () => {
    openImageLightbox('/a.png');
    const leaked = vi.fn();
    document.addEventListener('keydown', leaked);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    document.removeEventListener('keydown', leaked);
    expect(leaked).not.toHaveBeenCalled();
  });
});

describe('그림 확대 진입 — 칩과 대체 텍스트', () => {
  it('문구 상수', () => {
    expect(FIGURE_IMAGE_ALT).toBe('문제 그림 (눌러서 확대)');
    expect(FIGURE_ZOOM_LABEL).toBe('그림 확대해서 보기');
    expect(FIGURE_ZOOM_TEXT).toBe('눌러서 확대');
  });

  it('칩은 이름을 가진 버튼이고, 누르면 열기 콜백을 부르되 상위로 번지지 않는다', () => {
    const onOpen = vi.fn();
    const parentClick = vi.fn();
    const parent = document.createElement('div');
    parent.addEventListener('click', parentClick);
    const chip = createFigureZoomChip(onOpen);
    parent.appendChild(chip);

    expect(chip.tagName).toBe('BUTTON');
    expect(chip.type).toBe('button');
    expect(chip.getAttribute('aria-label')).toBe('그림 확대해서 보기');
    expect(chip.textContent).toBe('눌러서 확대');
    chip.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    // 그림 틀(frame)에도 확대 클릭이 걸려 있으면 한 번의 탭에 두 번 열린다.
    expect(parentClick).not.toHaveBeenCalled();
  });
});
