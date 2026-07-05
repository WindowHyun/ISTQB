import { defineConfig } from "vitest/config";

// 유닛 테스트 전용 설정. (vite.config.ts의 React/PWA 플러그인을 로드하지 않도록 별도 파일)
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // 유닛이 실제로 다루는 로직 계층(store·utils)만 대상.
      // 컴포넌트/훅/앱 셸은 E2E(255)가 담당하므로 `all`은 켜지 않는다
      // (켜면 미임포트 파일까지 0%로 집계돼 임계값이 무의미해진다).
      include: ["src/store/**", "src/utils/**"],
      // 현재값(stmt 55.1·branch 52.9·func 54.9·line 55.3)보다 약 1%p 낮게 잡아
      // 지금은 통과시키되 향후 회귀를 차단하는 안전 게이트.
      thresholds: {
        statements: 54,
        branches: 50,
        functions: 53,
        lines: 54,
      },
    },
  },
});
