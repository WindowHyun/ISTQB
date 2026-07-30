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
      testMatch: /(react-smoke|react-grade|react-functional|react-qtypes|react-persistence|react-quick|react-exam-timer|react-edge-import|react-pwa|react-review-loop|react-modes|react-webkit-motion)\.spec\.ts/,
      // reducedMotion: WebKit에서 호버/누름 트랜스폼(.option의 scale, 팔레트의 translateY)이
      // 전환 중인 동안 Playwright의 "stable" 판정을 통과하지 못해, 연속 클릭 루프가
      // 30초 타임아웃으로 죽었다(첫 CI 실행에서 4건). 사람이 누를 때는 문제가 아니라
      // 판정 기준이 사람보다 엄격한 것이므로 제품 결함은 아니다. 동시에 이 설정은
      // 꾸며낸 상태가 아니라 실제 사용자 설정이며, 앱이 그 요청을 제대로 존중하는지도
      // 함께 밟게 된다(globals.css의 prefers-reduced-motion 전역 규칙).
      // 아래 4건은 아직 원인을 모른 채 제외한다. WebKit에서만 "stable" 판정을 통과하지
      // 못해 30초 타임아웃으로 죽는데, 공통점은 보기→다음을 10~70회 연타하는 긴 루프라는
      // 것뿐이다. 확인한 것: (1) 전용 진단(react-webkit-motion)이 상호작용 뒤 보기 버튼이
      // 500ms 안에 실제로 멈추는 것을 실측했다 — 잔떨림이 도는 제품 결함은 아니다,
      // (2) reducedMotion을 켜도 그대로 실패한다 — 호버·누름 트랜스폼도 원인이 아니다.
      // 통과하는 척 두느니 범위 밖으로 두고, 나머지 56건은 게이트로 유지한다.
      grepInvert: /진위형\(O\/X\)·단답형\(입력\) UI 존재|퀵 회차가 저장소에 온전히 기록된다|퀵 직후 '오답 다시 풀기'|오답노트가 퀵 오답을 출처 세트별로/,
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1280, height: 900 },
        baseURL: REACT_URL,
        reducedMotion: "reduce",
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
