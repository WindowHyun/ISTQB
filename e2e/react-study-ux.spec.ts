import { test, expect } from "@playwright/test";
import { openProduct, openSet, modeBtn, gotoQuestion, submitGrade } from "./helpers";

// 학습 UX 개선: 이어풀기 배너(A) · 제출 전 검토(E) · 오답 해설(F) · 피드백 aria-live(I).

test.describe("학습 UX — 이어풀기 배너(A)", () => {
  test("중간 위치에서 복원되면 배너가 뜨고 '처음부터'로 1번으로 이동한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 5); // 5번(index 4)으로 이동
    await page.waitForTimeout(800); // 디바운스 저장 플러시
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

    const banner = page.getByTestId("resume-banner");
    await expect(banner).toBeVisible();
    await expect(page.locator("#questionTitle")).toContainText("문제 5");

    await page.getByTestId("resume-restart").click();
    await expect(page.locator("#questionTitle")).toContainText("문제 1");
    await expect(banner).toHaveCount(0);
  });

  test("'계속하기'를 누르면 배너만 닫히고 위치는 유지된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestion(page, 6);
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

    await expect(page.getByTestId("resume-banner")).toBeVisible();
    await page.getByTestId("resume-dismiss").click();
    await expect(page.getByTestId("resume-banner")).toHaveCount(0);
    await expect(page.locator("#questionTitle")).toContainText("문제 6");
  });

  test("첫 문항(1번)에서 복원되면 배너가 노출되지 않는다", async ({ page }) => {
    await openProduct(page, "ISTQB"); // index 0 유지
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("resume-banner")).toHaveCount(0);
  });
});

test.describe("학습 UX — 제출 전 검토(E)", () => {
  test("확인 모달에 검토 팔레트가 보이고 미응답 문항으로 이동한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click(); // 1번만 응답
    await page.getByTestId("grade-button").click();

    const modal = page.getByTestId("confirm-grade-modal");
    await expect(modal).toBeVisible();
    const palette = page.getByTestId("review-palette");
    await expect(palette).toBeVisible();

    // 팔레트의 2번을 누르면 모달이 닫히고 2번으로 이동한다.
    await palette.locator("button", { hasText: /^2$/ }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator("#questionTitle")).toContainText("문제 2");
  });

  test("모두 응답하면 검토 모달 없이 바로 채점된다(기존 동작 유지)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    const total = await page.locator("#questionNav button").count();
    for (let i = 0; i < total; i++) {
      await page.locator("#options .option").first().click();
      if (i < total - 1) await page.locator("#nextBtn").click();
    }
    await page.getByTestId("grade-button").click();
    await expect(page.getByTestId("confirm-grade-modal")).toHaveCount(0);
    await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 8_000 });
  });
});

test.describe("학습 UX — 오답 해설(F)", () => {
  test("오답 노트에 해설이 함께 표시되고 점프도 동작한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    await page.getByRole("button", { name: "오답 노트" }).click();
    const wn = page.getByTestId("wrong-note");
    await expect(wn).toBeVisible();
    await expect(wn.locator(".wrong-note-explain").first()).toBeVisible();

    // 점프 버튼은 그대로 동작한다.
    await wn.locator(".wrong-note-jump").first().click();
    await expect(wn).toHaveCount(0);
  });
});

test.describe("학습 UX — 피드백 접근성(I)", () => {
  test("즉시 피드백 영역이 aria-live='polite'로 노출된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A"); // 연습 모드(즉시 피드백)
    await page.locator("#options .option").first().click();
    const fb = page.locator("#feedback");
    await expect(fb).toBeVisible({ timeout: 4_000 });
    await expect(fb).toHaveAttribute("aria-live", "polite");
    await expect(fb).toHaveAttribute("role", "status");
  });
});
