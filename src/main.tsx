import React from 'react';
import { createRoot } from 'react-dom/client';
import './utils/debugLog'; // 콘솔 패치를 앱 코드보다 먼저 적용(초기 로그 포착)
import { App } from './app/App';
import { DebugConsole } from './components/debug/DebugConsole';
import { UpdatePrompt } from './components/common/UpdatePrompt';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './styles/globals.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
      {/* App 밖에 있는 두 오버레이도 경계로 감싼다 — 여기서 예외가 나면 App이 멀쩡해도
          루트 렌더가 통째로 실패해 백지가 된다. App 내부 경계와 분리해 서로를 넘어뜨리지
          않게 각각 감싼다. */}
      <ErrorBoundary>
        <UpdatePrompt />
      </ErrorBoundary>
      <ErrorBoundary>
        <DebugConsole />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
