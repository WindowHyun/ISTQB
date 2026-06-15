import { defineConfig, devices } from "@playwright/test";

// E2E는 실제 배포되는 레거시 앱(루트 index.html + script.js)을 local-server로 띄워 검증한다.
// (React 앱 E2E는 #56/#57 해결 후 별도 추가 — 현재 런타임 크래시로 스모크 불가)
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run serve",
    url: "http://localhost:8080",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
