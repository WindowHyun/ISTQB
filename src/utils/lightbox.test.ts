// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openImageLightbox } from './lightbox';
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
