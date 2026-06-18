import { test, expect } from "@playwright/test";
import { openSet, openProduct, gotoQuestion } from "./helpers";

const figureImg = "#questionFigure img, #questionStem img";

// 엣지: 콘텐츠 렌더링·라이트박스·콘솔·토스트.
test.describe("엣지-콘텐츠", () => {
  test("그림 문항(Q23)의 figure 이미지가 로드된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 23);
    const img = page.locator(figureImg).first();
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  });

  test("그림 클릭 시 앱 내 라이트박스가 열린다(새 탭 아님)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 23);
    const before = page.context().pages().length;
    await page.locator(figureImg).first().click();
    await expect(page.getByTestId("figure-lightbox")).toBeVisible({ timeout: 5_000 });
    expect(page.context().pages().length).toBe(before);
  });

  test("라이트박스는 Esc로 닫힌다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 23);
    await page.locator(figureImg).first().click();
    await expect(page.getByTestId("figure-lightbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("figure-lightbox")).toHaveCount(0);
  });

  test("라이트박스는 ✕ 버튼으로 닫힌다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 23);
    await page.locator(figureImg).first().click();
    await page.locator(".figure-lightbox-close").click();
    await expect(page.getByTestId("figure-lightbox")).toHaveCount(0);
  });

  test("라이트박스는 배경 클릭으로 닫힌다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 23);
    await page.locator(figureImg).first().click();
    await page.getByTestId("figure-lightbox").click({ position: { x: 6, y: 6 } });
    await expect(page.getByTestId("figure-lightbox")).toHaveCount(0);
  });

  test("라이트박스가 열리면 body 스크롤이 잠기고 닫으면 복원된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 23);
    await page.locator(figureImg).first().click();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await page.keyboard.press("Escape");
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
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

  test("기본 상태에서는 화면 콘솔 버튼이 없다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("debug-fab")).toHaveCount(0);
  });

  test("?debug 진입 시 console.log가 콘솔에 캡처된다", async ({ page }) => {
    await page.goto("/?debug");
    await expect(page.getByTestId("debug-fab")).toBeVisible({ timeout: 8_000 });
    await page.evaluate(() => console.log("EDGE_LOG_MARK"));
    await page.getByTestId("debug-fab").click();
    await expect(page.getByTestId("debug-body")).toContainText("EDGE_LOG_MARK", { timeout: 4_000 });
  });

  test("?debug 진입 시 console.error도 캡처된다", async ({ page }) => {
    await page.goto("/?debug");
    await expect(page.getByTestId("debug-fab")).toBeVisible({ timeout: 8_000 });
    await page.evaluate(() => console.error("EDGE_ERR_MARK"));
    await page.getByTestId("debug-fab").click();
    await expect(page.getByTestId("debug-body")).toContainText("EDGE_ERR_MARK", { timeout: 4_000 });
  });

  test("콘솔 '비우기'로 로그가 지워진다", async ({ page }) => {
    await page.goto("/?debug");
    await page.evaluate(() => console.log("WILL_BE_CLEARED"));
    await page.getByTestId("debug-fab").click();
    await expect(page.getByTestId("debug-body")).toContainText("WILL_BE_CLEARED");
    await page.getByTestId("debug-clear").click();
    await expect(page.getByTestId("debug-body")).not.toContainText("WILL_BE_CLEARED");
  });

  test("잘못된 가져오기 토스트는 클릭하면 사라진다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{nope", "utf-8"),
    });
    const toast = page.getByTestId("toast");
    await expect(toast).toBeVisible({ timeout: 5_000 });
    await toast.click();
    await expect(toast).toHaveCount(0, { timeout: 3_000 });
  });
});
