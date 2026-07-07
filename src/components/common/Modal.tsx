import { useEffect, useRef, ReactNode } from 'react';
import { lockBodyScroll } from '../../utils/scrollLock';
import { isImageLightboxOpen } from '../../utils/lightbox';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 헤더 닫기 버튼 외에 추가로 노출할 헤더 액션(예: 위험 버튼). */
  headerExtra?: ReactNode;
}

/**
 * 공용 모달: Esc 닫기 + 포커스 트랩(Tab 순환) + 열기 전 포커스 복원 + 백드롭 클릭 닫기.
 * 기존 설정·오답노트 모달과 신규 통계·결과 모달이 동일한 접근성 동작을 공유한다.
 */
export const Modal = ({ title, onClose, children, headerExtra }: ModalProps) => {
  const panelRef = useRef<HTMLElement>(null);
  // onClose는 호출부가 매 렌더 새 인라인 함수를 넘긴다 — effect 의존성으로 두면
  // 결과 모달이 열린 동안(타이머 틱으로 매초 리렌더) 포커스 강탈/스크롤락 재실행이
  // 반복되므로 ref로 최신 참조만 유지하고 effect는 마운트 시 1회만 실행한다.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // 모달이 떠 있는 동안 배경 스크롤을 잠근다(라이트박스와 refcount 공유).
    const unlock = lockBodyScroll();
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first || panel)?.focus();

    const handleKey = (e: KeyboardEvent) => {
      // 라이트박스가 모달 위에 떠 있으면 키 처리는 라이트박스 몫이다 — 둘 다 document
      // 캡처 리스너라 stopPropagation이 서로를 막지 못해, 가드 없이는 Esc 한 번에
      // 라이트박스와 모달이 함께 닫힌다.
      if (isImageLightboxOpen()) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && panel) {
        const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!items.length) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      unlock();
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h3>{title}</h3>
          <div className="modal-header-actions">
            {headerExtra}
            <button type="button" onClick={onClose}>닫기</button>
          </div>
        </header>
        {children}
      </section>
    </div>
  );
};
