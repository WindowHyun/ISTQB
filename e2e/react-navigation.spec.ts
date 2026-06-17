import { test, expect } from "@playwright/test";
import { openSet, gotoQuestion } from "./helpers";

// 문항 네비게이션(이전/다음/팔레트/키보드).
test.describe("네비게이션", () => {
  test("다음 버튼으로 다음 문항으로 이동한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    const before = await page.locator("#questionTitle").textContent();
    await page.locator("#nextBtn").click();
    await expect(page.locator("#questionTitle")).not.toHaveText(before || "");
  });

  test("이전 버튼으로 이전 문항으로 돌아간다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.locator("#nextBtn").click();
    const mid = await page.locator("#questionTitle").textContent();
    await page.locator("#prevBtn").click();
    await expect(page.locator("#questionTitle")).not.toHaveText(mid || "");
  });

  test("첫 문항에서 이전 버튼은 비활성이다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await expect(page.locator("#prevBtn")).toBeDisabled();
  });

  test("마지막 문항에서 다음 버튼은 비활성이다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    const total = await page.locator("#questionNav button").count();
    await gotoQuestion(page, total);
    await expect(page.locator("#nextBtn")).toBeDisabled();
  });

  test("팔레트: 답을 고르면 해당 번호가 answered 상태가 된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    expect(await page.locator("#questionNav button.answered").count()).toBe(0);
    await page.locator("#options .option").first().click();
    expect(await page.locator("#questionNav button.answered").count()).toBeGreaterThanOrEqual(1);
  });

  test("키보드 화살표로 좌우 이동한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    const first = await page.locator("#questionTitle").textContent();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#questionTitle")).not.toHaveText(first || "");
    const second = await page.locator("#questionTitle").textContent();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#questionTitle")).not.toHaveText(second || "");
  });
});
