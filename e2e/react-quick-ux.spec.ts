import { test, expect, Page } from "@playwright/test";
import { openProduct } from "./helpers";

/** 퀵 진입 UI 계약 — 패널 위치, 진행 중 시작 버튼 숨김, 결과 모달의 오답노트 진입로 제거. */

async function openBar(page: Page) {
  if (!(await page.locator("#quickSize").isVisible())) await page.getByTestId("drawer-open").click();
}

async function startQuick(page: Page, product: "ISTQB" | "CSTS", size: string) {
  await openProduct(page, product);
  await openBar(page);
  await page.locator("#quickSize").selectOption(size);
  await page.getByTestId("quick-start-btn").click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
}

/** 유형을 가리지 않고 현재 문항에 답한다 — 퀵에는 서답형이 최대 30% 섞인다(B5).
 *  다답형은 모든 칸이 차야 '답함'으로 센다(isAnswered). */
async function answerCurrent(page: Page) {
  const short = page.locator(".short-answer-input");
  const blanks = await short.count();
  if (blanks) {
    for (let i = 0; i < blanks; i += 1) await short.nth(i).fill("테스트");
    return;
  }
  await page.locator("#options .option").first().click();
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

test("퀵 문항 수를 고르면 콤보박스가 그 값을 유지한다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");
  await openBar(page);

  const sel = page.locator("#quickSize");
  await expect(sel).toHaveValue("10");

  // 고른 값이 화면에 남아야 한다. controlled value가 스토어에 묶여 있으면
  // 다시 그릴 때 원래 값으로 튕겨, 사용자는 "골라도 안 바뀐다"를 본다.
  await sel.selectOption("20");
  await expect(sel, "고른 값이 유지되지 않고 되돌아갔다").toHaveValue("20");

  await sel.selectOption("15");
  await expect(sel).toHaveValue("15");

  // 고른 값이 실제 출제 수와도 일치해야 한다(표시만 맞고 출제가 다르면 더 나쁘다).
  await page.getByTestId("quick-start-btn").click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#progressText")).toContainText("/ 15");
});

test("퀵 진행 중 문항 수를 바꾸면 '새로 시작'이 나타나 그 수로 다시 뽑는다", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");
  await openBar(page);

  await page.locator("#quickSize").selectOption("10");
  await page.getByTestId("quick-start-btn").click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#progressText")).toContainText("/ 10");

  // 진행 중이고 값을 안 바꿨으면 시작 버튼은 없다(요청받은 동작).
  await openBar(page);
  await expect(page.getByTestId("quick-start-btn")).toHaveCount(0);

  // 값을 바꾸면 다시 나타난다 — 감춘 채로 두면 골라도 아무 일이 없다.
  await page.locator("#quickSize").selectOption("20");
  await expect(page.locator("#quickSize")).toHaveValue("20");
  const btn = page.getByTestId("quick-start-btn");
  await expect(btn, "값을 바꿨는데 적용할 버튼이 없다").toBeVisible();
  await expect(btn).toHaveText("새로 시작");
  await expect(page.locator(".quick-panel .action-hint")).toContainText("20문항");

  await btn.click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#progressText"), "새로 시작이 바뀐 문항 수를 쓰지 않았다").toContainText("/ 20");
});

/**
 * 퀵은 세트 개념이 없는 모드다(전 세트에서 뽑는다). 그런데 종전에는 풀이 중에도 세트
 * 콤보박스가 열려 있어 바꿀 수 있었고, 바꾸면 출제는 그대로인데 진행이 사라졌다:
 * 답안 키가 `${setId}-${mode}-${qid}`라 퀵의 센티넬(QUICK-quick-*)로 저장한 답을
 * 그 세트 기준으로 찾게 돼 도달할 수 없게 된다. 새로고침해도 복구되지 않는다.
 *
 * 그래서 두 가지를 함께 본다 — 잠기는가, 그리고 채점 후에 풀리는가.
 * 잠그기만 하고 안 풀면 채점 뒤에도 세트를 못 바꾸는 새 결함이 된다.
 */
test("퀵 풀이 중에는 문제 세트를 바꿀 수 없고, 채점 후에는 다시 바꿀 수 있다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await startQuick(page, "CSTS", "10");

  // 두 문항에 답해 진행을 만든다.
  for (let i = 0; i < 2; i += 1) {
    await answerCurrent(page);
    const n = page.locator("#nextBtn");
    if ((await n.count()) && !(await n.isDisabled())) await n.click();
  }
  await openBar(page);
  await expect(page.locator("#progressText")).toContainText("2 / 10");

  // 잠겨 있어야 한다 + 왜 잠겼는지 화면에 나와야 한다.
  await expect(page.locator("#examSelect"), "퀵 풀이 중인데 세트를 바꿀 수 있다").toBeDisabled();
  await expect(page.getByTestId("quick-set-lock-hint")).toBeVisible();

  // 채점하면 풀린다 — 잠그기만 하고 안 풀면 그것대로 결함이다.
  await page.getByTestId("grade-button").click();
  const c = page.getByTestId("confirm-grade");
  if (await c.count()) await c.click();
  await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();
  await openBar(page);
  await expect(page.locator("#examSelect"), "채점했는데도 세트가 잠겨 있다").toBeEnabled();
  await expect(page.getByTestId("quick-set-lock-hint")).toHaveCount(0);
});
