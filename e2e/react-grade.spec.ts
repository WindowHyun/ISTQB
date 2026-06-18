import { test, expect } from "@playwright/test";
import { submitGrade } from "./helpers";

// React 앱 채점 루프 E2E (#75/#76): ISTQB → 시험 모드 → 답 선택 → 채점 → 점수 표시.
test("React 앱: 시험 모드에서 답 선택 후 채점하면 점수가 표시된다", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto("/");
  await page.getByRole("button", { name: "ISTQB" }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

  // 시험 모드로 전환
  await page.getByRole("button", { name: "시험", exact: true }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

  // 첫 문항의 선택지 하나 선택
  await page.locator("#options .option").first().click();

  // 채점 → 점수 표시 (채점 버튼·점수는 사이드바)
  await submitGrade(page);
  await expect(page.getByTestId("score")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("score")).toContainText("점수");

  // 채점 시 자동으로 뜨는 결과 요약 모달을 닫는다.
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

  // 오답노트 모달 열기 → 내용 표시 (미응답 문항 다수 → 오답 존재)
  await page.getByRole("button", { name: "오답 노트" }).click();
  await expect(page.getByTestId("wrong-note")).toBeVisible({ timeout: 10_000 });

  expect(pageErrors, `page errors: ${pageErrors.join(" | ")}`).toEqual([]);
});
