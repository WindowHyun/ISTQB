import { test, expect, Page } from "@playwright/test";
import { openProduct, enterQuick, quickStat, answerCurrent } from "./helpers";

/** 퀵 진입 UI 계약 — 패널 위치, 세트 컨트롤 부재, 헤더 점수판, 결과 모달의 오답노트 진입로 제거. */

async function openBar(page: Page) {
  if (!(await page.locator(".segmented").isVisible())) await page.getByTestId("drawer-open").click();
}

test("퀵 패널은 풀이 모드 아래에 있다(세트 계열 컨트롤을 가르지 않는다)", async ({ page }) => {
  await page.goto("/");
  await openProduct(page, "ISTQB");
  await openBar(page);

  // 퀵 밖: 세트 선택이 맨 위, 그 아래가 풀이 모드.
  const outside = await page.evaluate(() => {
    const y = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
    return { set: y("#examSelect"), segmented: y(".segmented") };
  });
  expect(outside.set).toBeGreaterThan(0);
  expect(outside.segmented, "풀이 모드가 세트 선택 바로 아래여야 한다").toBeGreaterThan(outside.set);

  // 퀵 안: 세트 선택은 아예 없고(퀵은 세트 개념이 없는 모드다), 퀵 패널이 모드 아래에 온다.
  await enterQuick(page);
  await openBar(page);
  const inside = await page.evaluate(() => {
    const y = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
    return { segmented: y(".segmented"), quick: y(".quick-panel") };
  });
  expect(inside.segmented).toBeGreaterThan(0);
  expect(inside.quick, "퀵 패널은 풀이 모드 아래여야 한다").toBeGreaterThan(inside.segmented);
});

/**
 * 퀵 패널의 버튼은 '진입'이 아니라 '재추첨'이다 — 패널 자체가 퀵 안에서만 렌더되므로
 * 여기 보인다는 것은 이미 회차가 돌고 있다는 뜻이다. 종전 계약("진행 중에는 시작 버튼이
 * 사라지고 채점하면 다시 나타난다")은 진입로가 이 버튼이던 시절의 것이다. 지금은 세그먼트가
 * 진입로라, 버튼을 감추면 회차를 다시 섞을 방법이 사라진다.
 */
test("퀵 패널의 버튼은 상시 '다시 섞어 시작'이고, 누르면 회차가 새로 뽑힌다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await enterQuick(page, "ISTQB");
  await openBar(page);

  const btn = page.getByTestId("quick-start-btn");
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText("다시 섞어 시작");
  await expect(page.locator(".quick-panel .action-hint")).toContainText("퀵 진행 중");

  // 두 문항을 풀어 진행을 만든다 — 재추첨이 이 진행을 실제로 버리는지 보기 위해서다.
  for (let i = 0; i < 2; i += 1) {
    await answerCurrent(page);
    await expect(quickStat(page, "solved")).toHaveText(String(i + 1));
    if (i === 0) await page.locator("#nextBtn").click();
  }

  await openBar(page);
  await btn.click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  // 새 회차이므로 집계는 0부터 — 남아 있으면 이전 회차의 답안이 딸려 온 것이다.
  await expect(quickStat(page, "solved"), "재추첨했는데 이전 회차 집계가 남아 있다").toHaveText("0");
});

test("퀵 채점 결과에는 오답노트 진입로가 없다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await enterQuick(page, "ISTQB");

  await answerCurrent(page);
  await openBar(page);
  await page.getByTestId("grade-button").click();
  const c = page.getByTestId("confirm-grade");
  if (await c.count()) await c.click();
  await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });

  // 퀵 오답은 출처 세트별로 흩어져 들어가, "방금 회차의 오답"을 기대하고 열면
  // 세트별 전 회차 합산이 뜬다 — 그래서 이 모드에서만 진입로를 뺀다.
  await expect(
    page.getByTestId("result-summary").getByRole("button", { name: "오답 노트 보기" }),
  ).toHaveCount(0);
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

/**
 * 퀵에는 진행률(#progressText)도 타이머도 없다 — 끝을 정해 놓지 않아 분모가 없고 회차가
 * 기록으로 남지도 않는다. 사이드바의 '진행 / 시간' 줄이 통째로 빠지는 이유다. 그 자리를
 * 아무것도 대신하지 않으면 지금 몇 개를 맞히고 있는지 알 방법이 화면에 없으므로, 문제
 * 헤더의 점수판이 그 값을 맡는다. 둘은 한 쌍이라 함께 본다 — 하나만 검사하면 "진행률은
 * 지웠는데 대신할 것도 없는" 상태가 통과한다.
 */
test("퀵에는 진행률 대신 헤더 점수판이 있고, 답할 때마다 갱신된다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await enterQuick(page, "CSTS");
  await openBar(page);

  await expect(page.locator("#progressText"), "퀵에 진행률이 남아 있다(분모가 없는 모드다)").toHaveCount(0);
  const board = page.locator(".quick-scoreboard");
  await expect(board).toBeVisible();
  await expect(board.locator(".qs-item")).toHaveCount(4);
  await expect(quickStat(page, "solved")).toHaveText("0");

  // 점수판은 헤더 카드 안에 있어야 한다 — 헤더와 문제 사이에 끼면 지문이 화면 아래로 밀린다.
  await expect(page.locator(".topbar .quick-scoreboard")).toHaveCount(1);

  // 답할 때마다 '진행'이 오르고, 정답·오답 둘 중 하나가 함께 오른다.
  for (let i = 0; i < 3; i += 1) {
    await answerCurrent(page);
    await expect(quickStat(page, "solved")).toHaveText(String(i + 1));
    const correct = Number(await quickStat(page, "correct").textContent());
    const wrong = Number(await quickStat(page, "wrong").textContent());
    expect(correct + wrong, "진행은 올랐는데 정답·오답 어디에도 안 잡혔다").toBe(i + 1);
    if (i < 2) await page.locator("#nextBtn").click();
  }
});

