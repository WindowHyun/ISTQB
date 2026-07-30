import { test, expect, Page } from "@playwright/test";
import { openProduct } from "./helpers";

/** 퀵 진입 UI 계약 — 패널 위치, 진행 중 시작 버튼 숨김, 결과 모달의 오답노트 진입로 제거. */

async function openBar(page: Page) {
  if (!(await page.locator("#quickSize").isVisible())) await page.getByTestId("drawer-open").click();
}

test("퀵 패널은 풀이 모드 아래에 있다(세트 계열 컨트롤을 가르지 않는다)", async ({ page }) => {
  await page.goto("/");
  await openProduct(page, "ISTQB");
  await openBar(page);
  const order = await page.evaluate(() => {
    const y = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
    return { set: y("#examSelect"), segmented: y(".segmented"), quick: y("#quickSize") };
  });
  expect(order.set).toBeGreaterThan(0);
  expect(order.segmented, "풀이 모드가 세트 선택 바로 아래여야 한다").toBeGreaterThan(order.set);
  expect(order.quick, "퀵은 풀이 모드 아래여야 한다").toBeGreaterThan(order.segmented);
});

test("퀵 진행 중에는 시작 버튼이 사라지고, 채점하면 다시 나타난다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");
  await openBar(page);

  await expect(page.getByTestId("quick-start-btn")).toBeVisible();
  await page.locator("#quickSize").selectOption("10");
  await page.getByTestId("quick-start-btn").click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

  // 진행 중: 남겨 두면 그 자리에서 눌러 진행 중인 답안이 경고 없이 버려진다.
  await openBar(page);
  await expect(page.getByTestId("quick-start-btn")).toHaveCount(0);
  await expect(page.locator(".quick-panel .action-hint")).toContainText("퀵 진행 중");

  for (let i = 0; i < 10; i += 1) {
    const o = page.locator("#options .option").first();
    if (await o.count()) await o.click();
    const n = page.locator("#nextBtn");
    if ((await n.count()) && !(await n.isDisabled())) await n.click();
  }
  await openBar(page);
  await page.getByTestId("grade-button").click();
  const c = page.getByTestId("confirm-grade");
  if (await c.count()) await c.click();
  await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });

  // 채점 결과에는 오답노트 진입로를 두지 않는다 — 퀵 오답은 출처 세트별로 흩어져 들어가
  // "방금 회차의 오답"을 기대하고 열면 세트별 전 회차 합산이 뜬다.
  await expect(page.getByTestId("result-summary").getByRole("button", { name: "오답 노트 보기" })).toHaveCount(0);
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();

  // 채점 후에는 다음 회차로 갈 수 있도록 다시 나타난다.
  await openBar(page);
  await expect(page.getByTestId("quick-start-btn")).toBeVisible();
});

test("시험·랜덤 결과에는 오답노트 버튼이 그대로 있다(퀵만 예외)", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");
  await openBar(page);
  await page.locator('.segmented button[data-mode="exam"]').click();
  const gate = page.getByTestId("exam-start-btn");
  if (await gate.count()) await gate.click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await page.locator("#options .option").first().click();
  await openBar(page);
  await page.getByTestId("grade-button").click();
  const c = page.getByTestId("confirm-grade");
  if (await c.count()) await c.click();
  await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("result-summary").getByRole("button", { name: "오답 노트 보기" })).toBeVisible();
});
