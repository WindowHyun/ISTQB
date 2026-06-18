import { test, expect } from "@playwright/test";
import { openSet, gotoQuestion } from "./helpers";

// 엣지: 경계 네비게이션(첫/끝 문항, 키보드, 팔레트, 입력 포커스).
test.describe("엣지-네비게이션", () => {
  test("첫 문항에서 이전 버튼은 비활성", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await expect(page.locator("#prevBtn")).toBeDisabled();
    await expect(page.locator("#nextBtn")).toBeEnabled();
  });

  test("마지막 문항에서 다음 버튼은 비활성", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    const total = await page.locator("#questionNav button").count();
    await gotoQuestion(page, total);
    await expect(page.locator("#nextBtn")).toBeDisabled();
    await expect(page.locator("#prevBtn")).toBeEnabled();
  });

  test("첫 문항에서 ArrowLeft를 눌러도 1번을 유지한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#questionTitle")).toContainText("문제 1");
  });

  test("마지막 문항에서 ArrowRight를 눌러도 범위를 벗어나지 않는다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    const total = await page.locator("#questionNav button").count();
    await gotoQuestion(page, total);
    const before = await page.locator("#questionTitle").textContent();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#questionTitle")).toHaveText(before || "");
    await expect(page.locator("#nextBtn")).toBeDisabled();
  });

  test("팔레트로 마지막 문항 점프 시 다음 버튼 비활성", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 40);
    await expect(page.locator('#questionNav button[aria-current="true"]')).toHaveText("40");
    await expect(page.locator("#nextBtn")).toBeDisabled();
  });

  test("팔레트로 중간→첫 문항 점프 시 이전 버튼 비활성", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 20);
    await gotoQuestion(page, 1);
    await expect(page.locator("#prevBtn")).toBeDisabled();
  });

  test("ArrowRight 연타로 문항이 순차 증가한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#questionTitle")).toContainText("문제 3");
  });

  test("팔레트 접기 시 #questionNav가 사라지고 펼치면 복원된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await expect(page.locator("#questionNav")).toBeVisible();
    await page.getByTestId("palette-toggle").click();
    await expect(page.locator("#questionNav")).toHaveCount(0);
    await page.getByTestId("palette-toggle").click();
    await expect(page.locator("#questionNav")).toBeVisible();
  });

  test("'문항 이동' 모달은 Esc로 닫힌다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.getByTestId("palette-jump-btn").click();
    await expect(page.getByTestId("palette-jump")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("palette-jump")).toHaveCount(0);
  });

  test("'문항 이동' 모달에서 현재 문항을 눌러도 닫히고 동일 문항", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.getByTestId("palette-jump-btn").click();
    await page.getByTestId("palette-jump").locator("button", { hasText: /^1$/ }).click();
    await expect(page.getByTestId("palette-jump")).toHaveCount(0);
    await expect(page.locator("#questionTitle")).toContainText("문제 1");
  });

  test("현재 문항 팔레트 버튼에 aria-current가 설정된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await expect(page.locator('#questionNav button[aria-current="true"]')).toHaveText("1");
    await gotoQuestion(page, 7);
    await expect(page.locator('#questionNav button[aria-current="true"]')).toHaveText("7");
  });

  test("세트를 바꾸면 첫 문항(1번)으로 리셋된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 10);
    await page.locator("#examSelect").selectOption("ISTQB-FL-V4-B");
    await expect(page.locator("#questionTitle")).toContainText("문제 1");
  });

  test("EXTRA(26문항) 세트도 마지막 문항 경계가 정상", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-EXTRA");
    // 세트 전환 후 팔레트가 26개로 갱신될 때까지 대기(비동기 로드)
    await expect.poll(() => page.locator("#questionNav button").count()).toBe(26);
    await gotoQuestion(page, 26);
    await expect(page.locator("#nextBtn")).toBeDisabled();
  });

  test("팔레트 요약(N/total)이 현재 문항을 반영한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 5);
    await expect(page.locator(".palette-summary")).toContainText("5 / 40");
  });
});
