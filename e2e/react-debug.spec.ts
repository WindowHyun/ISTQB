import { test, expect } from "@playwright/test";

// 화면 콘솔(in-app console): ?debug 로 켜기, 로그 캡처, 끄기.
test.describe("화면 콘솔", () => {
  test("기본 상태에서는 콘솔 버튼이 보이지 않는다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("debug-fab")).toHaveCount(0);
  });

  test("?debug 로 진입하면 콘솔 버튼이 뜨고 로그가 캡처된다", async ({ page }) => {
    await page.goto("/?debug");
    const fab = page.getByTestId("debug-fab");
    await expect(fab).toBeVisible({ timeout: 8_000 });
    // 페이지에서 발생한 로그가 패널에 표시된다
    await page.evaluate(() => console.log("E2E_CONSOLE_MARKER"));
    await fab.click();
    await expect(page.getByTestId("debug-body")).toContainText("E2E_CONSOLE_MARKER", { timeout: 5_000 });
  });

  test("'끄기'를 누르면 콘솔이 사라지고 새로고침해도 꺼져 있다", async ({ page }) => {
    await page.goto("/?debug");
    await page.getByTestId("debug-fab").click();
    await page.getByTestId("debug-off").click();
    await expect(page.getByTestId("debug-fab")).toHaveCount(0);
    await page.goto("/");
    await expect(page.getByTestId("debug-fab")).toHaveCount(0);
  });
});
