import { test, expect } from "@playwright/test";

// 연습 모드 즉시 피드백 누수 회귀 테스트 (#79).
// Q1에서 답을 골라 피드백이 뜬 뒤 다음 문항으로 이동하면, 풀기 전 문항에는
// 피드백(정답/해설)이 노출되면 안 된다.
test("React 앱: 연습 모드 피드백이 다음 문항으로 누수되지 않는다", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto("/");
  await page.getByRole("button", { name: "ISTQB" }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

  // 기본(연습) 모드 보장
  await page.getByRole("button", { name: "연습", exact: true }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

  // Q1: 보기 하나 선택 → 피드백 패널 노출
  await page.locator("#options .option").first().click();
  await expect(page.locator("#feedback")).toBeVisible({ timeout: 10_000 });

  // 다음 문항(미응답)으로 이동 → 피드백이 남아 있으면 안 됨
  await page.getByRole("button", { name: "다음 문제" }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#feedback")).toHaveCount(0);

  expect(pageErrors, `page errors: ${pageErrors.join(" | ")}`).toEqual([]);
});
