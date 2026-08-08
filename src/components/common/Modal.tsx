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
        // 모달이 겹쳐 있으면 **맨 위 하나만** 닫는다.
        //
        // 종전에는 stopPropagation으로 막는다고 봤지만 그것은 같은 노드의 다른 리스너를
        // 막지 못한다(그건 stopImmediatePropagation이다). 모든 모달이 document에 캡처
        // 리스너를 달기 때문에, 설정 → '기록 가져오기' 확인처럼 겹친 상태에서 Esc를 한 번
        // 누르면 두 핸들러가 모두 돌아 설정까지 함께 닫혔다.
        //
        // stopImmediatePropagation으로 바꿔도 안 된다 — 같은 노드의 리스너는 '등록 순서'로
        // 도는데 그건 먼저 열린(=아래에 깔린) 모달이다. 순서가 정반대다.
        //
        // 그래서 이벤트 시점의 DOM 순서로 최상위를 정한다. 모달들은 형제로 렌더되고
        // z-index를 따로 주지 않으므로 문서 순서가 곧 페인트 순서다 —
        // 화면에서 맨 위인 것과 여기서 고르는 것이 항상 같다.
        // (하드웨어 뒤로가기는 backGuard의 BACK_PRIORITY가 같은 일을 한다. 두 경로가
        //  같은 동작을 해야 하는데 Esc에만 이 기구가 없었다.)
        const panels = document.querySelectorAll('.modal-panel');
        if (panels.length && panels[panels.length - 1] !== panel) return;
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

  // 내용이 넘쳐 스크롤되는 본문은 키보드로도 스크롤할 수 있어야 한다(WCAG 2.1.1).
  // 마우스 휠·터치로는 되지만 포커스를 받지 못하면 키보드 사용자는 사용설명서의
  // 아랫부분에 영영 도달할 수 없다 — 모달 안에는 링크가 없어 Tab으로도 못 내려간다.
  // 넘치지 않는 본문까지 탭 순서에 넣으면 방해만 되므로 실제로 넘칠 때만 붙인다.
  useEffect(() => {
    const body = panelRef.current?.querySelector<HTMLElement>('.modal-body');
    if (!body) return;
    const sync = () => {
      if (body.scrollHeight > body.clientHeight + 1) {
        body.tabIndex = 0;
        body.setAttribute('role', 'group');
      } else {
        body.removeAttribute('tabindex');
        body.removeAttribute('role');
      }
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    // 오답노트처럼 같은 모달 안에서 내용이 바뀌면 넘침 여부도 바뀐다.
    const ro = new ResizeObserver(sync);
    ro.observe(body);
    return () => ro.disconnect();
  });

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
