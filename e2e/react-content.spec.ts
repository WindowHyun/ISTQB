import { test, expect } from "@playwright/test";
import { openSet, modeBtn, gotoQuestion } from "./helpers";

// 콘텐츠 렌더링(그림/표/목록/진행률/해설) + 무결성.
test.describe("콘텐츠 렌더링", () => {
  test("그림 문항: figure 이미지가 로드된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 23); // 상태 전이 다이어그램
    const img = page.locator("#questionFigure img, #questionStem img").first();
    await expect(img).toBeVisible();
    const ok = await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0);
    expect(ok).toBe(true);
  });

  test("보기의 마크다운 표가 HTML <table>로 렌더된다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2404");
    await gotoQuestion(page, 33);
    expect(await page.locator("#options .data-table").count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator("#options")).not.toContainText("|---|");
  });

  test("가/나/다/라 항목이 모두 렌더된다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-EL-2018");
    await gotoQuestion(page, 10);
    const stem = (await page.locator("#questionStem").textContent()) || "";
    for (const m of ["가.", "나.", "다.", "라."]) expect(stem).toContain(m);
  });

  test("세트를 바꾸면 첫 문항(1번)으로 초기화된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 5);
    await page.locator("#examSelect").selectOption("ISTQB-FL-V4-C");
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#questionNav button.current")).toHaveText("1");
  });

  test("답을 고르면 진행률 텍스트와 막대가 갱신된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await expect(page.locator("#progressText")).toContainText("0 /");
    await page.locator("#options .option").first().click();
    await expect(page.locator("#progressText")).not.toContainText("0 /");
    const w = await page.locator("#progressFill").evaluate((el) => (el as HTMLElement).style.width);
    expect(w).not.toBe("0%");
  });

  test("연습 모드 피드백에 해설(explanation)이 표시된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await page.locator("#options .option").first().click();
    await expect(page.locator("#feedback .feedback-body")).toBeVisible({ timeout: 4_000 });
    expect(((await page.locator("#feedback .feedback-body").textContent()) || "").trim().length).toBeGreaterThan(0);
  });

  test("타이머가 1초 단위로 증가한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    const t1 = await page.locator("#timerText").textContent();
    await page.waitForTimeout(2_100);
    const t2 = await page.locator("#timerText").textContent();
    expect(t2).not.toBe(t1);
  });
});
