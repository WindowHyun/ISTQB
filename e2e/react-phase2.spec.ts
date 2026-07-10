import { test, expect } from "@playwright/test";
import { enterExam, modeBtn, openSet, submitGrade } from "./helpers";

// Phase 2 — 학습 누적: 결과 모달의 "직전 회차 대비" 비교 + 학습 통계의 세트별 회차 타임라인.

test.describe("학습 누적 — 회차 비교·타임라인(Phase 2)", () => {
  test("첫 응시엔 '첫 응시', 재응시엔 회차·직전 대비가 결과 모달에 뜬다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");

    // 1회차 — 첫 응시 안내.
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    const compare = page.getByTestId("result-compare");
    await expect(compare).toBeVisible();
    await expect(compare).toContainText("1회차");
    await expect(compare).toContainText("첫 응시");
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    // 잠금 해제 후 재응시(채점된 시험 재진입 → 초기화) — 2회차.
    await modeBtn(page, "연습").click();
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(compare).toBeVisible();
    await expect(compare).toContainText("2회차");
    await expect(compare).toContainText("직전");
    await expect(page.getByTestId("result-delta")).toBeVisible();
  });

  test("학습 통계에 세트별 회차 타임라인이 누적된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");

    // 2회 응시해 회차를 쌓는다.
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await modeBtn(page, "연습").click();
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    // 학습 통계 열기 → 세트별 회차 타임라인에 2회차가 표시된다.
    await page.getByTestId("stats-open").click();
    const timeline = page.getByTestId("stats-set-timeline");
    await expect(timeline).toBeVisible();
    const item = page.getByTestId("set-timeline-item").first();
    await expect(item).toContainText("2회차");
    // 회차 칩(1회/2회)이 렌더된다.
    await expect(item.locator(".stl-rounds li")).toHaveCount(2);
  });
});
