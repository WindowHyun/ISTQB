import { test, expect } from "@playwright/test";
import { openProduct, openSet, modeBtn, submitGrade } from "./helpers";

// 신규 기능: 다크모드 토글 · 모달 Esc 닫기 · 세트 문항 수 · 결과 요약 · 학습 통계.
test.describe("신규 기능", () => {
  test("다크 모드 토글이 body[data-theme]에 반영된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    const dialog = page.getByRole("dialog", { name: "설정" });
    await dialog.getByRole("button", { name: "다크" }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.theme)).toBe("dark");
    await dialog.getByRole("button", { name: "라이트" }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.theme)).toBe("light");
  });

  test("Esc 키로 설정 모달이 닫힌다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    const dialog = page.getByRole("dialog", { name: "설정" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("세트 드롭다운에 문항 수가 표시된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await expect
      .poll(() => page.locator("#examSelect option").first().textContent())
      .toMatch(/문항/);
  });

  test("채점 시 결과 요약 모달이 자동으로 뜬다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    const result = page.getByTestId("result-summary");
    await expect(result).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId("result-rate")).toContainText("%");
    await result.getByRole("button", { name: "닫기" }).click();
    await expect(result).toHaveCount(0);
  });

  test("학습 통계에 채점 이력이 누적된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    // 자동으로 뜬 결과 요약 모달 닫기
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    // 학습 통계 모달 열기 → 이력 1건
    await page.getByTestId("stats-open").click();
    const stats = page.getByTestId("stats-dashboard");
    await expect(stats).toBeVisible({ timeout: 5_000 });
    await expect(stats.locator(".stats-list li")).toHaveCount(1);
  });

  test("미응답 상태로 채점하면 확인 모달이 뜨고 계속 풀기/채점을 고를 수 있다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click(); // 1문항만 응답
    await page.getByTestId("grade-button").click();
    const confirm = page.getByTestId("confirm-grade-modal");
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("39"); // 40 - 1 미응답
    // 계속 풀기 → 닫히고 채점되지 않음
    await page.getByRole("button", { name: "계속 풀기" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByTestId("result-summary")).toHaveCount(0);
    // 다시 채점 → 확인 → 결과
    await page.getByTestId("grade-button").click();
    await page.getByTestId("confirm-grade").click();
    await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 8_000 });
  });

  test("그림 클릭 라이트박스는 닫기 버튼에 포커스가 가고 Tab이 갇힌다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    // figure 문항(23번)으로 이동
    const nav = page.locator("#questionNav button");
    const n = await nav.count();
    for (let i = 0; i < n; i++) {
      if (((await nav.nth(i).textContent()) || "").trim() === "23") { await nav.nth(i).click(); break; }
    }
    await page.locator("#questionFigure img, #questionStem img").first().click();
    await expect(page.getByTestId("figure-lightbox")).toBeVisible();
    // 닫기 버튼에 포커스
    await expect(page.locator(".figure-lightbox-close")).toBeFocused();
    // Tab 눌러도 포커스가 모달 밖으로 나가지 않음
    await page.keyboard.press("Tab");
    await expect(page.locator(".figure-lightbox-close")).toBeFocused();
  });
});
