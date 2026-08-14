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
