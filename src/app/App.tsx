import React, { useEffect, useState, Suspense } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuizStore } from '../store/useQuizStore';
import { restorePersistentSnapshot, flushPersist } from '../utils/storage';
import { safeSetItem } from '../utils/safeStorage';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { UserGuide } from '../components/common/UserGuide';
import { FEEDBACK_SHEET_URL } from '../utils/links';
import { MobileTopBar } from '../components/layout/MobileTopBar';
import { AppModals } from '../components/modals/AppModals';
import { MODE_LABEL } from '../utils/modeLabel';
import { useBackDismiss } from '../hooks/useBackDismiss';
import { BACK_PRIORITY, initHardwareBackButton } from '../utils/backGuard';

const Sidebar = React.lazy(() => import('../components/layout/Sidebar').then(module => ({ default: module.Sidebar })));
const QuestionWorkspace = React.lazy(() => import('../components/quiz/QuestionWorkspace').then(module => ({ default: module.QuestionWorkspace })));

// 모드 전환 라이브 알림(B4) — 모드 버튼의 aria-pressed로는 전달되지 않는 프로그램적
// 전환(챕터 집중 연습 진입 등)도 스크린리더가 인지하게 한다. 시각적으로는 숨김.
const ModeAnnouncer = () => {
  const mode = useQuizStore((s) => s.mode);
  const label = MODE_LABEL[mode];
  return <span className="sr-only" role="status">{label ? `${label} 모드` : ''}</span>;
};

