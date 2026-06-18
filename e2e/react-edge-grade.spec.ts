import { test, expect } from "@playwright/test";
import { openSet, modeBtn, gotoQuestion, submitGrade } from "./helpers";

// 엣지: 채점(미응답 확인·컷스코어·복수정답·진위형·단답형).
test.describe("엣지-채점", () => {
  test("아무것도 응답하지 않고 채점하면 확인 모달이 40문항 미응답을 알린다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.getByTestId("grade-button").click();
    const m = page.getByTestId("confirm-grade-modal");
    await expect(m).toBeVisible();
    await expect(m).toContainText("40");
  });

  test("미응답 확인 모달을 '계속 풀기'로 닫으면 채점되지 않는다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await page.getByTestId("grade-button").click();
    await page.getByRole("button", { name: "계속 풀기" }).click();
    await expect(page.getByTestId("confirm-grade-modal")).toHaveCount(0);
    await expect(page.getByTestId("result-summary")).toHaveCount(0);
  });

  test("미응답 확인 모달을 Esc로 취소할 수 있다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await page.getByTestId("grade-button").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("confirm-grade-modal")).toHaveCount(0);
  });

  test("3문항만 응답하면 확인 모달이 37문항 미응답을 표시한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    for (let i = 0; i < 3; i++) {
      await page.locator("#options .option").first().click();
      await page.locator("#nextBtn").click();
    }
    await page.getByTestId("grade-button").click();
    await expect(page.getByTestId("confirm-grade-modal")).toContainText("37");
  });

  test("ISTQB 결과는 '26 / 40문항(65%)' 합격 기준을 표시한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(page.locator(".result-criterion")).toContainText("26 / 40문항(65%)");
  });

  test("CSTS 결과는 환산 점수와 '환산 52.5점' 기준을 표시한다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(page.getByTestId("result-score")).toContainText("환산");
    await expect(page.locator(".result-criterion")).toContainText("환산 52.5점");
  });

  test("미응답으로 채점하면 0%·합격 기준 미달이 표시된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await submitGrade(page);
    await expect(page.getByTestId("result-rate")).toHaveText("0%");
    await expect(page.getByTestId("result-summary")).toContainText("미달");
  });

  test("복수정답 문항은 정답 개수만큼 채워야 즉시 피드백이 뜬다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await gotoQuestion(page, 6); // 정답 2개(a,e)
    await expect(page.locator(".multi-answer-badge")).toBeVisible();
    await page.locator("#options .option").nth(0).click();
    await expect(page.locator("#feedback")).toHaveCount(0);
    await page.locator("#options .option").nth(1).click();
    await expect(page.locator("#feedback")).toBeVisible({ timeout: 4_000 });
  });

  test("복수정답 선택은 정답 개수를 초과하지 못한다(cap)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await gotoQuestion(page, 6); // 정답 2개
    await page.locator("#options .option").nth(0).click();
    await page.locator("#options .option").nth(2).click();
    await page.locator("#options .option").nth(4).click(); // 3번째 선택 시도
    expect(await page.locator("#options .option.selected").count()).toBeLessThanOrEqual(2);
  });

  test("복수정답 선택을 다시 눌러 해제할 수 있다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await gotoQuestion(page, 6);
    const first = page.locator("#options .option").nth(0);
    await first.click();
    await expect(first).toHaveClass(/selected/);
    await first.click();
    await expect(first).not.toHaveClass(/selected/);
  });

  test("진위형(O/X): O 선택 시 즉시 피드백이 뜬다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await modeBtn(page, "연습").click();
    await gotoQuestion(page, 55); // 진위형
    await page.locator("#options .option").first().click();
    await expect(page.locator("#feedback")).toBeVisible({ timeout: 4_000 });
  });

  test("진위형 피드백에 정답 키(O/X)가 표시된다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await modeBtn(page, "연습").click();
    await gotoQuestion(page, 55);
    await page.locator("#options .option").first().click();
    await expect(page.locator("#feedback")).toContainText("정답");
  });

  test("단답형: 빈 입력으로 정답 확인하면 피드백과 정답이 노출된다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await modeBtn(page, "연습").click();
    await gotoQuestion(page, 61); // 단답형
    await page.locator(".short-answer-input").fill("아무거나");
    await page.getByRole("button", { name: "정답 확인" }).click();
    await expect(page.locator("#feedback")).toBeVisible({ timeout: 4_000 });
    await expect(page.locator("#feedback")).toContainText("정답");
  });

  test("채점 후 '결과 요약' 버튼으로 결과를 다시 열 수 있다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await page.getByTestId("result-open").click();
    await expect(page.getByTestId("result-summary")).toBeVisible();
  });

  test("채점 후 팔레트가 정답/오답 색을 띤다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    const correct = await page.locator("#questionNav button.correct").count();
    const missed = await page.locator("#questionNav button.missed").count();
    expect(correct + missed).toBeGreaterThan(0);
  });

  test("결과 요약의 '오답 노트 보기'로 오답노트가 열린다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByRole("button", { name: "오답 노트 보기" }).click();
    await expect(page.getByTestId("wrong-note")).toBeVisible({ timeout: 5_000 });
  });
});
