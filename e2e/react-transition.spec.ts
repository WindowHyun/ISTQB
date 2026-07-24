import { test, expect } from "@playwright/test";
import { enterExam, modeBtn, openProduct, openSet, submitGrade } from "./helpers";

// 상태 전이(State Transition) 전수조사 — 상태 × 이벤트 매트릭스를 경로 단위로 검증.
// 상태: S0 게이트 / S1 연습 / S2E-gate 시험(시작 전) / S2E-run 응시 중(잠금) /
//       S2E-done 채점 후 / S3 랜덤 / S3-done / S4 오답
const A = "ISTQB-FL-V4-A";
const C = "ISTQB-FL-V4-C";

test.describe("전이 — S0 게이트 진입/이탈", () => {
  test("T1/T2: 제품 선택 → 연습 모드 문항 노출(ISTQB/CSTS)", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await expect(page.locator('.segmented button[data-mode="practice"]')).toHaveAttribute("aria-pressed", "true");
    await page.goto("/");
    await page.getByRole("button", { name: "CSTS" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".product-badge")).toHaveText("CSTS");
  });

  test("T39: '처음 화면으로' → S0 → 같은 제품 재선택 시 채점 상태 보존(중복 회차 방지)", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    // 처음 화면으로(S0)
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("button", { name: "처음 화면으로" }).click();
    await expect(page.getByRole("button", { name: "ISTQB" })).toBeVisible();
    // 같은 제품 재선택 — home 모드는 연습으로 폴백(기존 설계). graded가 세션에 보존되므로
    // '시험' 재진입 시 채점된 시험으로 판정되어 초기화된 게이트가 뜬다 — 묵은 답안이
    // 그대로 남아 재채점(유령 회차 중복)되는 경로가 없어야 한다.
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.segmented button[data-mode="practice"]')).toHaveAttribute("aria-pressed", "true");
    await modeBtn(page, "시험").click();
    await expect(page.getByTestId("exam-start-gate")).toBeVisible(); // graded 보존 → 재응시 초기화
    await page.getByTestId("exam-start-btn").click();
    await expect(page.locator("#progressText")).toContainText("0 / 40"); // 묵은 답안 없음
  });
});

test.describe("전이 — S1 연습", () => {
  test("T3/T8: 답 선택 → 즉시 피드백·진행 증가, 같은 모드 재클릭 → 무변화", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    await page.locator("#options .option").first().click();
    await expect(page.locator("#feedback")).toBeVisible({ timeout: 4_000 });
    await expect(page.locator("#progressText")).toContainText("1 / 40");
    await page.locator("#nextBtn").click();
    await modeBtn(page, "연습").click(); // 재클릭 no-op
    await expect(page.locator("#questionTitle")).toContainText("문제 2");
    await expect(page.locator("#progressText")).toContainText("1 / 40");
  });

  test("T4/T12: 연습→시험은 게이트, 게이트에서 연습 복귀 허용(미커밋)", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    await modeBtn(page, "시험").click();
    await expect(page.getByTestId("exam-start-gate")).toBeVisible();
    await modeBtn(page, "연습").click(); // 시작 전에는 자유 이탈
    await expect(page.getByTestId("exam-start-gate")).toHaveCount(0);
    await expect(page.locator("#options .option").first()).toBeVisible();
  });

  test("T7: 세트 변경 → 모드(연습) 유지 + 해당 세트 진행으로 전환", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    await page.locator("#options .option").first().click();
    await page.locator("#examSelect").selectOption(C);
    await expect(page.locator("#questionStem")).toBeVisible();
    await expect(page.locator('.segmented button[data-mode="practice"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#progressText")).toContainText("0 / 40");
  });

  test("T9: 연습 새로고침 → 재선택 시 모달 없이 복원", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("resume-prompt-modal")).toHaveCount(0);
    await expect(page.locator("#progressText")).toContainText("1 / 40");
  });
});