export const App = () => {
  // 슬라이스 구독(O1) — 앱 셸이 타이머 틱·답안 변경에 리렌더되지 않는다.
  const { mode, activeProduct, drawerOpen, setMode, setActiveProduct, setDrawerOpen, resetToGate } =
    useQuizStore(useShallow((s) => ({
      mode: s.mode, activeProduct: s.activeProduct, drawerOpen: s.drawerOpen,
      setMode: s.setMode, setActiveProduct: s.setActiveProduct,
      setDrawerOpen: s.setDrawerOpen, resetToGate: s.resetToGate,
    })));
  const [isRestored, setIsRestored] = useState(false);
  // 사용설명서 — 게이트 화면은 앱 셸(AppModals) 밖이라 로컬 상태로 연다.
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    // 진입 시 항상 제품 선택 화면(게이트)을 먼저 보여준다(#5).
    // 저장된 답안/진행 상태는 제품을 선택하는 순간 복원한다(handleProductSelect).
    setIsRestored(true);
    // 안드로이드 하드웨어 뒤로가기 연결(웹에서는 no-op).
    void initHardwareBackButton();
  }, []);

  // 뒤로가기로 닫히는 오버레이 — 드로어는 그 위에 열린 모달이 먼저 닫히도록 최하위.
  useBackDismiss(drawerOpen, () => setDrawerOpen(false), BACK_PRIORITY.drawer);
  useBackDismiss(guideOpen, () => setGuideOpen(false), BACK_PRIORITY.confirm);

  // 페이지가 닫혔다 다시 열릴 때(bfcache 복원 포함) 이전 화면이 남아도 항상 최초 화면으로 되돌린다.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) resetToGate();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [resetToGate]);

  // 모바일 드로어: Esc로 닫기.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen, setDrawerOpen]);

  // 드로어를 연 채 뷰포트가 데스크톱 폭(>880px)이 되면 닫는다 — 상시 사이드바로 전환된
  // 뒤에도 dialog/포커스 트랩·백드롭이 남는 잔존 상태를 방지(CSS 브레이크포인트와 동일 기준).
  useEffect(() => {
    if (!drawerOpen) return;
    const mq = window.matchMedia('(min-width: 881px)');
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setDrawerOpen(false); };
    if (mq.matches) { setDrawerOpen(false); return; }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [drawerOpen, setDrawerOpen]);

  // 복원이 끝날 때까지 게이트가 그대로 보인다(mode는 아래 await 뒤에야 바뀐다).
  // 그래서 "반응이 없네" 하고 다른 제품을 누르면 복원이 겹친다 — 저장 계층에서 키 오염은
  // 막았지만(storage.gaterace.test.ts), 겹치면 늦게 끝난 쪽이 최종 제품이 되어
  // **누른 것과 다른 자격증으로 들어간다.** 진행 중임을 보여 주고 재진입을 막는다.
  const [selecting, setSelecting] = useState<'istqb' | 'csts' | null>(null);

  const handleProductSelect = async (product: 'istqb' | 'csts') => {
    if (selecting) return; // 재진입 차단 — 첫 클릭이 이긴다.
    setSelecting(product);
    // finally로 푸는 이유: 성공하면 mode가 바뀌어 게이트가 사라지므로 해제가 무의미하지만,
    // 앞단(flushPersist 등)이 던지면 게이트가 영구히 잠긴 채 남는다.
    try {
      // 제품을 바꾸기 전에 이전 제품의 대기 중 저장을 지금 flush한다(#P1-1 방어).
      // 디바운스 저장은 실행 시점의 activeProduct로 키를 정하므로, 남은 저장이 새 제품 키에
      // 잘못 기록되는 경합 창을 없앤다. 최초 진입(activeProduct=null) 시에는 내부에서 no-op.
      flushPersist();
      safeSetItem("istqb-fl-v4-sample-last-product", product);
      setActiveProduct(product);
      await restorePersistentSnapshot(product);
      // 저장된 모드(시험 등)를 그대로 이어간다. 게이트 모드('home')/무효면 연습으로 폴백(#1).
      const restoredMode = useQuizStore.getState().mode;
      setMode(restoredMode && restoredMode !== 'home' ? restoredMode : 'practice');
    } finally {
      setSelecting(null);
    }
  };

  if (!isRestored) {
    return <div className="loading">앱 로딩 중...</div>;
  }

  if (mode === 'home' || !activeProduct) {
    return (
      <section className="product-gate" aria-labelledby="productGateTitle">
        <div className="product-gate-inner">
          <p className="product-eyebrow">Practice App</p>
          <h1 id="productGateTitle">학습할 자격증을 선택하세요</h1>
          <div className="product-actions">
            {/* 복원 중에는 둘 다 잠근다 — 아무 반응이 없으면 사용자는 다시 누르고,
                그 연타가 복원 겹침을 만든다(핸들러 가드와 이중 방어). */}
            <button
              className="product-button primary"
              disabled={selecting !== null}
              aria-busy={selecting === 'istqb'}
              data-testid="gate-istqb"
              onClick={() => handleProductSelect('istqb')}
            >
              {selecting === 'istqb' ? '불러오는 중…' : 'ISTQB'}
            </button>
            <button
              className="product-button"
              disabled={selecting !== null}
              aria-busy={selecting === 'csts'}
              data-testid="gate-csts"
              onClick={() => handleProductSelect('csts')}
            >
              {selecting === 'csts' ? '불러오는 중…' : 'CSTS'}
            </button>
          </div>
          {/* 첫 방문자용 사용설명서·제보 채널 — 제품 선택 전에도 접근할 수 있게 게이트 하단에 둔다. */}
          <div className="gate-links">
            <button
              type="button"
              className="gate-guide-btn"
              aria-haspopup="dialog"
              data-testid="guide-open"
              onClick={() => setGuideOpen(true)}
            >
              📖 사이트 사용법
            </button>
            <a
              className="gate-guide-btn feedback-link"
              href={FEEDBACK_SHEET_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="feedback-link-gate"
            >
              📝 이슈·보완점 제보
            </a>
          </div>
        </div>
        {guideOpen && <UserGuide onClose={() => setGuideOpen(false)} />}
      </section>
    );
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="loading">워크스페이스 로딩 중...</div>}>
        {/* 키보드 사용자용 본문 바로가기(B3) — 포커스될 때만 보인다. */}
        <a className="skip-link" href="#questionStem">본문 바로가기</a>
        <MobileTopBar />
        <main className="app-shell" data-drawer={drawerOpen ? 'open' : 'closed'} aria-label={`${activeProduct.toUpperCase()} 문제풀이 앱`}>
          <ModeAnnouncer />
          <Sidebar />
          {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
          <QuestionWorkspace />
        </main>
        <AppModals />
      </Suspense>
    </ErrorBoundary>
  );
};
