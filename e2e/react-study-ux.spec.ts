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
  test("오답 노트: 세트 선택 후 문제번호·내 답·정답이 표시된다(#3·#4)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    await page.getByRole("button", { name: "오답 노트" }).click();
    // 1단계: 세트 목록
    await expect(page.getByTestId("wrong-note-set-btn").first()).toContainText("샘플문제 A");
    await page.getByTestId("wrong-note-set-btn").first().click();
    // 2단계: 오답 항목
    const item = page.getByTestId("wrong-note-detail").locator(".wrong-note-item").first();
    await expect(item.locator(".wn-num")).toContainText("문제");
    await expect(item.locator(".wn-mine")).toContainText("내 답");
    await expect(item.locator(".wn-correct")).toContainText("정답");
  });

  test("오답 노트: 여러 세트가 목록으로 보이고 뒤로가기로 돌아온다(#3·#4)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    // 다른 세트로 전환(모드 유지됨) 후 채점 → 회차 2건
    await page.locator("#examSelect").selectOption("ISTQB-FL-V4-C");
    await expect(page.locator("#questionStem")).toBeVisible();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    await page.getByRole("button", { name: "오답 노트" }).click();
    await expect(page.getByTestId("wrong-note-set-btn")).toHaveCount(2);
    // 세트 진입 → 뒤로가기 → 다시 목록
    await page.getByTestId("wrong-note-set-btn").first().click();
    await expect(page.getByTestId("wrong-note-detail")).toBeVisible();
    await page.getByTestId("wrong-note-back").click();
    await expect(page.getByTestId("wrong-note-set-btn")).toHaveCount(2);
  });

  test("채점 전에는 빈 안내를 보여준다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.getByRole("button", { name: "오답 노트" }).click();
    await expect(page.getByTestId("wrong-note")).toContainText("표시할 오답이 없습니다");
  });
});

test.describe("학습 UX — 시험 모드 이어풀기/유지(#1·#2·#6)", () => {
  test("재접속 시 시험 모드가 유지된다(연습으로 바뀌지 않음, #6)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("resume-keep").click(); // 이어풀기
    await expect(page.locator('.segmented button[data-mode="exam"]')).toHaveAttribute("aria-pressed", "true");
  });

  test("세트를 바꿔도 모드가 유지된다(연습으로 초기화 안 됨, #2)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#examSelect").selectOption("ISTQB-FL-V4-C");
    await expect(page.locator("#questionStem")).toBeVisible();
    await expect(page.locator('.segmented button[data-mode="exam"]')).toHaveAttribute("aria-pressed", "true");
  });

  test("채점한 시험은 다른 모드 갔다 오면 다시 풀 수 있다(잠금 해제, #1)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await expect(page.locator("#options .option").first()).toBeDisabled(); // 채점 직후 잠금
    // 연습 갔다가 다시 시험 → 잠금 해제(재응시)
    await modeBtn(page, "연습").click();
    await modeBtn(page, "시험").click();
    await expect(page.locator("#options .option").first()).toBeEnabled();
    await expect(page.locator("#progressText")).toHaveText("0 / 40");
  });

  test("채점한 시험은 재접속하면 다시 풀 수 있다(잠금 미유지, #1 롤백)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("resume-keep").click(); // 이어풀기
    await expect(page.locator('.segmented button[data-mode="exam"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#options .option").first()).toBeEnabled(); // 잠금 미유지
  });
});

test.describe("학습 UX — 재접속 이어풀기/새로풀기 선택(B안)", () => {
  test("시험 답안이 있으면 재접속 시 선택 모달이 뜬다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("resume-prompt-modal")).toBeVisible();
    await expect(page.getByTestId("resume-keep")).toBeVisible();
    await expect(page.getByTestId("resume-fresh")).toBeVisible();
  });

  test("'이어풀기'를 고르면 이전 답안이 유지된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("resume-keep").click();
    await expect(page.getByTestId("resume-prompt-modal")).toHaveCount(0);
    await expect(page.locator("#progressText")).toHaveText("1 / 40");
  });

  test("'새로 풀기'를 고르면 이전 답안이 초기화된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("resume-fresh").click();
    await expect(page.getByTestId("resume-prompt-modal")).toHaveCount(0);
    await expect(page.locator("#progressText")).toHaveText("0 / 40");
    await expect(page.locator('.segmented button[data-mode="exam"]')).toHaveAttribute("aria-pressed", "true");
  });

  test("연습 모드 재접속은 선택 모달 없이 복원된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A"); // 연습 모드
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("resume-prompt-modal")).toHaveCount(0);
  });

  test("다른 세트로 바꿔서 이전 답안이 있으면 선택 모달이 뜬다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click(); // A 답
    // C로 전환(답안 없음 → 모달 없음)
    await page.locator("#examSelect").selectOption("ISTQB-FL-V4-C");
    await expect(page.locator("#questionStem")).toBeVisible();
    await expect(page.getByTestId("resume-prompt-modal")).toHaveCount(0);
    await page.locator("#options .option").first().click(); // C 답
    // 다시 A로 전환 → A에 답안 있음 → 모달
    await page.locator("#examSelect").selectOption("ISTQB-FL-V4-A");
    await expect(page.getByTestId("resume-prompt-modal")).toBeVisible();
    // 새로 풀기 → A 초기화
    await page.getByTestId("resume-fresh").click();
    await expect(page.locator("#progressText")).toHaveText("0 / 40");
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

test.describe("코드리뷰 수정 회귀 — 오답 목록 보존·가드 이동 초기화", () => {
  test("랜덤 채점이 시험 오답 목록을 덮어쓰지 않는다(오답 모드 합집합)", async ({ page }) => {
    // 70문항 세트: 랜덤은 40문항만 추첨하므로, 시험 오답(≈69)이 보존되면 합집합 > 40.
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    await modeBtn(page, "랜덤").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    await modeBtn(page, "오답").click();
    await expect.poll(() => page.locator("#questionNav button").count(), { timeout: 10_000 })
      .toBeGreaterThan(40);
  });

  test("시험 중 가드 모달 '이동'으로 채점된 랜덤에 들어가면 새로 풀 수 있다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    // 1) 랜덤을 채점해 잠금 상태로 만든다.
    await modeBtn(page, "랜덤").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    // 2) 시험 모드에서 1문항 응답(진행 중) 후 랜덤으로 이동 시도 → 가드 모달 → 이동.
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await modeBtn(page, "랜덤").click();
    await expect(page.getByTestId("mode-change-modal")).toBeVisible();
    await page.getByTestId("mode-change-go").click();
    // 3) 직접 클릭 경로와 동일하게 초기화되어 새로 풀 수 있어야 한다.
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#options .option").first()).toBeEnabled();
    await expect(page.locator("#progressText")).toHaveText("0 / 40");
    await expect(page.getByTestId("grade-button")).toBeVisible();
  });
});

test.describe("학습 UX — 채점 결과 줄바꿈 없음(#5)", () => {
  test("점수·합격 기준 값이 한 줄로(줄바꿈 없이) 표시된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    const result = page.getByTestId("result-summary");
    await expect(result).toBeVisible({ timeout: 8_000 });
    // 합격 기준·점수 값은 white-space:nowrap 으로 줄바꿈되지 않는다.
    for (const sel of [".result-criterion", '[data-testid="result-score"]']) {
      const ws = await result.locator(sel).evaluate((el) => getComputedStyle(el).whiteSpace);
      expect(ws).toBe("nowrap");
    }
  });
});
