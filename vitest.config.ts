import { defineConfig } from "vitest/config";

// 유닛 테스트 전용 설정. (vite.config.ts의 React/PWA 플러그인을 로드하지 않도록 별도 파일)
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // 측정 대상: store · utils · **hooks**.
      //
      // hooks를 넣는 이유: 종전에는 store+utils만 재서 소스의 46%만 지표가 있었고,
      // 나머지 53%(hooks·components·app)는 숫자조차 없었다. 그 사각지대에서 결함이
      // 반복해서 나왔다 — 실제로 한 번의 코드 리뷰에서 찾은 6건 중 4건이 여기 살았고,
      // 그중 둘(퀵의 죽은 오답 키 읽기, 전멸형 Promise.all)이 hooks/였다.
      // 커버리지가 낮은 것과 커버리지를 모르는 것은 다르다. 낮은 채로 두더라도
      // **보이게** 두어야 나빠지는 것을 알 수 있다.
      //
      // components/app은 아직 넣지 않는다. 3,499줄이 사실상 0%라 넣으면 전체 수치가
      // 반토막 나면서 임계값이 무의미해지고, 그것들은 뷰 계층이라 E2E가 맞는 도구다.
      // hooks는 다르다 — 순수 로직을 품고 있어 밖으로 꺼내면 유닛으로 잡을 수 있다
      // (reviewTargetIds가 그 예다: effect 안에 묻혀 있던 계산을 꺼내 검사로 고정했다).
      include: ["src/store/**", "src/utils/**", "src/hooks/**"],
      // 임계값은 "지금보다 나빠지지 않는다"는 바닥이다(실측보다 약 2%p 낮게).
      //
      // 종전(79/70/77/81)보다 낮아 보이는 것은 테스트가 줄어서가 아니라 **재는 범위가
      // 넓어졌기 때문이다.** hooks를 포함하면서 분모가 늘었다.
      //
      // 이 값을 올리는 방법은 렌더러를 들이는 것이 아니라, 훅 안의 순수 로직을 모듈로
      // 꺼내 유닛으로 덮는 것이다 — reviewTargetIds(useQuestions), roundHistory
      // (useQuizSession의 회차 조립)가 그 사례다. 꺼낼 때마다 여기 임계값도 함께 올린다.
      // hooks 디렉터리 자체의 %는 크게 오르지 않는다(남는 건 React 글루다) — 오르는 건
      // 전체 수치이고, 그게 이 래칫이 재려는 값이다.
      //
      // 래칫 기록: 2026-08-07 실측 75.28 / 71.06 / 70.42 / 77.30 (직전 72.5 / 67.0 / 67.1 / 74.7)
      thresholds: {
        statements: 73,
        branches: 69,
        functions: 68,
        lines: 75,
      },
    },
  },
});
