import { test, expect } from "@playwright/test";
import { enterExam, gotoQuestion, modeBtn, openSet, submitGrade } from "./helpers";

// 풀이 모드(연습/시험/랜덤/오답) 상세 동작.
test.describe("모드", () => {
  test("연습: 복수정답 문항은 모두 선택해야 피드백이 뜬다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await gotoQuestion(page, 6); // 정답 2개 문항
    await expect(page.locator(".multi-answer-badge")).toBeVisible();
    const opts = page.locator("#options .option");
    await opts.nth(0).click();
    // 1개만 선택 → 아직 피드백 없음
    await expect(page.locator("#feedback")).toHaveCount(0);
    await opts.nth(1).click();
    // 2개(정답 개수)를 채우면 피드백 노출
    await expect(page.locator("#feedback")).toBeVisible({ timeout: 4_000 });
  });

  test("시험: 채점 후 보기 선택이 잠긴다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(page.getByTestId("score")).toBeVisible({ timeout: 8_000 });
    // 채점 후 옵션 버튼은 disabled
    await expect(page.locator("#options .option").first()).toBeDisabled();
  });

  test("시험: 채점 후 문제 번호 팔레트가 정답/오답 색을 띤다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(page.getByTestId("score")).toBeVisible({ timeout: 8_000 });
    const correct = await page.locator("#questionNav button.correct").count();
    const missed = await page.locator("#questionNav button.missed").count();
    expect(correct + missed).toBeGreaterThan(0);
  });

  test("랜덤: 채점하면 점수가 표시된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "랜덤").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(page.getByTestId("score")).toContainText("점수", { timeout: 8_000 });
  });

  test("오답 다시풀기: review 모드로 진입해 답을 다시 고를 수 있다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    // 먼저 시험 채점으로 오답을 만든다
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(page.getByTestId("score")).toBeVisible({ timeout: 8_000 });
    // 채점 시 자동으로 뜨는 결과 요약 모달을 닫는다.
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    // 오답 다시풀기
    await page.getByRole("button", { name: "오답 다시 풀기" }).click();
    await page.waitForTimeout(400);
    const opt = page.locator("#options .option").first();
    if (await opt.count()) {
      await opt.click();
      await expect(opt).toHaveClass(/selected/);
    } else {
      // 오답이 없으면 빈 화면(정상) — 크래시만 없으면 통과
      await expect(page.locator(".workspace")).toBeVisible();
    }
  });
  test("오답이 없으면 '오답 다시 풀기'가 모드를 유지하고 안내 토스트를 띄운다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-B"); // 채점 이력 없는 초기 상태(연습 모드)
    await page.getByRole("button", { name: "오답 다시 풀기" }).click();
    await expect(page.getByTestId("toast")).toContainText("오답이 없습니다");
    // 오답 모드로 이동하지 않고 연습 모드가 유지된다.
    await expect(page.locator('.segmented button[data-mode="practice"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#questionStem")).toBeVisible();
  });
});
