import { test, expect } from "@playwright/test";
import { completeAttempt, enterExam, enterFullRandom, gotoQuestion, modeBtn, openProduct, openSet, submitGrade } from "./helpers";

// 학습 UX 개선: 이어풀기 배너(A) · 제출 전 검토(E) · 오답 해설(F) · 피드백 aria-live(I).

test.describe("학습 UX — 이어풀기 배너(A)", () => {
  /**
   * '처음부터'는 이름 그대로 답안까지 초기화해야 한다.
   *
   * 종전 검사는 "문제 1로 이동했는가"만 봤고, 구현도 setIndex(0)뿐이라 서로 아귀가
   * 맞았다 — 그래서 초록이었다. 하지만 버튼 이름('처음부터', 짝은 '계속하기')이 약속한
   * 것은 초기화이고, 실제로는 이전 답 선택이 그대로 남아 사용자가 "초기화가 안 된다"로
   * 겪었다. 검사가 이름이 아니라 구현을 따라간 탓에 결함이 통과했다.
   *
   * 이제 진행률로 확인한다 — 위치만 되돌리는 구현으로 되돌아가면 진행률이 남아 실패한다.
   */
  test("'처음부터'는 확인을 거쳐 답안까지 초기화한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    // 답을 남긴 채 5번으로 이동한다 — 초기화 대상이 있어야 검사가 성립한다.
    await page.locator("#options .option").first().click();
    await expect(page.locator("#progressText")).toContainText("1 /");
    await gotoQuestion(page, 5); // 5번(index 4)으로 이동
    await page.waitForTimeout(800); // 디바운스 저장 플러시
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

    const banner = page.getByTestId("resume-banner");
    await expect(banner).toBeVisible();
    await expect(page.locator("#questionTitle")).toContainText("문제 5");
    await expect(page.locator("#progressText")).toContainText("1 /"); // 답안이 복원됐다

    // 답안 소실은 되돌릴 수 없으므로 확인 단계를 거친다.
    await page.getByTestId("resume-restart").click();
    await expect(page.getByTestId("pending-restart-modal")).toBeVisible();

    // 취소하면 아무것도 사라지지 않는다.
    await page.getByTestId("pending-restart-cancel").click();
    await expect(page.getByTestId("pending-restart-modal")).toHaveCount(0);
    await expect(page.locator("#questionTitle")).toContainText("문제 5");
    await expect(page.locator("#progressText")).toContainText("1 /");

    // 확인하면 위치와 답안이 함께 초기화된다.
    await page.getByTestId("resume-restart").click();
    await page.getByTestId("pending-restart-confirm").click();
    await expect(page.locator("#questionTitle")).toContainText("문제 1");
    await expect(banner).toHaveCount(0);
    await expect(page.locator("#progressText"), "답안이 지워지지 않았다").toContainText("0 /");
    await expect(page.locator("#options .option.selected")).toHaveCount(0);
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
    await enterExam(page);
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
    await enterExam(page);
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
    await enterExam(page);
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
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    // 채점 후 잠금 해제 → 다른 세트로 전환(모드 유지) → 시작 게이트 통과 후 채점 → 회차 2건
    await page.locator("#examSelect").selectOption("ISTQB-FL-V4-C");
    await page.getByTestId("exam-start-btn").click();
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
    await enterExam(page);
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
    // 시작 게이트(응시 전)에서는 세트 변경이 열려 있고, 바꿔도 모드는 시험으로 유지된다.
    await modeBtn(page, "시험").click();
    await expect(page.getByTestId("exam-start-gate")).toBeVisible();
    await page.locator("#examSelect").selectOption("ISTQB-FL-V4-C");
    await expect(page.getByTestId("exam-start-gate")).toBeVisible();
    await expect(page.locator('.segmented button[data-mode="exam"]')).toHaveAttribute("aria-pressed", "true");
  });

  test("채점한 시험은 다른 모드 갔다 오면 다시 풀 수 있다(잠금 해제, #1)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await expect(page.locator("#options .option").first()).toBeDisabled(); // 채점 직후 잠금
    // 연습 갔다가 다시 시험 → 잠금 해제(재응시)
    await modeBtn(page, "연습").click();
    await enterExam(page);
    await expect(page.locator("#options .option").first()).toBeEnabled();
    await expect(page.locator("#progressText")).toHaveText("0 / 40");
  });

  test("채점한 시험은 재접속 시 '채점 완료' 가드를 거쳐 새 회차로 다시 풀 수 있다(#1 개정, S4)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    // 채점 완료 회차는 미채점처럼 보이지 않는다 — 같은 답안 재채점(중복 회차) 차단 가드.
    await expect(page.getByTestId("graded-resume-modal")).toBeVisible();
    await page.getByTestId("graded-resume-fresh").click(); // 새 회차 시작
    await expect(page.getByTestId("exam-start-gate")).toBeVisible();
    await page.getByTestId("exam-start-btn").click();
    await expect(page.locator("#options .option").first()).toBeEnabled();
    await expect(page.locator("#progressText")).toHaveText("0 / 40");
  });
});

