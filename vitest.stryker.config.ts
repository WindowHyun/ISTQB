import { defineConfig } from "vitest/config";

// Stryker(뮤테이션 테스팅) 전용 vitest 설정 — 커버리지 임계값 게이트를 끈다.
// (뮤턴트 실행마다 커버리지 임계 실패가 "테스트 실패"로 오인되는 것 방지)
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
