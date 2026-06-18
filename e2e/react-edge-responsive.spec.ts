import { test, expect } from "@playwright/test";
import { openSet, openProduct, modeBtn, submitGrade } from "./helpers";

// 엣지: 반응형(모바일 드로어·하단바·점프핀·소형 뷰포트).
test.describe("엣지-반응형", () => {
  test.describe("모바일(375x812)", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("모바일 상단바가 보인다", async ({ page }) => {
      await openProduct(page, "ISTQB");
      await expect(page.locator(".mobile-topbar")).toBeVisible();
    });

    test("인라인 팔레트는 모바일에서 숨겨진다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await expect(page.locator(".palette-block")).toBeHidden();
    });

    test("☰로 드로어가 열리고 백드롭으로 닫힌다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      const shell = page.locator(".app-shell");
      await page.getByTestId("drawer-open").click();
      await expect(shell).toHaveAttribute("data-drawer", "open");
      await page.locator(".drawer-backdrop").click({ position: { x: 360, y: 400 } });
      await expect(shell).toHaveAttribute("data-drawer", "closed");
    });

    test("드로어는 Esc로 닫힌다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("drawer-open").click();
      await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "open");
      await page.keyboard.press("Escape");
      await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "closed");
    });

    test("모드 변경 시 드로어가 자동으로 닫힌다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("drawer-open").click();
      await page.locator('.segmented button[data-mode="exam"]').click();
      await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "closed");
    });

    test("점프핀→문항 이동 시트로 문항을 옮긴다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("jump-pin").click();
      const sheet = page.getByTestId("palette-jump");
      await expect(sheet).toBeVisible();
      await sheet.locator("button", { hasText: /^4$/ }).click();
      await expect(page.getByTestId("jump-pin")).toContainText("4 /");
    });

    test("하단 액션바 채점 흐름이 동작한다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("drawer-open").click();
      await modeBtn(page, "시험").click();
      await page.locator("#options .option").first().click();
      await submitGrade(page, "grade-button-m");
      await expect(page.getByTestId("score")).toContainText("점수", { timeout: 8_000 });
    });

    test("드로어에서 학습 통계가 열린다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("drawer-open").click();
      await page.getByTestId("stats-open").click();
      await expect(page.getByTestId("stats-dashboard")).toBeVisible({ timeout: 5_000 });
    });

    test("제품 선택 게이트가 모바일에서 표시된다", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "ISTQB" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "CSTS" })).toBeVisible();
    });
  });

  test.describe("초소형(320x640)", () => {
    test.use({ viewport: { width: 320, height: 640 } });

    test("320px에서도 문항과 보기가 렌더된다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await expect(page.locator("#questionStem")).toBeVisible();
      await expect(page.locator("#options .option").first()).toBeVisible();
    });
  });

  test.describe("태블릿(768x1024)", () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test("태블릿에서 CSTS 문항이 렌더된다", async ({ page }) => {
      await openSet(page, "CSTS", "CSTS-FL-2402");
      await expect(page.locator("#questionStem")).toBeVisible();
      await expect(page.locator("#options .option").first()).toBeVisible();
    });

    test("태블릿에서도 채점 결과 모달이 표시된다", async ({ page }) => {
      // 768px은 ≤880(모바일 레이아웃) → 모드는 드로어에서, 채점은 하단바로.
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("drawer-open").click();
      await modeBtn(page, "시험").click();
      await page.locator("#options .option").first().click();
      await submitGrade(page, "grade-button-m");
      await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 8_000 });
    });
  });
});
