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

test.describe("학습 UX — 오답 노트 재설계(세트명·내 답·정답)", () => {
  test("오답 노트 항목에 문제번호·내 답·정답이 표시된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    await page.getByRole("button", { name: "오답 노트" }).click();
    const wn = page.getByTestId("wrong-note");
    await expect(wn).toBeVisible();
    await expect(wn).toContainText("샘플문제 A"); // 세트명
    const item = wn.locator(".wrong-note-item").first();
    await expect(item.locator(".wn-num")).toContainText("문제");
    await expect(item.locator(".wn-mine")).toContainText("내 답");
    await expect(item.locator(".wn-correct")).toContainText("정답");
  });

  test("오답 노트가 여러 세트의 채점 회차를 모아 보여준다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    // 다른 세트로 전환 후 채점 → 회차 2건
    await page.locator("#examSelect").selectOption("ISTQB-FL-V4-C");
    await expect(page.locator("#questionStem")).toBeVisible();
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    await page.getByRole("button", { name: "오답 노트" }).click();
    await expect(page.getByTestId("wrong-note-group")).toHaveCount(2);
  });

  test("채점 전에는 빈 안내를 보여준다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.getByRole("button", { name: "오답 노트" }).click();
    await expect(page.getByTestId("wrong-note")).toContainText("표시할 오답이 없습니다");
  });
});

test.describe("학습 UX — 시험 모드 이어풀기/유지(#1·#2)", () => {
  test("재접속 시 시험 모드가 유지된다(연습으로 바뀌지 않음)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.segmented button[data-mode="exam"]')).toHaveAttribute("aria-pressed", "true");
  });

  test("채점한 시험 결과(잠금)가 재접속 후에도 유지된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await expect(page.locator("#options .option").first()).toBeDisabled(); // 채점 잠금
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.segmented button[data-mode="exam"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#options .option").first()).toBeDisabled(); // 잠금 유지
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
