import { test, expect } from "@playwright/test";
import { openProduct, openSet, modeBtn } from "./helpers";

// 반응형(모바일/태블릿 뷰포트)에서 핵심 동작.
test.describe("반응형", () => {
  test.describe("모바일(375x812)", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("앱이 로드되고 문항이 렌더된다", async ({ page }) => {
      await openProduct(page, "ISTQB");
      await expect(page.locator("#questionStem")).toBeVisible();
      await expect(page.locator("#options .option").first()).toBeVisible();
    });

    test("사이드바와 워크스페이스가 모두 보인다(세로 스택)", async ({ page }) => {
      await openProduct(page, "ISTQB");
      await expect(page.locator(".sidebar")).toBeVisible();
      await expect(page.locator(".workspace")).toBeVisible();
    });

    test("문제 번호 팔레트로 이동할 수 있다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.locator('#questionNav button:has-text("3")').first().click();
      await expect(page.locator("#questionNav button.current")).toHaveText("3");
    });

    test("채점 흐름이 동작한다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await modeBtn(page, "시험").click();
      await page.locator("#options .option").first().click();
      await page.getByTestId("grade-button").click();
      await expect(page.getByTestId("score")).toContainText("점수", { timeout: 8_000 });
    });

    test("제품 선택 게이트가 표시된다", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "ISTQB" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "CSTS" })).toBeVisible();
    });

    test("설정 모달이 열리고 닫힌다", async ({ page }) => {
      await openProduct(page, "ISTQB");
      await page.getByRole("button", { name: /설정/ }).click();
      const dialog = page.getByRole("dialog", { name: "설정" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "닫기" }).click();
      await expect(dialog).toHaveCount(0);
    });
  });

  test.describe("태블릿(768x1024)", () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test("태블릿에서 문항과 보기가 렌더된다", async ({ page }) => {
      await openSet(page, "CSTS", "CSTS-FL-2402");
      await expect(page.locator("#questionStem")).toBeVisible();
      await expect(page.locator("#options .option").first()).toBeVisible();
    });
  });
});
