import React, { useEffect, useState, Suspense } from 'react';
import { useQuizStore } from '../store/useQuizStore';
import { restorePersistentSnapshot } from '../utils/storage';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { MobileTopBar } from '../components/layout/MobileTopBar';
import { AppModals } from '../components/modals/AppModals';

const Sidebar = React.lazy(() => import('../components/layout/Sidebar').then(module => ({ default: module.Sidebar })));
const QuestionWorkspace = React.lazy(() => import('../components/quiz/QuestionWorkspace').then(module => ({ default: module.QuestionWorkspace })));

export const App = () => {
  const { mode, activeProduct, drawerOpen, setMode, setActiveProduct, setDrawerOpen, resetToGate } = useQuizStore();
  const [isRestored, setIsRestored] = useState(false);

  useEffect(() => {
    // 진입 시 항상 제품 선택 화면(게이트)을 먼저 보여준다(#5).
    // 저장된 답안/진행 상태는 제품을 선택하는 순간 복원한다(handleProductSelect).
    setIsRestored(true);
  }, []);

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

  const handleProductSelect = async (product: 'istqb' | 'csts') => {
    localStorage.setItem("istqb-fl-v4-sample-last-product", product);
    setActiveProduct(product);
    await restorePersistentSnapshot(product);
    setMode('practice');
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
            <button className="product-button primary" onClick={() => handleProductSelect('istqb')}>ISTQB</button>
            <button className="product-button" onClick={() => handleProductSelect('csts')}>CSTS</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="loading">워크스페이스 로딩 중...</div>}>
        <MobileTopBar />
        <main className="app-shell" data-drawer={drawerOpen ? 'open' : 'closed'} aria-label={`${activeProduct.toUpperCase()} 문제풀이 앱`}>
          <Sidebar />
          {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
          <QuestionWorkspace />
        </main>
        <AppModals />
      </Suspense>
    </ErrorBoundary>
  );
};