test.describe("전이 — S2E 시험(게이트→응시중→채점후)", () => {
  test("T10/T13/T15/T16/T17: 시작 전 채점버튼 없음 → 시작 → 응시중 잠금·무피드백", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    await modeBtn(page, "시험").click();
    // S2E-gate: 채점 버튼 없음(유령 채점 차단), 세트 변경 가능
    await expect(page.getByTestId("grade-button")).toHaveCount(0);
    await expect(page.getByTestId("set-select")).toBeEnabled();
    // 시작 → S2E-run
    await page.getByTestId("exam-start-btn").click();
    await expect(page.getByTestId("grade-button")).toBeVisible();
    await page.locator("#options .option").first().click();
    await expect(page.locator("#feedback")).toHaveCount(0); // 시험은 즉시 피드백 없음
    await expect(page.getByTestId("set-select")).toBeDisabled(); // 잠금
    await expect(page.locator('.segmented button[data-mode="random"]')).toBeDisabled();
  });

  test("T19/T20: 응시 중 '오답 다시 풀기'·통계 '연습' 진입 차단(잠금 우회 방지)", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    // 사전 이력(오답·챕터 통계) 생성
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    // 재응시 → 응시 중 상태
    await modeBtn(page, "연습").click();
    await enterExam(page);
    await page.locator("#options .option").first().click();
    // 오답 다시 풀기 → 차단, 모드 유지
    await page.getByRole("button", { name: "오답 다시 풀기" }).click();
    await expect(page.locator('.segmented button[data-mode="exam"]')).toHaveAttribute("aria-pressed", "true");
    // 통계 챕터 연습 → 잠금 중에는 버튼 자체가 비활성(핸들러 가드와 이중 방어)
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("chapter-practice-btn").first()).toBeDisabled();
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expect(page.locator('.segmented button[data-mode="exam"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("set-select")).toBeDisabled();
  });

  test("T21/T24-T26: 채점(미응답 확인 경유) → 채점후: 잠금 해제·보기 잠김·결과·회차", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await page.getByTestId("grade-button").click();
    await expect(page.getByTestId("confirm-grade-modal")).toBeVisible(); // 미응답 확인
    await page.getByTestId("confirm-grade").click();
    await expect(page.getByTestId("result-summary")).toBeVisible();
    await expect(page.getByTestId("result-compare")).toContainText("1회차"); // 회차 전이 기록
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await expect(page.getByTestId("set-select")).toBeEnabled(); // 잠금 해제
    await expect(page.locator("#options .option").first()).toBeDisabled(); // 재응답 잠김
  });

  test("T22/T30: 응시중 리로드→이어풀기=잠금 유지 / 채점후 리로드→이어풀기=재응시 가능", async ({ page }) => {
    // 응시 중 리로드
    await openSet(page, "ISTQB", A);
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("resume-keep").click();
    await expect(page.getByTestId("set-select")).toBeDisabled(); // 잠금 복원(T22)
    // 채점 후 리로드 — 최신 회차와 동일 답안이면 '채점 완료된 회차' 가드로 복원(T30 개정, S4).
    // 재응시는 '새 회차 시작' 경유 — 같은 답안 재채점으로 회차가 중복 적립되지 않는다.
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("graded-resume-modal")).toBeVisible();
    await page.getByTestId("graded-resume-fresh").click();
    await expect(page.getByTestId("exam-start-gate")).toBeVisible(); // 재응시는 게이트부터(T30)
  });

  test("T23/T28: 새로 풀기 → 게이트 재노출 / 채점후 재진입 → 초기화된 게이트", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("resume-fresh").click(); // 새로 풀기
    await expect(page.getByTestId("exam-start-gate")).toBeVisible(); // 게이트 재노출(T23)
    // 시작·채점 후 연습 경유 재진입 → 초기화 + 게이트(T28)
    await page.getByTestId("exam-start-btn").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await modeBtn(page, "연습").click();
    await modeBtn(page, "시험").click();
    await expect(page.getByTestId("exam-start-gate")).toBeVisible();
  });
});

test.describe("전이 — S3 랜덤 / S4 오답", () => {
  test("T5/T31/T32: 랜덤 진입(≤40) → 재클릭 무변화 → 채점 → 점수", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    await modeBtn(page, "랜덤").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    const n = await page.locator("#questionNav button").count();
    expect(n).toBeLessThanOrEqual(40);
    await page.locator("#options .option").first().click();
    await modeBtn(page, "랜덤").click(); // 재클릭 no-op — 답안 유지
    await expect(page.locator("#progressText")).toContainText("1 /");
    await submitGrade(page);
    await expect(page.getByTestId("score")).toContainText("점수", { timeout: 8_000 });
  });

  test("T33/T35: 채점된 랜덤 재진입 → 재추첨·초기화 / 진행 중 리로드 → 이어풀기(진행 유지)", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    await modeBtn(page, "랜덤").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await modeBtn(page, "연습").click();
    await modeBtn(page, "랜덤").click(); // 재진입 → 초기화(T33)
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#progressText")).toContainText("0 /");
    // 진행 중(미채점) 랜덤: 2문항 응답 후 리로드 → 같은 추첨으로 이어푼다(T35, 진행 유지).
    await page.locator("#options .option").first().click();
    await page.locator("#nextBtn").click();
    await page.locator("#options .option").first().click();
    await expect(page.locator("#progressText")).toContainText("2 /");
    const titleBefore = await page.locator("#questionTitle").textContent();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.segmented button[data-mode="random"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("resume-prompt-modal")).toHaveCount(0);
    await expect(page.locator("#progressText")).toContainText("2 /");
    await expect(page.locator("#questionTitle")).toHaveText(titleBefore || "");
  });

  test("T6/T29/T36: 오답 없음 안내 → 채점 후 오답 재풀이 전이", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    await modeBtn(page, "오답").click(); // 오답 없음(T6)
    await expect(page.locator(".workspace")).toContainText("오답 문항이 없습니다");
    await modeBtn(page, "시험").click();
    await page.getByTestId("exam-start-btn").click();
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await page.getByRole("button", { name: "오답 다시 풀기" }).click(); // T29
    await page.waitForTimeout(300);
    await expect(page.locator('.segmented button[data-mode="review"]')).toHaveAttribute("aria-pressed", "true");
    const reviewCount = await page.locator("#questionNav button").count();
    expect(reviewCount).toBeGreaterThan(0); // 틀린 문항만(T36)
  });
});

test.describe("전이 — 제품 간 격리", () => {
  test("T38: ISTQB↔CSTS 왕복 — 답안·상태 격리 및 복원", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    await page.locator("#options .option").first().click(); // ISTQB 연습 1답
    await page.waitForTimeout(800);
    // CSTS로 전환
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("button", { name: "처음 화면으로" }).click();
    await page.getByRole("button", { name: "CSTS" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#progressText")).toContainText("0 /"); // CSTS는 깨끗(격리)
    // ISTQB 복귀 → 답안 보존
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("button", { name: "처음 화면으로" }).click();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#progressText")).toContainText("1 / 40");
  });
});
