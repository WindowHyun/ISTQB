import { test, expect } from "@playwright/test";

// React 앱 채점 루프 E2E (#75/#76): ISTQB → 시험 모드 → 답 선택 → 채점 → 점수 표시.
test("React 앱: 시험 모드에서 답 선택 후 채점하면 점수가 표시된다", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto("/index.vite.html");
  await page.getByRole("button", { name: "ISTQB" }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

  // 시험(EXAM) 모드로 전환
  await page.getByRole("button", { name: "EXAM", exact: true }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

  // 첫 문항의 선택지 하나 선택
  await page.locator("#options .option").first().click();

  // 채점 → 점수 표시
  await page.getByTestId("grade-button").click();
  await expect(page.getByTestId("score")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("score")).toContainText("점수");

  expect(pageErrors, `page errors: ${pageErrors.join(" | ")}`).toEqual([]);
});
