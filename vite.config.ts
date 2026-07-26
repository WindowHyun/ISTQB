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
      } else {
        // rollup 내부 키가 바뀌면 dist/index.html이 조용히 누락돼 빈 배포가 된다 — 빌드를 실패시킨다.
        throw new Error('[emit-index-html] index.vite.html 엔트리를 찾지 못했습니다 — dist/index.html이 생성되지 않습니다.');
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
      // 아이콘은 globPatterns가 이미 precache에 담는다 — 매니페스트 경유 중복 주입을 끈다.
      // (중복 엔트리는 revision이 갈리는 순간 workbox install이 통째로 실패하는 시한폭탄)
      includeManifestIcons: false,
      manifest: {
        name: 'ISTQB/CSTS Practice App',
        short_name: 'Practice',
        description: 'ISTQB·CSTS 자격증 기출 문제풀이 CBT 학습 앱',
        lang: 'ko',
        // 디자인 토큰과 맞춘 값 — theme_color는 상태바 아래 상단바 배경(--surface),
        // background_color는 스플래시로 쓰이는 페이지 배경(--bg)이다.
        // 종전 값(#166064 틸 / #f5f7f2 연녹)은 모두 폐기된 구 브랜드 팔레트 잔재였다.
        theme_color: '#ffffff',
        background_color: '#eef2f7',
        display: 'standalone',
        // PNG를 우선 선언 — SVG-only 매니페스트는 일부 Android 런처/구형 WebView에서
        // 설치 아이콘 렌더가 불안정하다. maskable은 안전영역 검증 전이라 선언하지 않는다.
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' }
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
