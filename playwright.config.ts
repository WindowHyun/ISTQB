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
      // 기능 E2E(react-*.spec.ts). 비기능 스펙은 별도 프로젝트로 분리해 제외된다.
      name: "react",
      testMatch: /react-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: REACT_URL },
    },
    {
      // 비기능(성능·부하·메모리·복원력) — 전용 CI 잡에서 `--project=nonfunctional`로 실행.
      name: "nonfunctional",
      testMatch: /(^|\/)nonfunctional\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], baseURL: REACT_URL },
    },
    {
      // APK(WebView) 기능 — Android 폰 프로파일 + WebView UA + 안전영역 주입 모사.
      name: "apk",
      testMatch: /apk-functional\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        baseURL: REACT_URL,
        userAgent: `${devices["Pixel 7"].userAgent} wv`,
      },
    },
    {
      // Safari(WebKit) — 사용자가 Safari로도 쓰므로 Chromium 단독 검증으로는 부족하다.
      // Safari 고유의 결함은 대부분 엔진 계층에 산다: IndexedDB 트랜잭션 처리, Blob·File
      // 다운로드(백업 내보내기/가져오기), 서비스워커(PWA), Date 파싱(시험 타이머).
      // 그래서 전 스펙을 다시 돌리는 대신 그 계층을 지나는 핵심 경로만 태운다
      // (전량 재실행은 e2e 잡을 두 배로 만들면서 얻는 것은 대부분 중복이다).
      // 모바일 Safari(iPhone)는 후속으로 — 여기 실린 스펙들이 .segmented·#quickSize를
      // 직접 만지는데 모바일에서는 드로어 안이라 스펙 수정이 먼저 필요하다.
      name: "webkit",
      testMatch: /(react-smoke|react-grade|react-functional|react-qtypes|react-persistence|react-quick|react-exam-timer|react-edge-import|react-pwa|react-review-loop|react-modes)\.spec\.ts/,
      use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 900 }, baseURL: REACT_URL },
    },
    {
      // APK(WebView) 비기능 — 성능·스트레스·메모리·복원력(모바일 프로파일).
      name: "apk-nf",
      testMatch: /apk-nonfunctional\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        baseURL: REACT_URL,
        userAgent: `${devices["Pixel 7"].userAgent} wv`,
      },
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
