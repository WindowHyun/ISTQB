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

  test.describe("ignorePageErrors", () => {
    test.use({ ignorePageErrors: [/harness-noise/] });

    test("지정한 패턴의 예외는 실패로 치지 않는다", async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => setTimeout(() => { throw new Error("harness-noise"); }, 0));
      // 수집되지 않으므로 pageErrors로는 기다릴 수 없다 — 예외가 전달될 틈을 준다.
      // eslint-disable-next-line no-restricted-syntax -- "아무 일도 없어야 한다"는 부정 단언의 관찰 창이다.
      await page.waitForTimeout(200);
    });

    test.describe("필터가 가르는 것", () => {
      // 실패 여부가 아니라 무엇이 수집됐는지를 직접 본다. test.fail로 보면 "아무것도 수집되지
      // 않아 poll이 시간 초과"도 기대한 실패로 통과해, 필터가 전부 삼키는 결함을 못 잡는다.
      test.use({ allowPageErrors: true });
      test("패턴에 맞는 것만 빠지고 나머지는 수집된다", async ({ page, pageErrors }) => {
        await page.goto("/");
        await page.evaluate(() => {
          setTimeout(() => { throw new Error("harness-noise"); }, 0);
          setTimeout(() => { throw new Error("real-app-error"); }, 0);
        });
        await expect.poll(() => pageErrors.length).toBeGreaterThan(0);
        expect(pageErrors.join(" | ")).toContain("real-app-error");
        expect(pageErrors.join(" | ")).not.toContain("harness-noise");
      });
    });
  });
});
