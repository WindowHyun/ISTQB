// 문제 그림 클릭 시 앱 내(in-app) 확대 라이트박스. 새 탭으로 이탈하지 않는다.
// parser.tsx(바닐라 DOM)와 QuestionCard(React)에서 공유한다.

let activeOverlay: HTMLElement | null = null;

export function openImageLightbox(src: string): void {
  if (typeof document === 'undefined' || !src) return;
  if (activeOverlay) return; // 중복 오픈 방지

  const overlay = document.createElement('div');
  overlay.className = 'figure-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '이미지 확대 보기');
  overlay.setAttribute('data-testid', 'figure-lightbox');
  overlay.tabIndex = -1;

  const img = document.createElement('img');
  img.className = 'figure-lightbox-img';
  img.src = src;
  img.alt = '확대된 문제 이미지';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'figure-lightbox-close';
  closeBtn.setAttribute('aria-label', '닫기');
  closeBtn.textContent = '✕';

  overlay.appendChild(img);
  overlay.appendChild(closeBtn);

  const prevOverflow = document.body.style.overflow;
  const prevFocused = document.activeElement as HTMLElement | null;

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    document.body.style.overflow = prevOverflow;
    activeOverlay = null;
    prevFocused?.focus?.();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    // 포커스 트랩: 닫기 버튼이 유일한 포커스 대상이므로 Tab은 항상 닫기 버튼에 머문다.
    if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); }
  };

  overlay.addEventListener('click', close); // 배경/이미지 탭하면 닫힘
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
  document.addEventListener('keydown', onKey, true);

  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);
  activeOverlay = overlay;
  closeBtn.focus(); // 공용 Modal과 동일하게 첫 포커스를 모달 내부로 이동
}
