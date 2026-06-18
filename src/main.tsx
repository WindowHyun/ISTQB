import React from 'react';
import { createRoot } from 'react-dom/client';
import './utils/debugLog'; // 콘솔 패치를 앱 코드보다 먼저 적용(초기 로그 포착)
import { App } from './app/App';
import { DebugConsole } from './components/debug/DebugConsole';
import './styles/globals.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
      <DebugConsole />
    </React.StrictMode>
  );
}
