import { test, expect } from "@playwright/test";
import { openProduct, openSet } from "./helpers";

// 설정 모달(앱 이동/글자 크기/기록/초기화).
test.describe("설정", () => {
  test("⚙ 설정 버튼으로 모달이 열린다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await expect(page.getByRole("dialog", { name: "설정" })).toBeVisible({ timeout: 5_000 });
  });

  test("설정 모달을 닫을 수 있다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    const dialog = page.getByRole("dialog", { name: "설정" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("글자 크기 '작게'가 body에 반영된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("button", { name: "작게" }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.qfont)).toBe("small");
  });

  test("글자 크기 '크게' 후 '기본'으로 복귀된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("button", { name: "크게" }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.qfont)).toBe("large");
    await page.getByRole("button", { name: "기본" }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.qfont)).toBe("normal");
  });

  test("'처음 화면으로' → 제품 선택 게이트로 이동한다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("button", { name: /처음 화면/ }).click();
    await expect(page.getByRole("button", { name: "ISTQB" })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("button", { name: "CSTS" })).toBeVisible();
  });

  test("'선택 답안 초기화'가 2단계 확인 후 동작한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.locator("#options .option").first().click();
    expect(await page.locator("#questionNav button.answered").count()).toBeGreaterThanOrEqual(1);
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("button", { name: "현재 모드 답안 초기화" }).click();
    await page.getByTestId("confirm-reset-yes").click();
    await page.waitForTimeout(300);
    expect(await page.locator("#questionNav button.answered").count()).toBe(0);
  });
});
