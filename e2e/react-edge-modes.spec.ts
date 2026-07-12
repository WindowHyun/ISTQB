import { test, expect } from "@playwright/test";
import { closeResult, enterExam, modeBtn, openSet, submitGrade } from "./helpers";

// 엣지: 모드 전환(격리·리셋·잠금·빈 오답).
test.describe("엣지-모드", () => {
  test("연습 답안은 시험 모드로 전환 시 진행에 반영되지 않는다(격리)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await page.locator("#options .option").first().click();
    await expect(page.locator("#progressText")).not.toHaveText("0 / 40");
    await enterExam(page);
    await expect(page.locator("#progressText")).toHaveText("0 / 40");
  });

  test("시험 답안과 연습 답안은 격리된다(채점 후 연습 전환 시 진행 0)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    // 응시 중에는 모드 전환이 잠기므로 채점으로 시험을 끝낸 뒤 연습으로 이동한다.
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await modeBtn(page, "연습").click();
    // 연습 네임스페이스는 시험 답안과 분리 — 진행 0/40.
    await expect(page.locator("#progressText")).toHaveText("0 / 40");
  });

  test("모드 전환 시 첫 문항으로 이동한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await enterExam(page);
    await expect(page.locator("#questionTitle")).toContainText("문제 1");
  });

  test("연습 모드에는 채점 버튼이 없다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await expect(page.getByTestId("grade-button")).toHaveCount(0);
  });

  test("시험 모드에는 채점 버튼이 있다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await expect(page.getByTestId("grade-button")).toBeVisible();
  });

  test("랜덤 모드는 40문항 이하로 로드된다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await modeBtn(page, "랜덤").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    const n = await page.locator("#questionNav button").count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(40);
  });

  test("채점 전 오답 모드는 빈 안내를 보이되 크래시하지 않는다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "오답").click();
    await expect(page.locator(".workspace")).toBeVisible();
    await expect(page.locator(".workspace")).toContainText("오답 문항이 없습니다");
  });

  test("연습 모드는 즉시 피드백, 시험 모드는 채점 전 피드백 없음", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await page.locator("#options .option").first().click();
    await expect(page.locator("#feedback")).toBeVisible({ timeout: 4_000 });
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await expect(page.locator("#feedback")).toHaveCount(0);
  });

  test("시험 채점 후 보기는 잠기고, 모드를 바꾸면 잠금이 풀린다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await expect(page.locator("#options .option").first()).toBeDisabled();
    await modeBtn(page, "연습").click();
    await expect(page.locator("#options .option").first()).toBeEnabled();
  });

  test("모드 전환 시 타이머가 0으로 초기화된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.waitForTimeout(1500);
    await enterExam(page);
    await expect(page.locator("#timerText")).toContainText("00:0");
  });

  test("연습→시험(채점)→연습 왕복 후에도 진행 격리가 유지된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await page.locator("#options .option").first().click();
    // 시험은 응시 중 잠기므로 채점으로 끝낸 뒤 연습으로 복귀한다.
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await modeBtn(page, "연습").click();
    // 연습 진행은 시험과 분리되어 그대로 1/40 유지.
    await expect(page.locator("#progressText")).toContainText("1 / 40");
  });

  test("채점 후 '오답 다시 풀기'로 오답 모드에 진입한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await page.getByRole("button", { name: "오답 다시 풀기" }).click();
    await page.waitForTimeout(300);
    await expect(page.locator('.segmented button[data-mode="review"]')).toHaveAttribute("aria-pressed", "true");
  });

  test("랜덤 모드는 채점이 가능하다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "랜덤").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(page.getByTestId("score")).toContainText("점수", { timeout: 8_000 });
  });

  test("모드 버튼 aria-pressed가 현재 모드만 true", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await expect(page.locator('.segmented button[data-mode="exam"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('.segmented button[data-mode="practice"]')).toHaveAttribute("aria-pressed", "false");
  });
});

