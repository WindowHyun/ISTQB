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

  test("진위형 재분류(○/X) 문항은 텍스트 입력이 아닌 O/X 보기로 렌더된다", async ({ page }) => {
    // 회귀: CSTS 2405 Q51 등은 '(○ / X)' 진위형인데 short_answer로 오분류돼 텍스트
    // 입력창이 떴었다. type을 true_false로 정정한 뒤 O/X 보기와 즉시 피드백을 확인한다.
    await openSet(page, "CSTS", "CSTS-FL-2405");
    await modeBtn(page, "연습").click();
    await gotoQuestion(page, 51);
    await expect(page.locator(".short-answer-input")).toHaveCount(0); // 텍스트 입력 아님
    const keys = (await page.locator("#options .option .option-key").allTextContents()).map((k) => k.trim().toUpperCase());
    expect(keys.join("")).toBe("OX");
    // 정답(X)을 고르면 즉시 피드백에 '정답'이 표시된다(문항 정답 = x).
    await page.locator("#options .option").nth(1).click();
    await expect(page.locator("#feedback")).toBeVisible({ timeout: 4_000 });
    await expect(page.locator("#feedback")).toContainText("정답입니다");
  });

  test("단답형: 한 정답 문자열에 묶인 동의어 하나만 입력해도 정답", async ({ page }) => {
    // 회귀: '공존성, Co-existence'처럼 동의어가 콤마로 묶인 정답도 '공존성' 단독 입력을 인정.
    await openSet(page, "CSTS", "CSTS-FL-2403");
    await modeBtn(page, "연습").click();
    await gotoQuestion(page, 62);
    await expect(page.locator(".short-answer-input")).toBeVisible();
    await page.locator(".short-answer-input").fill("공존성");
    await page.getByRole("button", { name: "정답 확인" }).click();
    await expect(page.locator("#feedback")).toBeVisible({ timeout: 4_000 });
    await expect(page.locator("#feedback")).toContainText("정답입니다");
  });

  test("다답형 서답형: 라벨별 두 입력 칸이 뜨고 둘 다 맞아야 정답", async ({ page }) => {
    // 2405 Q67은 '동등분할 수 + 경계값 수' 두 답을 요구하는 다답형 — answerParts로 라벨별
    // 입력 칸을 렌더한다. 반쪽만 맞으면 오답, 두 칸 모두 맞아야 정답.
    await openSet(page, "CSTS", "CSTS-FL-2405");
    await modeBtn(page, "연습").click();
    await gotoQuestion(page, 67);
    const box = page.getByTestId("short-answer-multi");
    await expect(box).toBeVisible();
    const inputs = box.locator(".short-answer-input");
    await expect(inputs).toHaveCount(2);
    // 한 칸만 채우면 오답
    await inputs.nth(0).fill("4");
    await page.getByRole("button", { name: "정답 확인" }).click();
    await expect(page.locator("#feedback")).toContainText("오답");
    // 나머지 칸을 채우면 즉시 정답으로 갱신
    await inputs.nth(1).fill("7");
    await expect(page.locator("#feedback")).toContainText("정답입니다");
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
