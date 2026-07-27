import { test, expect, Page } from "@playwright/test";
import { enterExam, openSet } from "./helpers";

// 남은 시간(#timerText)을 초로 읽는다 — "59:58" 또는 "1:00:00" 양쪽 표기를 다룬다.
async function remainingSeconds(page: Page): Promise<number> {
  const parts = (await page.locator("#timerText").innerText()).match(/\d+/g)?.map(Number) ?? [];
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}

// 저장된 '응시 시작 시각'을 과거로 밀어 앱이 꺼져 있던 시간을 흉내낸다.
async function rewindExamStart(page: Page, minutes: number) {
  await page.evaluate((min: number) => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes("examStartedAt")) continue;
      const o = JSON.parse(raw);
      const target = o.examStartedAt ? o : o.uiState;
      if (!target?.examStartedAt) continue;
      for (const id of Object.keys(target.examStartedAt)) target.examStartedAt[id] -= min * 60 * 1000;
      localStorage.setItem(k, JSON.stringify(o));
    }
  }, minutes);
}

// 시험 제한시간은 '응시 시작 벽시계'가 기준이어야 한다. 경과 누계만 쓰면 앱을 껐다 켠
// 시간이 빠져 60/90분 제한을 닫았다 열기만으로 무한히 늘릴 수 있었다.
test.describe("시험 제한시간", () => {
  test("앱이 꺼져 있던 시간도 제한시간에서 차감된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click(); // 응시 개시 흔적(복원 조건)
    const before = await remainingSeconds(page);
    expect(before).toBeGreaterThan(3500); // ISTQB 60분

    // 게이트로 빠져나가 저장을 확정시킨 뒤 조작한다 — 응시 중에 직접 건드리면
    // 언마운트 시 flushPersist가 메모리의 원래 값으로 덮어쓴다.
    await page.goto("/");
    await rewindExamStart(page, 20);

    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

    const after = await remainingSeconds(page);
    expect(after).toBeLessThan(before - 19 * 60); // 꺼져 있던 20분이 빠져야 한다
    expect(after).toBeGreaterThan(0);
  });

  test("꺼져 있는 사이 제한시간이 끝났으면 복귀 즉시 자동 제출된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();

    await page.goto("/");
    await rewindExamStart(page, 61); // 60분 제한을 넘긴 상태로 복귀

    await page.getByRole("button", { name: "ISTQB" }).click();
    // 자동 제출 → 결과 모달. 종전에는 시계가 멈춰 있어 그대로 계속 풀 수 있었다.
    await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });
  });
});
