import React, { useEffect, useState, Suspense } from 'react';
import { useQuizStore } from '../store/useQuizStore';
import { restorePersistentSnapshot } from '../utils/storage';
import { ErrorBoundary } from '../components/common/ErrorBoundary';

const Sidebar = React.lazy(() => import('../components/layout/Sidebar').then(module => ({ default: module.Sidebar })));
const QuestionWorkspace = React.lazy(() => import('../components/quiz/QuestionWorkspace').then(module => ({ default: module.QuestionWorkspace })));

export const App = () => {
  const { mode, activeProduct, setMode, setActiveProduct } = useQuizStore();
  const [isRestored, setIsRestored] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("istqb-fl-v4-sample-last-product");
    const lastProduct = stored === 'istqb' || stored === 'csts' ? stored : null;
    if (lastProduct) {
      setActiveProduct(lastProduct);
      restorePersistentSnapshot(lastProduct).then(() => setIsRestored(true));
    } else {
      setIsRestored(true); // show home
    }
  }, [setActiveProduct]);

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
            <button 
              className="product-button primary" 
              onClick={() => handleProductSelect('istqb')}
            >
              ISTQB
            </button>
            <button 
              className="product-button" 
              onClick={() => handleProductSelect('csts')}
            >
              CSTS
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <main className="app-shell" aria-label={`${activeProduct.toUpperCase()} 문제풀이 앱`}>
      <ErrorBoundary>
        <Suspense fallback={<div className="loading">워크스페이스 로딩 중...</div>}>
          <Sidebar />
          <QuestionWorkspace />
        </Suspense>
      </ErrorBoundary>
    </main>
  );
};