/**
 * 퀵은 세트 개념이 없는 모드다(제품의 전 세트에서 뽑는다). 종전에는 세트 콤보를 남겨 두고
 * disabled로만 막았는데, 그러면 "지금 이 세트를 풀고 있다"는 잘못된 읽기를 화면이 계속
 * 제공한다 — 퀵으로 들어오기 직전에 고른 세트 이름이 그대로 떠 있기 때문이다.
 *
 * 그래서 두 가지를 함께 본다 — 퀵 안에서 사라지는가, 그리고 나오면 **들어가기 직전 세트로**
 * 돌아오는가. 사라지게만 하고 복귀를 안 보면, 퀵을 잠깐 들른 대가로 풀던 세트를 잃는
 * 새 결함이 그대로 통과한다(퀵의 setId는 센티넬이라 사이드바가 첫 세트로 되돌린다).
 */
test("퀵에서는 세트 컨트롤이 사라지고, 나오면 들어가기 직전 세트로 돌아온다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "CSTS");
  await openBar(page);

  // 첫 세트가 아닌 세트를 고른다 — 첫 세트면 '돌아왔다'와 '첫 세트로 리셋됐다'를 못 가른다.
  const sel = page.locator("#examSelect");
  const values = await sel.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  const chosen = values[2];
  await sel.selectOption(chosen);
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

  await enterQuick(page);
  await openBar(page);
  await expect(sel, "퀵인데 세트 컨트롤이 남아 있다").toHaveCount(0);

  // 두 문항에 답해 진행을 만든 뒤에도 여전히 없어야 한다(채점 전후로 되살아나지 않는다).
  for (let i = 0; i < 2; i += 1) {
    await answerCurrent(page);
    await expect(quickStat(page, "solved")).toHaveText(String(i + 1));
    if (i === 0) await page.locator("#nextBtn").click();
  }
  await openBar(page);
  await page.getByTestId("grade-button").click();
  const c = page.getByTestId("confirm-grade");
  if (await c.count()) await c.click();
  await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();
  await openBar(page);
  await expect(sel, "채점했다고 퀵에 세트 컨트롤이 생겼다").toHaveCount(0);

  // 다른 모드로 나오면 컨트롤이 돌아오고, 값은 퀵에 들어가기 직전 세트여야 한다.
  await page.locator('.segmented button[data-mode="practice"]').click();
  await openBar(page);
  await expect(sel).toBeVisible();
  await expect(sel, "퀵을 들렀다고 풀던 세트를 잃었다").toHaveValue(chosen);
});

/**
 * 점수판은 '지금 보고 있는 위치'가 아니라 '푼 것'을 센다.
 *
 * 종전에는 현재 문항 인덱스까지만 세어, ‹ 로 앞 문항에 돌아가면 점수판이 뒤로 감겼다
 * (진행 3 → 1). 퀵에는 진행률이 없어 이 점수판이 유일한 진행 표시라 대조할 곳도 없다.
 * 게다가 채점 대상은 커서와 무관해서, 그 상태로 채점하면 화면은 "진행 1"인데 회차는
 * 3문항으로 기록됐다 — 화면과 기록이 갈리는 결함이다.
 *
 * 순수 계층은 quickStats.test.ts가 고정한다. 여기서는 실제 이동·채점으로 두 숫자가
 * 같은 것을 본다(팔레트의 '답함'까지 셋이 함께 움직여야 한다).
 */
test("퀵: 앞 문항으로 돌아가도 점수판이 되감기지 않고, 채점 범위와 일치한다", async ({ page }) => {
  await enterQuick(page, "ISTQB");

  for (let i = 0; i < 3; i += 1) {
    await answerCurrent(page);
    await expect(quickStat(page, "solved")).toHaveText(String(i + 1));
    if (i < 2) await page.locator("#nextBtn").click();
  }

  // 앞 문항으로 두 번 돌아간다 — 여기서 값이 줄면 종전 결함이다.
  await page.locator("#prevBtn").click();
  await page.locator("#prevBtn").click();
  await expect(
    quickStat(page, "solved"),
    "앞 문항으로 돌아갔더니 '진행'이 줄었다 — 점수판이 보고 있는 위치를 세고 있다",
  ).toHaveText("3");
  // 같은 화면의 팔레트 요약도 같은 값을 말해야 한다(두 카운터가 갈리지 않는다).
  await expect(page.locator(".palette-summary small")).toContainText("답함 3");

  // 되돌아온 그 자리에서 채점한다 — 기록도 3문항이어야 화면과 맞는다.
  await page.getByTestId("grade-button").click();
  const confirm = page.getByTestId("confirm-grade");
  await confirm.waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
  if (await confirm.count()) await confirm.click();
  await expect(
    page.getByTestId("result-summary"),
    "점수판이 말한 진행 수와 회차에 기록된 문항 수가 다르다",
  ).toContainText("/ 3문항");
});
