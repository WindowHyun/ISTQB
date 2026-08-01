import { test, expect } from "@playwright/test";
import { enterExam, gotoQuestion, openSet, submitGrade } from "./helpers";

// 엣지 케이스(빈 오답/마지막 문항/제품 전환/연속 조작 등) — 크래시 없이 견고한지.
test.describe("엣지 케이스", () => {
  test("채점 전 오답 다시풀기는 빈 화면을 보이되 크래시하지 않는다", async ({ page }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.getByRole("button", { name: "오답 다시 풀기" }).click();
    await page.waitForTimeout(400);
    await expect(page.locator(".workspace")).toBeVisible();
    expect(errs).toEqual([]);
  });

  test("마지막 문항에서도 채점이 동작한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    const total = await page.locator("#questionNav button").count();
    await gotoQuestion(page, total);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(page.getByTestId("score")).toContainText("점수", { timeout: 8_000 });
  });

  test("풀이 중 제품(ISTQB→CSTS) 전환 시 새 제품이 로드된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.locator("#options .option").first().click();
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("button", { name: /처음 화면/ }).click();
    await page.getByRole("button", { name: "CSTS" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#examSelect")).toHaveValue(/^CSTS/);
  });

  test("모드 전환 시 현재 문항이 1번으로 초기화된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 5);
    await enterExam(page);
    await expect(page.locator("#questionNav button.current")).toHaveText("1");
  });

  test("다음 버튼을 빠르게 연속 클릭해도 마지막에서 멈춘다(크래시 없음)", async ({ page }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    for (let i = 0; i < 60; i++) {
      if (await page.locator("#nextBtn").isDisabled()) break;
      await page.locator("#nextBtn").click();
    }
    await expect(page.locator("#nextBtn")).toBeDisabled();
    expect(errs).toEqual([]);
  });

  test("복수정답: 선택한 보기를 다시 누르면 선택이 해제된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 6); // 2개 정답
    const opt = page.locator("#options .option").first();
    await opt.click();
    await expect(opt).toHaveClass(/selected/);
    await opt.click();
    await expect(opt).not.toHaveClass(/selected/);
  });

  test("복수정답: 정답 개수를 초과해 선택할 수 없다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 6); // 정답 2개
    const opts = page.locator("#options .option");
    const n = await opts.count();
    for (let i = 0; i < n; i++) await opts.nth(i).click();
    // 정확히 2개여야 한다. 상한만 보면(<=2) 클릭이 하나도 먹지 않아 0개일 때도 통과해,
    // "상한이 동작한다"가 아니라 "아무 일도 안 일어났다"를 합격으로 읽는다.
    expect(await page.locator("#options .option.selected").count(),
      "보기를 모두 눌렀는데 선택이 2개가 아니다(0이면 클릭 자체가 안 먹은 것)").toBe(2);
  });
});