test.describe("학습 UX — 재접속 이어풀기/새로풀기 선택(B안)", () => {
  test("시험 답안이 있으면 재접속 시 선택 모달이 뜬다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
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
    await enterExam(page);
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
    await enterExam(page);
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
    await enterExam(page);
    await page.locator("#options .option").first().click(); // A 답
    await submitGrade(page); // 채점 → 잠금 해제(세트 변경 가능)
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    // C로 전환(답안 없음 → 모달 없음, 시작 게이트)
    await page.locator("#examSelect").selectOption("ISTQB-FL-V4-C");
    await expect(page.getByTestId("exam-start-gate")).toBeVisible();
    await expect(page.getByTestId("resume-prompt-modal")).toHaveCount(0);
    // 다시 A로 전환 → A에 채점 답안 있음 → 모달
    await page.locator("#examSelect").selectOption("ISTQB-FL-V4-A");
    await expect(page.getByTestId("resume-prompt-modal")).toBeVisible();
    // 새로 풀기 → A 초기화
    await page.getByTestId("resume-fresh").click();
    await expect(page.locator("#progressText")).toHaveText("0 / 40");
  });

  // 세트 전체 랜덤(40문항)의 성질들. 모드 세그먼트의 '랜덤' 탭은 사라졌지만(퀵에 흡수)
  // 기능은 살아 있다 — 미니 시험으로 들어가 배너의 '전체 보기'로 챕터 제한을 풀면 닿는다
  // (helpers의 enterFullRandom). 진입로만 바뀌었을 뿐이라 재는 성질은 그대로 둔다.
  test("랜덤은 진행 중 새로고침 시 같은 추첨으로 이어푼다(선택 모달 없음)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await completeAttempt(page); // 챕터 통계 생성 — 미니 시험이 랜덤의 진입로다
    await enterFullRandom(page);
    const titleBefore = await page.locator("#questionTitle").textContent();
    await page.locator("#options .option").first().click(); // 랜덤 1문항 응답(미채점)
    await expect(page.locator("#progressText")).toHaveText("1 / 40");
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    // 랜덤 모드 유지 + 이어풀기 선택 모달 없음(랜덤은 배너로 안내) + 진행·문항 그대로 유지.
    // 모드는 세그먼트가 아니라 저장된 상태에서 읽는다 — '랜덤' 탭이 사라져 aria-pressed로는
    // 물어볼 곳이 없다. (아래 "1 / 40"도 랜덤이 아니면 나올 수 없는 값이라 함께 증거가 된다)
    const restoredMode = await page.evaluate(() => {
      const raw = localStorage.getItem("istqb-fl-v4-sample-ui-state");
      return raw ? JSON.parse(raw).mode : null;
    });
    expect(restoredMode, "새로고침 후 랜덤 모드가 유지되지 않았다").toBe("random");
    await expect(page.getByTestId("resume-prompt-modal")).toHaveCount(0);
    await expect(page.locator("#progressText")).toHaveText("1 / 40");
    await expect(page.locator("#questionTitle")).toHaveText(titleBefore || "");
  });

  test("랜덤 진행 중 세트를 바꾸면 확인을 거쳐 새로 시작한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await completeAttempt(page); // 챕터 통계 생성 — 미니 시험이 랜덤의 진입로다
    await enterFullRandom(page);
    await page.locator("#options .option").first().click();
    await expect(page.locator("#progressText")).toHaveText("1 / 40");

    await page.locator("#examSelect").selectOption("ISTQB-FL-V4-C");
    // 진행이 있으므로 즉시 바뀌지 않고 먼저 묻는다.
    await expect(page.getByTestId("pending-set-change-modal")).toBeVisible();
    await page.getByTestId("pending-set-change-confirm").click();

    await expect(page.getByTestId("pending-set-change-modal")).toHaveCount(0);
    await expect(page.locator("#questionStem")).toBeVisible();
    await expect(page.getByTestId("resume-prompt-modal")).toHaveCount(0);
    await expect(page.locator("#progressText")).toHaveText("0 / 40");
    await expect(page.locator("#examSelect")).toHaveValue("ISTQB-FL-V4-C");
  });

  test("랜덤 세트 변경을 취소하면 원래 세트와 진행이 그대로 남는다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await completeAttempt(page); // 챕터 통계 생성 — 미니 시험이 랜덤의 진입로다
    await enterFullRandom(page);
    await page.locator("#options .option").first().click();
    await expect(page.locator("#progressText")).toHaveText("1 / 40");

    await page.locator("#examSelect").selectOption("ISTQB-FL-V4-C");
    await expect(page.getByTestId("pending-set-change-modal")).toBeVisible();
    await page.getByTestId("pending-set-change-cancel").click();

    await expect(page.getByTestId("pending-set-change-modal")).toHaveCount(0);
    // 세트 선택도 원래대로 되돌아가야 한다(제어 컴포넌트).
    await expect(page.locator("#examSelect")).toHaveValue("ISTQB-FL-V4-A");
    await expect(page.locator("#progressText")).toHaveText("1 / 40");
  });

  test("랜덤에 진행이 없으면 세트 변경을 묻지 않는다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await completeAttempt(page); // 챕터 통계 생성 — 미니 시험이 랜덤의 진입로다
    await enterFullRandom(page);
    // 한 문항도 풀지 않은 상태 — 잃을 게 없으므로 바로 바뀐다.
    await page.locator("#examSelect").selectOption("ISTQB-FL-V4-C");
    await expect(page.getByTestId("pending-set-change-modal")).toHaveCount(0);
    await expect(page.locator("#examSelect")).toHaveValue("ISTQB-FL-V4-C");
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
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    await enterFullRandom(page); // 위 시험 회차가 챕터 통계를 만들어 뒀다
    // 추첨 첫 문항이 단답형일 수 있어 응답 없이 채점한다(미응답 확인 → 채점).
    // 응답 여부와 무관하게 랜덤 채점은 reviewIds를 기록하므로 덮어쓰기 검증에 충분하다.
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    await modeBtn(page, "오답").click();
    await expect.poll(() => page.locator("#questionNav button").count(), { timeout: 10_000 })
      .toBeGreaterThan(40);
  });

  test("랜덤 모드는 채점해도 문항 추첨이 유지된다(재추첨 없음)", async ({ page }) => {
    // 70문항 세트: 재추첨되면 40문항 부분집합이 교체되어 현재 문항이 바뀐다.
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await completeAttempt(page);
    await enterFullRandom(page);
    const titleBefore = await page.locator("#questionTitle").textContent();
    await submitGrade(page); // 미응답 확인 → 채점
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await expect(page.locator("#questionTitle")).toHaveText(titleBefore || "");
    await expect(page.locator("#questionNav button")).toHaveCount(40);
  });

  test("채점 후 시험 잠금이 풀려 채점된 랜덤에 들어가면 새로 풀 수 있다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    // 1) 랜덤을 채점해 둔다.
    await completeAttempt(page); // 챕터 통계 생성 — 미니 시험이 랜덤의 진입로다
    await enterFullRandom(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    // 2) 시험을 시작·응답·채점하면 잠금이 풀린다.
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    // 3) 잠금 해제 후 채점된 랜덤으로 이동하면 재추첨·초기화되어 새로 풀 수 있다.
    await enterFullRandom(page);
    await expect(page.locator("#options .option").first()).toBeEnabled();
    await expect(page.locator("#progressText")).toHaveText("0 / 40");
    await expect(page.getByTestId("grade-button")).toBeVisible();
  });
});

