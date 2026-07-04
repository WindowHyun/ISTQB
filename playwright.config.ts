import { defineConfig, devices } from "@playwright/test";

// React 앱(운영 배포와 동일한 Vite 빌드 산출물)을 vite preview로 서빙해 검증한다.
// 레거시 바닐라 앱·legacy 프로젝트는 제거됨(React 단일 런타임, C8).
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
      name: "react",
      testMatch: /react-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: REACT_URL },
    },
  ],
  webServer: [
    {
      // React: 빌드(prebuild에서 자산 동기화 1회) 후 dist/를 preview로 서빙.
      command: "npm run build && npm run preview",
      url: `${REACT_URL}/`,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
