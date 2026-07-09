import { test, expect } from "@playwright/test";
import { enterExam, modeBtn, openProduct, openSet, submitGrade } from "./helpers";

// 최종 QA — 전 기능 점검(진입·지속성·컷스코어·미응답 확인·라이트박스·토스트·스켈레톤·오답연계·모바일).
test.describe("최종점검", () => {
  // ── 진입 / 지속성 ──────────────────────────────────────────────
  test("새로고침하면 제품 선택 게이트로 돌아온다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.reload();
    await expect(page.getByRole("button", { name: "ISTQB" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "CSTS" })).toBeVisible();
  });

  test("다크 테마는 새로고침 후에도 유지된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("dialog", { name: "설정" }).getByRole("button", { name: "다크" }).click();
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => page.evaluate(() => document.body.dataset.theme)).toBe("dark");
  });

  test("글자 크기(작게)는 새로고침 후에도 유지된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("button", { name: "작게" }).click();
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => page.evaluate(() => document.body.dataset.qfont)).toBe("small");
  });

  test("모드 전환 시 진행 수가 0으로 초기화된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await page.locator("#options .option").first().click();
    await expect(page.locator("#progressText")).not.toHaveText("0 / 40");
    await enterExam(page);
    await expect(page.locator("#progressText")).toHaveText("0 / 40");
  });

  // ── 채점 / 컷스코어 ────────────────────────────────────────────
  test("ISTQB 미달 시 '합격 기준 미달'이 노출된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(page.getByTestId("result-summary")).toContainText("미달", { timeout: 8_000 });
  });

  test("ISTQB 합격 기준 라벨(26 / 40문항(65%))이 노출된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(page.locator(".result-criterion")).toContainText("26 / 40문항(65%)");
  });

  test("CSTS 결과는 환산 점수와 환산 52.5점 기준을 노출한다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(page.getByTestId("result-score")).toContainText("환산", { timeout: 8_000 });
    await expect(page.locator(".result-criterion")).toContainText("환산 52.5점");
  });

  test("모두 응답 후 채점하면 확인 모달 없이 결과가 뜬다", async ({ page }) => {
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

  // ── 미응답 확인 ────────────────────────────────────────────────
  test("미응답 확인 모달을 Esc로 닫으면 채점되지 않는다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await page.getByTestId("grade-button").click();
    await expect(page.getByTestId("confirm-grade-modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("confirm-grade-modal")).toHaveCount(0);
    await expect(page.getByTestId("result-summary")).toHaveCount(0);
  });

  test("미응답 확인 모달이 미응답 개수(37)를 정확히 표시한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    for (let i = 0; i < 3; i++) {
      await page.locator("#options .option").first().click();
      await page.locator("#nextBtn").click();
    }
    await page.getByTestId("grade-button").click();
    await expect(page.getByTestId("confirm-grade-modal")).toContainText("37");
  });

  // ── 라이트박스 ─────────────────────────────────────────────────
  test("그림 라이트박스를 배경 클릭으로 닫는다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.locator('#questionNav button:has-text("23")').first().click();
    await page.locator("#questionFigure img, #questionStem img").first().click();
    await expect(page.getByTestId("figure-lightbox")).toBeVisible();
    await page.getByTestId("figure-lightbox").click({ position: { x: 6, y: 6 } });
    await expect(page.getByTestId("figure-lightbox")).toHaveCount(0);
  });

  test("그림 라이트박스를 ✕ 버튼으로 닫는다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.locator('#questionNav button:has-text("23")').first().click();
    await page.locator("#questionFigure img, #questionStem img").first().click();
    await expect(page.getByTestId("figure-lightbox")).toBeVisible();
    await page.locator(".figure-lightbox-close").click();
    await expect(page.getByTestId("figure-lightbox")).toHaveCount(0);
  });

  test("라이트박스가 열리면 body 스크롤이 잠기고 닫으면 복원된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.locator('#questionNav button:has-text("23")').first().click();
    await page.locator("#questionFigure img, #questionStem img").first().click();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await page.keyboard.press("Escape");
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  });

  // ── 토스트 / 스켈레톤 ─────────────────────────────────────────
  test("잘못된 가져오기 토스트는 클릭하면 사라진다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    const bad = { name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{bad", "utf-8") };
    await page.locator('input[type="file"][accept=".json"]').setInputFiles(bad);
    const toast = page.getByTestId("toast");
    await expect(toast).toBeVisible({ timeout: 5_000 });
    await toast.click();
    await expect(toast).toHaveCount(0, { timeout: 3_000 });
  });

  test("세트 로딩이 지연되면 스켈레톤이 노출된다", async ({ page }) => {
    await page.route("**/data/istqb/sample-a.json", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      route.continue();
    });
    await page.goto("/");
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.getByTestId("skeleton")).toBeVisible({ timeout: 4_000 });
  });

  // ── 오답 연계 ──────────────────────────────────────────────────
  test("채점 후 오답 노트에서 세트 선택 시 세트명·내 답·정답이 표시된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await page.getByRole("button", { name: "오답 노트" }).click();
    const setBtn = page.getByTestId("wrong-note-set-btn").first();
    await expect(setBtn).toContainText("샘플문제 A");
    await setBtn.click();
    const item = page.getByTestId("wrong-note-detail").locator(".wrong-note-item").first();
    await expect(item.locator(".wn-mine")).toContainText("내 답");
    await expect(item.locator(".wn-correct")).toContainText("정답");
  });

  test("결과 요약의 '오답 노트 보기'로 오답노트가 열린다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 8_000 });
    await page.getByRole("button", { name: "오답 노트 보기" }).click();
    await expect(page.getByTestId("wrong-note")).toBeVisible({ timeout: 5_000 });
  });

  // ── 모바일 ─────────────────────────────────────────────────────
  test.describe("모바일(390x844)", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("드로어에서 학습 통계가 열린다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("drawer-open").click();
      await page.getByTestId("stats-open").click();
      await expect(page.getByTestId("stats-dashboard")).toBeVisible({ timeout: 5_000 });
    });
  });
});
