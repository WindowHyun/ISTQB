import { test, expect } from "@playwright/test";
import { openSet, gotoQuestion } from "./helpers";

const figureImg = "#questionFigure img, #questionStem img";

async function expectFigureLoaded(page: import("@playwright/test").Page) {
  const img = page.locator(figureImg).first();
  await expect(img).toBeVisible({ timeout: 10_000 });
  expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
}

// 엣지: 특정 표/그림 문항 렌더링.
test.describe("엣지-표/그림", () => {
  test("ISTQB-A Q23(상태도) 그림이 로드된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 23);
    await expectFigureLoaded(page);
  });

  test("ISTQB-B Q38 그림이 로드된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-B");
    await gotoQuestion(page, 38);
    await expectFigureLoaded(page);
  });

  test("ISTQB-C Q31 그림이 로드된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-C");
    await gotoQuestion(page, 31);
    await expectFigureLoaded(page);
  });

  test("CSTS-2402 Q9 그림이 로드된다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await gotoQuestion(page, 9);
    await expectFigureLoaded(page);
  });

  test("CSTS-2402 Q70(마지막 문항) 그림이 로드된다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await gotoQuestion(page, 70);
    await expectFigureLoaded(page);
  });

  test("CSTS-2404 Q23 그림이 로드된다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2404");
    await gotoQuestion(page, 23);
    await expectFigureLoaded(page);
  });

  test("CSTS-EL-2019 Q31 그림이 로드된다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-EL-2019");
    await gotoQuestion(page, 31);
    await expectFigureLoaded(page);
  });

  test("CSTS-EL-2018 Q15 그림이 로드된다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-EL-2018");
    await gotoQuestion(page, 15);
    await expectFigureLoaded(page);
  });

  test("SW예제 Q7 그림이 로드된다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-EL-SW-EXAMPLE");
    await gotoQuestion(page, 7);
    await expectFigureLoaded(page);
  });

  test("그림 문항에서 클릭 시 라이트박스가 열린다(CSTS)", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await gotoQuestion(page, 9);
    await page.locator(figureImg).first().click();
    await expect(page.getByTestId("figure-lightbox")).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("figure-lightbox")).toHaveCount(0);
  });

  test("EXTRA Q4의 stem 표가 HTML <table>로 렌더된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-EXTRA");
    await expect.poll(() => page.locator("#questionNav button").count()).toBe(26);
    await gotoQuestion(page, 4);
    expect(await page.locator("#questionStem .data-table").count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator("#questionStem")).not.toContainText("|---|");
  });

  test("CSTS-2404 Q33의 보기 표가 HTML <table>로 렌더되고 마크다운이 누수되지 않는다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2404");
    await gotoQuestion(page, 33);
    expect(await page.locator("#options .data-table").count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator("#options")).not.toContainText("|---|");
  });

  test("SW예제 Q33의 보기 표가 HTML <table>로 렌더된다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-EL-SW-EXAMPLE");
    await gotoQuestion(page, 33);
    expect(await page.locator("#options .data-table").count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator("#options")).not.toContainText("|---|");
  });

  // 좁은 화면에서 표가 폭을 넘으면 가로 스크롤로 볼 수 있지만, 모바일 오버레이
  // 스크롤바는 손대기 전엔 보이지 않는다 — 잘린 표가 '원래 저기까지'로 읽혀
  // 결정표 문항(규칙 개수가 곧 답)을 부분 정보로 풀게 된다. 넘칠 때만 안내를 켜고,
  // 키보드로도 스크롤할 수 있도록 포커스를 받게 한다.
  test("좁은 화면에서 넘치는 표에만 스크롤 안내와 키보드 포커스가 붙는다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 22);
    await page.setViewportSize({ width: 390, height: 844 });

    const scroller = page.locator("#questionStem .data-table-scroll").first();
    await expect(scroller).toHaveClass(/has-overflow/);
    await expect(scroller.locator(".data-table-hint")).toBeVisible();
    await expect(scroller.locator(".data-table-wrap")).toHaveAttribute("tabindex", "0");

    // 넓은 화면으로 되돌리면 넘치지 않으므로 안내도 탭 순서도 사라져야 한다
    // (안 넘치는 표까지 안내를 달면 거짓 경고가 되고 탭 이동만 늘어난다).
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(scroller).not.toHaveClass(/has-overflow/);
    await expect(scroller.locator(".data-table-hint")).toBeHidden();
    await expect(scroller.locator(".data-table-wrap")).not.toHaveAttribute("tabindex", "0");
  });
});
