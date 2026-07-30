import { test, expect, Page } from "@playwright/test";
import { openProduct } from "./helpers";

/**
 * 퀵 오답의 새 사양 — 회차 기록은 남기지 않고, 오답만 24시간 임시로 보여준다.
 * 세트 그룹과 섞이지 않아야 하고(세트를 다 푼 것이 아니므로), 통계 요약에도 안 잡혀야 한다.
 */

async function openBar(page: Page) {
  if (!(await page.locator("#quickSize").isVisible())) await page.getByTestId("drawer-open").click();
}

async function playQuick(page: Page, size: string) {
  await openBar(page);
  await page.locator("#quickSize").selectOption(size);
  await page.getByTestId("quick-start-btn").click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < Number(size); i += 1) {
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

test("퀵 오답은 별도 목록으로 보이고 세트 그룹과 섞이지 않는다", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");
  await playQuick(page, "10");

  await openBar(page);
  await page.getByRole("button", { name: /오답 노트/ }).first().click();
  await expect(page.getByTestId("wrong-note")).toBeVisible({ timeout: 20_000 });

  // 퀵 전용 목록이 있어야 한다 — 없으면 방금 틀린 것을 볼 방법이 없다.
  await expect(page.getByTestId("quick-wrong-note")).toBeVisible();
  expect(await page.getByTestId("quick-wrong-item").count()).toBeGreaterThan(0);
  await expect(page.getByTestId("quick-wrong-note")).toContainText("24시간");

  // 세트 그룹에는 들어가지 않는다(세트를 다 푼 기록이 아니다).
  expect(await page.getByTestId("wrong-note-set-btn").count(),
    "퀵 오답이 세트 그룹으로 새어 들어갔다").toBe(0);
});

test("퀵은 회차 기록을 남기지 않는다(이력·요약에 안 잡힘)", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");
  await playQuick(page, "10");

  // IndexedDB에 퀵 회차가 저장되면 안 된다.
  const stored = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("istqb-db", 1);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const all: { mode?: string }[] = await new Promise((res) => {
      const tx = db.transaction("history", "readonly");
      const q = tx.objectStore("history").getAll();
      q.onsuccess = () => res(q.result);
    });
    return all.map((h) => h.mode);
  });
  expect(stored, `퀵이 이력에 저장됐다: ${JSON.stringify(stored)}`).not.toContain("quick");

  await openBar(page);
  await page.getByTestId("stats-open").click();
  await expect(page.getByTestId("stats-dashboard")).toBeVisible();
  await expect(page.getByTestId("stats-dashboard"), "퀵이 회차 이력으로 표시됐다")
    .toContainText("아직 채점한 기록이 없습니다");
});
