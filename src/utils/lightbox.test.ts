// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openImageLightbox } from './lightbox';

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
});
