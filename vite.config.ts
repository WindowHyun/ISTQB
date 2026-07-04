import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from 'vite-plugin-pwa';

// 빌드 엔트리는 index.vite.html(과거 레거시 루트 index.html과의 충돌 회피에서 유래한 이름).
// 정적 호스팅(Vercel)·PWA navigateFallback은 dist/index.html을 기대하므로,
// 산출물 파일명만 index.html로 바꿔 emit한다(소스 파일명은 그대로 유지).
function emitIndexHtml() {
  return {
    name: 'emit-index-html',
    enforce: 'post' as const,
    generateBundle(_options: unknown, bundle: Record<string, { fileName: string }>) {
      const entry = bundle['index.vite.html'];
      if (entry) {
        entry.fileName = 'index.html';
        bundle['index.html'] = entry;
        delete bundle['index.vite.html'];
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    // 이 PWA(service worker)는 Vite 빌드 산출물(dist/, React 앱) 스코프를 관리한다.
    // public/service-worker.js 는 과거 레거시 SW 사용자를 해제하는 tombstone(유지 필요).
    VitePWA({
      // 'prompt': 새 SW를 자동 활성화하지 않고 onNeedRefresh로 알린다.
      // 앱 내 업데이트 배너(UpdatePrompt)가 사용자 1탭으로 갱신을 처리한다.
      registerType: 'prompt',
      injectRegister: false, // 등록은 useRegisterSW(React 훅)에서 직접 수행
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'ISTQB/CSTS Practice App',
        short_name: 'Practice',
        theme_color: '#166064',
        background_color: '#f5f7f2',
        display: 'standalone',
        icons: [
          { src: 'icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: 'icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    }),
    emitIndexHtml(),
  ],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "index.vite.html",
    },
  },
});