test.describe("학습 UX — 채점 결과 줄바꿈(#5)", () => {
  test("점수 값은 한 줄로(줄바꿈 없이) 표시된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    const result = page.getByTestId("result-summary");
    await expect(result).toBeVisible({ timeout: 8_000 });
    // 점수는 수치라 "58.5 /" 뒤에서 끊기면 안 된다.
    const ws = await result
      .locator('[data-testid="result-score"]')
      .evaluate((el) => getComputedStyle(el).whiteSpace);
    expect(ws).toBe("nowrap");
  });

  test("합격 기준 설명은 좁은 화면에서 잘리지 않고 줄바꿈된다", async ({ page }) => {
    // CSTS 기준 문구는 가장 길다 — 한 줄로 두면 좁은 화면에서 칸 밖으로 잘려 나갔다.
    await openSet(page, "CSTS", "CSTS-FL-2405");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    const result = page.getByTestId("result-summary");
    await expect(result).toBeVisible({ timeout: 8_000 });

    const criterion = result.locator(".result-criterion");
    for (const width of [390, 360, 320]) {
      await page.setViewportSize({ width, height: 800 });
      const m = await criterion.evaluate((el) => ({
        textW: el.scrollWidth,
        cellW: (el.parentElement as HTMLElement).clientWidth,
      }));
      // 1px 여유: 소수 픽셀 반올림.
      expect(m.textW, `${width}px에서 기준 문구가 칸을 넘침`).toBeLessThanOrEqual(m.cellW + 1);
    }
    // 문구가 통째로 남아 있는지(잘라내기·생략 부호로 때우지 않았는지) 확인.
    await expect(criterion).toContainText("100점 만점 기준 75점");
  });
});