// 시험 시작 게이트 + 응시 중 세트/모드 잠금(Phase 1).
test.describe("시험 시작 게이트·응시 중 잠금", () => {
  test("시험 모드 진입 시 시작 게이트가 뜨고, 시작 전에는 문항이 보이지 않는다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click(); // enterExam이 아니라 직접 — 게이트 자체 검증
    await expect(page.getByTestId("exam-start-gate")).toBeVisible();
    await expect(page.locator("#options")).toHaveCount(0);
    // 시작 전에는 세트·모드 변경 가능(아직 미커밋).
    await expect(page.getByTestId("set-select")).toBeEnabled();
    // 시작하면 문항이 노출된다.
    await page.getByTestId("exam-start-btn").click();
    await expect(page.getByTestId("exam-start-gate")).toHaveCount(0);
    await expect(page.locator("#options .option").first()).toBeVisible();
  });

  test("응시 중(시작 후 미채점)에는 세트·다른 모드 버튼이 비활성화된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    // 세트 드롭다운·비-exam 모드 버튼 비활성 + 잠금 힌트.
    await expect(page.getByTestId("set-select")).toBeDisabled();
    await expect(page.locator('.segmented button[data-mode="practice"]')).toBeDisabled();
    await expect(page.locator('.segmented button[data-mode="random"]')).toBeDisabled();
    await expect(page.getByTestId("exam-lock-hint")).toBeVisible();
  });

  test("채점하면 잠금이 풀려 다른 모드로 전환할 수 있다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await expect(page.getByTestId("set-select")).toBeEnabled();
    await modeBtn(page, "연습").click();
    await expect(page.locator('.segmented button[data-mode="practice"]')).toHaveAttribute("aria-pressed", "true");
  });

  test("CSTS 시험 모드에서도 시작 게이트·잠금이 동일하게 동작한다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await modeBtn(page, "시험").click();
    await expect(page.getByTestId("exam-start-gate")).toBeVisible();
    await page.getByTestId("exam-start-btn").click();
    await page.locator("#options .option").first().click();
    await expect(page.getByTestId("set-select")).toBeDisabled();
  });

  test("응시 중 새로고침 후 이어풀기하면 잠금이 유지된다(리로드 우회 방지)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(800); // 디바운스 저장 플러시
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("resume-keep").click(); // 이어풀기
    // 시험 답안이 남아 있으므로 응시 개시 상태가 복원되어 잠금이 유지된다.
    await expect(page.getByTestId("set-select")).toBeDisabled();
    await expect(page.locator('.segmented button[data-mode="practice"]')).toBeDisabled();
    await expect(page.getByTestId("exam-lock-hint")).toBeVisible();
  });

  test("시작 게이트 중에는 채점 버튼이 노출되지 않는다(유령 회차 방지)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click(); // 게이트 화면(시작 전)
    await expect(page.getByTestId("exam-start-gate")).toBeVisible();
    // 시작 전에는 canGrade가 false — 사이드바 '채점하기'로 0/N 유령 채점이 불가능하다.
    await expect(page.getByTestId("grade-button")).toHaveCount(0);
    // 시작하면 채점 버튼이 나타난다.
    await page.getByTestId("exam-start-btn").click();
    await expect(page.getByTestId("grade-button")).toBeVisible();
  });

  test("응시 중 '오답 다시 풀기'는 잠금에 막힌다(우회 방지)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    // 오답 기록을 만들어 둔다(채점 → 잠금 해제 → 재응시 진입).
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    // 재응시: 연습 갔다가 시험 재진입(초기화) 후 시작.
    await modeBtn(page, "연습").click();
    await enterExam(page);
    await page.locator("#options .option").first().click();
    // 잠금 상태에서 '오답 다시 풀기'를 눌러도 모드가 바뀌지 않는다(토스트 안내).
    await page.getByRole("button", { name: "오답 다시 풀기" }).click();
    await expect(page.locator('.segmented button[data-mode="exam"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("set-select")).toBeDisabled();
  });

  test("채점 후 '다시 풀기'(결과 모달)·활성 탭 재클릭으로 원클릭 재응시가 된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    // 결과 모달 '다시 풀기'(A3) → 답안 초기화 + 시작 게이트부터 재응시.
    await page.getByTestId("result-retry").click();
    await expect(page.getByTestId("exam-start-gate")).toBeVisible();
    // 재응시·채점 후, 채점 완료 상태의 활성 '시험' 탭 재클릭(A5)도 재응시 진입로다.
    await page.getByTestId("exam-start-btn").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await closeResult(page);
    await page.locator('.segmented button[data-mode="exam"]').click();
    await expect(page.getByTestId("exam-start-gate")).toBeVisible();
  });

  test("응시 중 활성 '시험' 탭 재클릭은 위치를 초기화하지 않는다(락 우회 방지)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await page.locator("#nextBtn").click(); // 2번으로 이동
    await expect(page.locator("#questionTitle")).toContainText("문제 2");
    // 활성 '시험' 탭을 다시 눌러도 setIndex(0)/resetTimer가 실행되지 않아 위치가 유지된다.
    await page.locator('.segmented button[data-mode="exam"]').click();
    await expect(page.locator("#questionTitle")).toContainText("문제 2");
    // 여전히 응시 중 잠금 상태(세트 비활성) 유지.
    await expect(page.getByTestId("set-select")).toBeDisabled();
  });
});
