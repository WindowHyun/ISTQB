import { test, expect, Page } from "@playwright/test";
import { openProduct } from "./helpers";

/**
 * '이력 비우기'가 남기던 유령 상태 회귀 가드.
 *
 * 종전에는 이력(IndexedDB)만 지우고 답안·채점 상태·오답 대상(reviewIds)을 남겼다.
 * 그래서 초기화 직후 오답노트는 비는데, 오답 모드에 들어가면 삭제한 회차의 오답이
 * 그대로 출제되고("0 / 38"), 그 세트를 다시 채점하면 같은 기록이 되살아났다.
 * 사용자에게는 "초기화했는데 이전 기록이 재생성된다"로 보인다.
 */

async function openBar(page: Page) {
  if (!(await page.getByTestId("quick-start-btn").isVisible())) await page.getByTestId("drawer-open").click();
}

async function examAndGrade(page: Page, answers: number) {
  await openBar(page);
  await page.locator('.segmented button[data-mode="exam"]').click();
  const fresh = page.getByTestId("graded-resume-fresh");
  if (await fresh.count()) await fresh.click();
  const gate = page.getByTestId("exam-start-btn");
  if (await gate.count()) await gate.click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < answers; i += 1) {
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
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();
}

test("이력 비우기 후에는 삭제한 회차의 오답이 오답 모드에 남지 않는다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");

  await examAndGrade(page, 10);

  // 초기화 전에는 오답 모드에 출제 대상이 있어야 한다 — 없으면 이 검사가 무력해진다.
  await openBar(page);
  await page.locator('.segmented button[data-mode="review"]').click();
  await page.waitForTimeout(500);
  const beforeTotal = Number((await page.locator("#progressText").textContent() ?? "").match(/\/\s*(\d+)/)?.[1] ?? 0);
  expect(beforeTotal, "초기화 전 오답 대상이 0이면 검사가 무력하다").toBeGreaterThan(0);

  // 이력 비우기
  await openBar(page);
  await page.getByTestId("stats-open").click();
  await expect(page.getByTestId("stats-dashboard")).toBeVisible();
  await page.getByRole("button", { name: "이력 비우기" }).click();
  await page.getByTestId("stats-clear-confirm").click();
  await page.waitForTimeout(1200);
  await page.keyboard.press("Escape");

  // 1) 저장된 상태에 오답 대상이 남지 않았다.
  const leftover = await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (!k.endsWith("-ui-state")) continue;
      const ui = JSON.parse(localStorage.getItem(k) || "{}");
      return {
        reviewIds: Object.values(ui.reviewIds ?? {}).reduce((n: number, v) => n + (v as string[]).length, 0),
        reviewedOk: Object.keys(ui.reviewedOk ?? {}).length,
      };
    }
    return { reviewIds: -1, reviewedOk: -1 };
  });
  expect(leftover.reviewIds, "삭제한 회차의 오답 대상이 남아 있다").toBe(0);

  // 2) 오답 모드에 들어가도 삭제한 오답이 출제되지 않는다.
  await openBar(page);
  await page.locator('.segmented button[data-mode="review"]').click();
  await page.waitForTimeout(500);
  const afterTotal = Number((await page.locator("#progressText").textContent() ?? "").match(/\/\s*(\d+)/)?.[1] ?? 0);
  expect(afterTotal, `초기화 후에도 오답 ${afterTotal}문항이 출제된다`).toBe(0);

  // 3) 오답노트도 비어 있다(두 화면이 같은 사실을 말해야 한다).
  await openBar(page);
  await page.getByRole("button", { name: /오답 노트/ }).first().click();
  await expect(page.getByTestId("wrong-note")).toBeVisible();
  expect(await page.getByTestId("wrong-note-set-btn").count()).toBe(0);
});

/**
 * 회차 **1건** 삭제도 같은 유령을 남기던 결함의 회귀 가드.
 *
 * 위의 '이력 비우기'는 막혀 있었지만, 통계 대시보드의 회차 삭제(round-delete-btn)는
 * 이력만 지우고 오답 대상(reviewIds)을 그대로 뒀다. 오답 '노트'는 histories에서,
 * 오답 '모드'는 reviewIds에서 만들기 때문에 두 화면이 서로 다른 말을 했다 —
 * 노트에서는 사라진 오답이 오답 모드에는 계속 출제된다.
 */
test("회차 1건을 지워도 그 오답이 오답 모드에 남지 않는다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");

  await examAndGrade(page, 10);

  await openBar(page);
  await page.locator('.segmented button[data-mode="review"]').click();
  await page.waitForTimeout(500);
  const before = Number((await page.locator("#progressText").textContent() ?? "").match(/\/\s*(\d+)/)?.[1] ?? 0);
  expect(before, "삭제 전 오답 대상이 0이면 검사가 무력하다").toBeGreaterThan(0);

  // 통계에서 방금 만든 회차 1건을 지운다(이력 비우기가 아니라 단건 삭제).
  await openBar(page);
  await page.getByTestId("stats-open").click();
  await expect(page.getByTestId("stats-dashboard")).toBeVisible();
  const del = page.getByTestId("round-delete-btn").first();
  await expect(del).toBeVisible();
  // 회차 단건 삭제에는 확인 단계가 없다(이력 비우기와 달리 즉시 실행) — 확인 클릭을
  // 넣어 두면 존재하지 않는 요소를 기다리는 죽은 분기가 된다.
  await del.click();
  await page.waitForTimeout(1200);
  await page.keyboard.press("Escape");

  // 삭제한 회차의 오답이 오답 모드에 출제되면 안 된다.
  await openBar(page);
  await page.locator('.segmented button[data-mode="review"]').click();
  await page.waitForTimeout(500);
  const after = Number((await page.locator("#progressText").textContent() ?? "").match(/\/\s*(\d+)/)?.[1] ?? 0);
  expect(after, `회차를 지웠는데 오답 ${after}문항이 그대로 출제된다`).toBe(0);
});
