import { defineConfig } from "vitest/config";

// 유닛 테스트 전용 설정. (vite.config.ts의 React/PWA 플러그인을 로드하지 않도록 별도 파일)
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
