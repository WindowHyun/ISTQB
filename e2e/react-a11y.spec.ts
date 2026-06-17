import { test, expect } from "@playwright/test";
import { openProduct, openSet } from "./helpers";

// 접근성(ARIA/키보드/포커스) — 레거시 대비 회귀 방지(#66).
test.describe("접근성", () => {
  test("모드 버튼에 aria-pressed가 반영된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    const practice = page.locator('.segmented button[data-mode="practice"]');
    await expect(practice).toHaveAttribute("aria-pressed", "true");
    const exam = page.locator('.segmented button[data-mode="exam"]');
    await expect(exam).toHaveAttribute("aria-pressed", "false");
  });

  test("풀이 모드 그룹에 role=group과 라벨이 있다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await expect(page.getByRole("group", { name: "풀이 모드" })).toBeVisible();
  });

  test("현재 문항 팔레트 버튼에 aria-current가 설정된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await expect(page.locator('#questionNav button[aria-current="true"]')).toHaveText("1");
  });

  test("보기 버튼에 aria-pressed가 반영된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    const opt = page.locator("#options .option").first();
    await expect(opt).toHaveAttribute("aria-pressed", "false");
    await opt.click();
    await expect(opt).toHaveAttribute("aria-pressed", "true");
  });

  test("이전/다음 버튼에 aria-label이 있다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await expect(page.locator("#prevBtn")).toHaveAttribute("aria-label", "이전 문제");
    await expect(page.locator("#nextBtn")).toHaveAttribute("aria-label", "다음 문제");
  });

  test("백업 파일 입력에 aria-label이 있다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await expect(page.locator('input[type="file"][accept=".json"]')).toHaveAttribute("aria-label", /백업/);
  });

  test("설정 모달은 role=dialog + aria-modal을 갖는다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    const dialog = page.getByRole("dialog", { name: "설정" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  test("키보드(Tab/Enter)만으로 보기를 선택할 수 있다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    const opt = page.locator("#options .option").first();
    await opt.focus();
    await page.keyboard.press("Enter");
    await expect(opt).toHaveClass(/selected/);
  });

  test("진행/타이머 통계 영역에 aria-live가 있다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await expect(page.locator(".stats")).toHaveAttribute("aria-live", "polite");
  });
});
