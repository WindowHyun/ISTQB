import { test, expect } from "@playwright/test";
import { openSet } from "./helpers";

// 하이브리드 레이아웃: 접이식 팔레트 · 문항 이동 모달 · 모바일 드로어.
test.describe("레이아웃", () => {
  test("데스크톱: 팔레트 접기/펼치기 토글", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await expect(page.locator("#questionNav")).toBeVisible();
    await page.getByTestId("palette-toggle").click(); // 접기
    await expect(page.locator("#questionNav")).toHaveCount(0);
    await page.getByTestId("palette-toggle").click(); // 펼치기
    await expect(page.locator("#questionNav")).toBeVisible();
  });

  test("데스크톱: '문항 이동' 모달로 문항을 옮긴다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.getByTestId("palette-jump-btn").click();
    const sheet = page.getByTestId("palette-jump");
    await expect(sheet).toBeVisible();
    await sheet.locator("button", { hasText: /^5$/ }).click();
    await expect(sheet).toHaveCount(0); // 선택 후 닫힘
    await expect(page.locator("#questionNav button.current")).toHaveText("5");
  });

  test.describe("모바일 드로어(375x812)", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("☰로 드로어가 열리고 백드롭/Esc로 닫힌다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      const shell = page.locator(".app-shell");
      await expect(shell).toHaveAttribute("data-drawer", "closed");
      await page.getByTestId("drawer-open").click();
      await expect(shell).toHaveAttribute("data-drawer", "open");
      // 백드롭 우측(드로어 바깥) 클릭으로 닫기
      await page.locator(".drawer-backdrop").click({ position: { x: 360, y: 400 } });
      await expect(shell).toHaveAttribute("data-drawer", "closed");
      // 다시 열고 Esc로 닫기
      await page.getByTestId("drawer-open").click();
      await expect(shell).toHaveAttribute("data-drawer", "open");
      await page.keyboard.press("Escape");
      await expect(shell).toHaveAttribute("data-drawer", "closed");
    });

    test("모드 변경 시 드로어가 자동으로 닫힌다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("drawer-open").click();
      await page.locator('.segmented button[data-mode="exam"]').click();
      await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "closed");
    });
  });
});
