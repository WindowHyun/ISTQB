import { test, expect } from "@playwright/test";
import { openSet, modeBtn, submitGrade } from "./helpers";

// 엣지: 모드 전환(격리·리셋·잠금·빈 오답).
test.describe("엣지-모드", () => {
  test("연습 답안은 시험 모드로 전환 시 진행에 반영되지 않는다(격리)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await page.locator("#options .option").first().click();
    await expect(page.locator("#progressText")).not.toHaveText("0 / 40");
    await modeBtn(page, "시험").click();
    await expect(page.locator("#progressText")).toHaveText("0 / 40");
  });

  test("시험 답안도 연습 모드로 전환 시 격리된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await modeBtn(page, "연습").click();
    // 시험 진행 중이므로 확인 모달이 뜬다 → '이동'으로 전환을 진행한다.
    await page.getByTestId("mode-change-go").click();
    await expect(page.locator("#progressText")).toHaveText("0 / 40");
  });

  test("모드 전환 시 첫 문항으로 이동한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await modeBtn(page, "시험").click();
    await expect(page.locator("#questionTitle")).toContainText("문제 1");
  });

  test("연습 모드에는 채점 버튼이 없다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await expect(page.getByTestId("grade-button")).toHaveCount(0);
  });

  test("시험 모드에는 채점 버튼이 있다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await expect(page.getByTestId("grade-button")).toBeVisible();
  });

  test("랜덤 모드는 40문항 이하로 로드된다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await modeBtn(page, "랜덤").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    const n = await page.locator("#questionNav button").count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(40);
  });

  test("채점 전 오답 모드는 빈 안내를 보이되 크래시하지 않는다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "오답").click();
    await expect(page.locator(".workspace")).toBeVisible();
    await expect(page.locator(".workspace")).toContainText("오답 문항이 없습니다");
  });

  test("연습 모드는 즉시 피드백, 시험 모드는 채점 전 피드백 없음", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await page.locator("#options .option").first().click();
    await expect(page.locator("#feedback")).toBeVisible({ timeout: 4_000 });
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await expect(page.locator("#feedback")).toHaveCount(0);
  });

  test("시험 채점 후 보기는 잠기고, 모드를 바꾸면 잠금이 풀린다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await expect(page.locator("#options .option").first()).toBeDisabled();
    await modeBtn(page, "연습").click();
    await expect(page.locator("#options .option").first()).toBeEnabled();
  });

  test("모드 전환 시 타이머가 0으로 초기화된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.waitForTimeout(1500);
    await modeBtn(page, "시험").click();
    await expect(page.locator("#timerText")).toContainText("00:0");
  });

  test("연습→시험→연습 왕복 후에도 진행 격리가 유지된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await page.locator("#options .option").first().click();
    await modeBtn(page, "시험").click();
    await modeBtn(page, "연습").click();
    await expect(page.locator("#progressText")).toContainText("1 / 40");
  });

  test("채점 후 '오답 다시 풀기'로 오답 모드에 진입한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await page.getByRole("button", { name: "오답 다시 풀기" }).click();
    await page.waitForTimeout(300);
    await expect(page.locator('.segmented button[data-mode="review"]')).toHaveAttribute("aria-pressed", "true");
  });

  test("랜덤 모드는 채점이 가능하다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "랜덤").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(page.getByTestId("score")).toContainText("점수", { timeout: 8_000 });
  });

  test("모드 버튼 aria-pressed가 현재 모드만 true", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await expect(page.locator('.segmented button[data-mode="exam"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('.segmented button[data-mode="practice"]')).toHaveAttribute("aria-pressed", "false");
  });
});

// 시험 모드 진행 중 다른 모드 전환 가드.
test.describe("시험 모드 전환 가드", () => {
  test("시험 진행 중 다른 모드 클릭 시 경고 모달이 노출된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await modeBtn(page, "연습").click();
    await expect(page.getByTestId("mode-change-modal")).toBeVisible();
    await expect(page.getByTestId("mode-change-go")).toBeVisible();
    await expect(page.getByTestId("mode-change-back")).toBeVisible();
  });

  test("'이동' 선택 시 클릭한 모드로 전환된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await modeBtn(page, "랜덤").click();
    await page.getByTestId("mode-change-go").click();
    await expect(page.getByTestId("mode-change-modal")).toHaveCount(0);
    await expect(page.locator('.segmented button[data-mode="random"]')).toHaveAttribute("aria-pressed", "true");
  });

  test("'뒤로가기' 선택 시 시험 모드에 그대로 머문다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await modeBtn(page, "연습").click();
    await page.getByTestId("mode-change-back").click();
    await expect(page.getByTestId("mode-change-modal")).toHaveCount(0);
    await expect(page.locator('.segmented button[data-mode="exam"]')).toHaveAttribute("aria-pressed", "true");
    // 답안도 유지된다.
    await expect(page.locator("#progressText")).toHaveText("1 / 40");
  });

  test("답안이 없으면 시험에서 다른 모드로 경고 없이 전환된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await modeBtn(page, "연습").click();
    await expect(page.getByTestId("mode-change-modal")).toHaveCount(0);
    await expect(page.locator('.segmented button[data-mode="practice"]')).toHaveAttribute("aria-pressed", "true");
  });

  test("채점 후에는 경고 없이 다른 모드로 전환된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await modeBtn(page, "연습").click();
    await expect(page.getByTestId("mode-change-modal")).toHaveCount(0);
    await expect(page.locator('.segmented button[data-mode="practice"]')).toHaveAttribute("aria-pressed", "true");
  });

  test("CSTS 시험 모드에서도 동일하게 경고 모달이 노출된다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await modeBtn(page, "연습").click();
    await expect(page.getByTestId("mode-change-modal")).toBeVisible();
    await page.getByTestId("mode-change-go").click();
    await expect(page.locator('.segmented button[data-mode="practice"]')).toHaveAttribute("aria-pressed", "true");
  });
});
