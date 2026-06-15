import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // 이 PWA(service worker)는 Vite 빌드 산출물(dist/, React 앱) 스코프만 관리한다.
    // 루트/www의 수기 service-worker.js는 레거시 정적 앱(Vercel 루트 서빙) 전용으로,
    // 두 SW는 서로 다른 배포 산출물에 속하므로 스코프가 겹치지 않는다.
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}']
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
    })
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
