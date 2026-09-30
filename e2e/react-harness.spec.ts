import { test, expect } from "./fixtures";

// 하네스 자체 검사 — 공용 fixture(e2e/fixtures.ts)가 페이지 예외를 실제로 실패로 만드는지.
// 이 검사가 없으면 fixture가 조용히 꺼져도(예: auto 누락) 모든 스펙이 초록인 채로 지나간다.
test.describe("하네스: 페이지 예외 fixture", () => {
  test("잡히지 않은 예외가 나면 테스트가 실패한다", async ({ page, pageErrors }) => {
    test.fail(true, "fixture가 teardown에서 pageerror를 실패로 만들어야 한다");
    await page.goto("/");
    await page.evaluate(() => setTimeout(() => { throw new Error("harness-probe"); }, 0));
    await expect.poll(() => pageErrors.length).toBe(1); // 예외가 수집된 뒤 fixture가 teardown에서 실패시킨다
  });

  test.describe("allowPageErrors", () => {
    test.use({ allowPageErrors: true });
    test("옵트아웃하면 예외가 있어도 통과한다", async ({ page, pageErrors }) => {
      await page.goto("/");
      await page.evaluate(() => setTimeout(() => { throw new Error("harness-probe"); }, 0));
      await expect.poll(() => pageErrors.length).toBe(1);
    });
  });
});
