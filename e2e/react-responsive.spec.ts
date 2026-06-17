import { test, expect } from "@playwright/test";
import { openProduct, openSet, modeBtn, submitGrade } from "./helpers";

// 반응형(모바일/태블릿 뷰포트)에서 핵심 동작.
test.describe("반응형", () => {
  test.describe("모바일(375x812)", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("앱이 로드되고 문항이 렌더된다", async ({ page }) => {
      await openProduct(page, "ISTQB");
      await expect(page.locator("#questionStem")).toBeVisible();
      await expect(page.locator("#options .option").first()).toBeVisible();
    });

    test("상단바와 워크스페이스가 보인다(컨트롤은 드로어)", async ({ page }) => {
      await openProduct(page, "ISTQB");
      await expect(page.locator(".mobile-topbar")).toBeVisible();
      await expect(page.locator(".workspace")).toBeVisible();
    });

    test("점프핀→문항 이동 시트로 문항을 옮길 수 있다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("jump-pin").click();
      const sheet = page.getByTestId("palette-jump");
      await expect(sheet).toBeVisible();
      await sheet.locator("button", { hasText: /^3$/ }).click();
      await expect(page.getByTestId("jump-pin")).toContainText("3 /");
    });

    test("하단 액션바 채점 흐름이 동작한다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      // 모드 변경은 드로어에서
      await page.getByTestId("drawer-open").click();
      await modeBtn(page, "시험").click();
      await page.locator("#options .option").first().click();
      await submitGrade(page, "grade-button-m");
      await expect(page.getByTestId("score")).toContainText("점수", { timeout: 8_000 });
    });

    test("제품 선택 게이트가 표시된다", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "ISTQB" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "CSTS" })).toBeVisible();
    });

    test("드로어에서 설정 모달이 열리고 닫힌다", async ({ page }) => {
      await openProduct(page, "ISTQB");
      await page.getByTestId("drawer-open").click();
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
