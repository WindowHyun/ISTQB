import { test, expect, Page } from "@playwright/test";
import { openProduct } from "./helpers";

/**
 * 퀵 오답의 새 사양 — 회차 기록은 남기지 않고, 오답만 24시간 임시로 보여준다.
 * 세트 그룹과 섞이지 않아야 하고(세트를 다 푼 것이 아니므로), 통계 요약에도 안 잡혀야 한다.
 */

async function openBar(page: Page) {
  if (!(await page.locator(".segmented").isVisible())) await page.getByTestId("drawer-open").click();
}

/**
 * 퀵을 한 회차 풀고 채점한다. `count`는 '몇 문항을 풀 것인가'다 — 종전의 size(회차 크기)와
 * 다르다. 퀵은 문항 수를 고르지 않고 전 세트를 끝까지 내므로, 회차 크기는 데이터가 정하고
 * 검사가 정하는 것은 "몇 개까지 풀고 채점할 것인가"뿐이다.
 */
async function playQuick(page: Page, count: string) {
  await openBar(page);
  // 이미 퀵이면 재추첨 버튼으로, 아니면 세그먼트로 들어간다(회차마다 새로 섞기 위해).
  const inQuick = await page.getByTestId("quick-start-btn").count();
  if (inQuick) await page.getByTestId("quick-start-btn").click();
  else await page.locator('.segmented button[data-mode="quick"]').click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < Number(count); i += 1) {
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
  const dash = page.getByTestId("stats-dashboard");
  await expect(dash).toBeVisible();
  // 회차로는 어디에도 안 잡힌다 — 요약(응시 횟수)·타임라인·짧은 세션 목록 모두.
  await expect(page.locator(".stats-summary"), "퀵이 응시 횟수로 잡혔다").toHaveCount(0);
  await expect(page.getByTestId("stats-mini-rounds"), "퀵이 짧은 세션 목록에 남았다").toHaveCount(0);
  await expect(page.getByTestId("mini-round-item")).toHaveCount(0);
  // 그러나 챕터 분석에는 기여한다 — 여기까지 비면 퀵으로 공부한 것이 통째로 사라진다.
  // 10문항이면 챕터당 표본이 작아 '판단하기 이른 챕터' 쪽에 실릴 수 있으므로 둘 다 센다.
  const chapterRows = await page.locator(".sc-rate").count();
  expect(chapterRows, "퀵만 풀었더니 챕터 분석이 비었다").toBeGreaterThan(0);
});

test("이력 비우기는 퀵 오답 임시 목록까지 지운다", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");
  await playQuick(page, "10");

  await openBar(page);
  await page.getByTestId("stats-open").click();
  await expect(page.getByTestId("stats-dashboard")).toBeVisible();
  // 퀵만 있어도 비우기 진입로가 있어야 한다 — 없으면 지울 방법이 24시간 대기뿐이다.
  await page.getByRole("button", { name: "이력 비우기" }).click();
  await page.getByTestId("stats-clear-confirm").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("stats-dashboard")).toBeHidden();

  await openBar(page);
  await page.getByRole("button", { name: /오답 노트/ }).first().click();
  await expect(page.getByTestId("wrong-note")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("quick-wrong-note"), "비우기 후에도 퀵 오답이 남았다").toHaveCount(0);

  // 새로고침해도 되살아나지 않는다(localStorage 영속분까지 지워졌는가).
  await page.keyboard.press("Escape");
  await openProduct(page, "ISTQB");
  await openBar(page);
  await page.getByRole("button", { name: /오답 노트/ }).first().click();
  await expect(page.getByTestId("wrong-note")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("quick-wrong-note"), "새로고침하니 퀵 오답이 되살아났다").toHaveCount(0);
});
