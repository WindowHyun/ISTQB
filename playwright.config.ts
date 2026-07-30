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
      // react-quick-wrongnote·react-reset-ghost는 저장소 계층이라 여기 있어야 한다:
      // 퀵 오답 임시 목록은 localStorage에 24시간 TTL로 남고, '이력 비우기'는 IndexedDB
      // 삭제와 localStorage 정리를 함께 한다. Safari는 storage 정책이 가장 유별난
      // 브라우저라 이 경로가 Chromium에서만 검증되면 "Safari에서만 안 지워진다"를 놓친다.
      // (react-quick은 이미 대상인데 그 옆 파일만 빠져 있던 것도 일관성이 없었다.)
      testMatch: /(react-smoke|react-grade|react-functional|react-qtypes|react-persistence|react-quick-wrongnote|react-quick|react-reset-ghost|react-exam-timer|react-edge-import|react-pwa|react-review-loop|react-modes|react-webkit-motion)\.spec\.ts/,
      // reducedMotion: WebKit에서 호버/누름 트랜스폼(.option의 scale, 팔레트의 translateY)이
      // 전환 중인 동안 Playwright의 "stable" 판정을 통과하지 못해, 연속 클릭 루프가
      // 30초 타임아웃으로 죽었다(첫 CI 실행에서 4건). 사람이 누를 때는 문제가 아니라
      // 판정 기준이 사람보다 엄격한 것이므로 제품 결함은 아니다. 동시에 이 설정은
      // 꾸며낸 상태가 아니라 실제 사용자 설정이며, 앱이 그 요청을 제대로 존중하는지도
      // 함께 밟게 된다(globals.css의 prefers-reduced-motion 전역 규칙).
      // 원인 규명 완료(react-webkit-motion): WebKit에서는 **문항 하나를 렌더할 때마다
      // 메인 스레드가 1~1.4초 블록된다**(Chromium은 같은 지점에서 25프레임/400ms).
      // 실측 근거 — 빈 페이지 21프레임 · 게이트(DOM 27) 14프레임 · 문항(DOM 172) 2프레임,
      // 그리고 같은 문항 화면에서 2초를 가만히 기다리면 18프레임으로 회복한다. 즉 지속적인
      // 기아가 아니라 렌더 직후의 일시 버스트다. 서비스워커 precache는 원인이 아니다
      // (캐시가 이미 110개로 찬 상태에서도, SW를 통째로 지운 뒤에도 그대로 2프레임).
      //
      // 그래서 긴 클릭 루프(보기→다음 10~70회)는 매 클릭이 버스트를 다시 켜서 30초 기본
      // 타임아웃 안에 끝나지 못한다. 종전에는 이 5건을 grepInvert로 범위 밖에 뒀는데,
      // 원인이 "테스트가 틀렸다"가 아니라 "앱이 Safari에서 느리다"로 밝혀졌으므로 제외를
      // 걷고 타임아웃만 늘려 게이트 안으로 되돌린다 — 느린 것을 안 보이게 만드는 대신
      // 실제로 통과하는지를 계속 확인한다. 렌더 비용 자체는 별도 과제로 남아 있다.
      timeout: 180_000,
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
