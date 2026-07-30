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
      // 현재값(stmt 81.0·branch 72.8·func 79.9·line 83.2)보다 약 2%p 낮게 잡는다.
      // 그동안 임계값이 실측보다 13%p 낮아 사실상 아무 회귀도 막지 못했다 —
      // 테스트를 보강할 때 여기도 함께 올린다(설정 취지대로).
      thresholds: {
        statements: 79,
        branches: 70,
        functions: 77,
        lines: 81,
      },
    },
  },
});
