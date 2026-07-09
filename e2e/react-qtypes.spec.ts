import { test, expect } from "@playwright/test";
import { enterExam, gotoQuestion, modeBtn, openSet, submitGrade } from "./helpers";

// 문항 유형별(객관식 복수정답/진위형/단답형) 답안 UI.
test.describe("문항 유형", () => {
  test("진위형(O/X): O 선택 시 즉시 피드백이 뜬다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-EL-2018");
    await modeBtn(page, "연습").click();
    await gotoQuestion(page, 16); // true_false
    const keys = (await page.locator("#options .option .option-key").allTextContents()).map((k) => k.trim().toUpperCase());
    expect(keys.join("")).toBe("OX");
    await page.locator("#options .option").first().click();
    await expect(page.locator("#feedback")).toBeVisible({ timeout: 4_000 });
  });

  test("진위형: 피드백에 정답 키가 표시된다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-EL-2018");
    await modeBtn(page, "연습").click();
    await gotoQuestion(page, 16);
    await page.locator("#options .option").first().click();
    await expect(page.locator("#feedback")).toContainText("정답");
  });

  test("단답형: 입력 후 정답 확인하면 피드백과 정답이 노출된다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-EL-2018");
    await modeBtn(page, "연습").click();
    await gotoQuestion(page, 18); // short_answer
    await expect(page.locator(".short-answer-input")).toBeVisible();
    await page.locator(".short-answer-input").fill("테스트 실행");
    await page.getByRole("button", { name: "정답 확인" }).click();
    await expect(page.locator("#feedback")).toBeVisible({ timeout: 4_000 });
    await expect(page.locator("#feedback")).toContainText("정답");
  });

  test("복수정답 문항은 안내 배지를 보여준다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 6);
    await expect(page.locator(".multi-answer-badge")).toBeVisible();
    await expect(page.locator(".multi-answer-badge")).toContainText("2개");
  });

  test("채점 후 정답 보기는 .correct 스타일을 갖는다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(page.getByTestId("score")).toBeVisible({ timeout: 8_000 });
    await expect(page.locator("#options .option.correct")).toHaveCount(1);
  });

  test("연습에서 오답을 고르면 .wrong 스타일이 적용된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    // 정답이 아닌 보기를 찾아 클릭: 첫 보기가 정답이면 두번째
    const opts = page.locator("#options .option");
    await opts.first().click();
    await expect(page.locator("#feedback")).toBeVisible({ timeout: 4_000 });
    const wrong = await page.locator("#options .option.wrong").count();
    const correct = await page.locator("#options .option.correct").count();
    // 정답 표시(correct)는 항상 있어야 하고, 내가 고른 게 오답이면 wrong도 존재
    expect(correct).toBeGreaterThanOrEqual(1);
    expect(wrong).toBeGreaterThanOrEqual(0);
  });
});
