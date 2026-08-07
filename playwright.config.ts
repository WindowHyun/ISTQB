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
  // ⚠️ 로컬에서 `npm run test:e2e`·`test:nf`·`test:apk`를 **동시에 띄우지 말 것.**
  // 아래 webServer는 프로젝트별이 아니라 설정 전체에 하나이고, 포트(4173)와 산출물(dist/)을
  // 모든 프로젝트가 공유한다. 별개 프로세스로 두 번 실행하면 둘 다 서버가 없다고 보고
  // 각자 `npm run build`를 돌려 같은 dist/에 동시에 쓴다 — 먼저 시작한 쪽이 테스트 중인
  // 산출물이 밑에서 갈리면서 문항이 안 뜨고 locator가 타임아웃한다.
  // 실측: apk와 nonfunctional을 동시에 별도 실행 → 각각 2건씩 실패(총 4건).
  //       같은 두 스위트를 한 번의 호출로 실행 → 33/33 통과.
  // 여러 스위트를 한꺼번에 돌리려면 `npm run test:e2e:all`처럼 **한 번의 호출에
  // --project를 여러 개** 준다(서버·빌드가 하나로 공유된다). CI는 잡마다 러너가 분리돼
  // 이 문제가 없다.
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
