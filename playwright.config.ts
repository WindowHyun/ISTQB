import { defineConfig, devices } from "@playwright/test";

// 두 앱을 각각 검증한다:
//  - legacy: 실제 배포되는 루트 index.html + script.js (local-server, 커밋된 자산 사용 = 운영과 동일)
//  - react : Vite 빌드 산출물(dist/index.html)을 vite preview로 서빙 (#56 수정 런타임 검증, #68)
const LEGACY_URL = "http://localhost:8080";
const REACT_URL = "http://localhost:4173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }]] : "list",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "legacy",
      testMatch: /legacy-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: LEGACY_URL },
    },
    {
      name: "react",
      testMatch: /react-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: REACT_URL },
    },
  ],
  webServer: [
    {
      // 레거시는 커밋된 자산을 그대로 서빙(동기화 훅 없는 node 직접 실행 → preview 빌드와 sync 경합 방지).
      command: "node local-server.js",
      url: LEGACY_URL,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      // React: 빌드(prebuild에서 자산 동기화 1회) 후 dist/를 preview로 서빙.
      command: "npm run build && npm run preview",
      url: `${REACT_URL}/`,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
