import { test, expect } from "@playwright/test";
import { openProduct } from "./helpers";

// PWA 업데이트 배너: 새 버전이 없을 땐 노출되지 않는다(기본 상태 가드).
test.describe("PWA 업데이트 배너", () => {
  test("기본 진입(게이트)에서는 업데이트 배너가 보이지 않는다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("update-prompt")).toHaveCount(0);
  });

  test("워크스페이스에서도 업데이트 배너는 기본 비노출이다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await expect(page.getByTestId("update-prompt")).toHaveCount(0);
  });
});
