import { test, expect } from "@playwright/test";
import { enterExam, modeBtn, openSet, submitGrade } from "./helpers";

// Phase 2 — 학습 누적: 결과 모달의 "직전 회차 대비" 비교 + 학습 통계의 세트별 회차 타임라인.

test.describe("학습 누적 — 회차 비교·타임라인(Phase 2)", () => {
  test("첫 응시엔 '첫 응시', 재응시엔 회차·직전 대비가 결과 모달에 뜬다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");

    // 1회차 — 첫 응시 안내.
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    const compare = page.getByTestId("result-compare");
    await expect(compare).toBeVisible();
    await expect(compare).toContainText("1회차");
    await expect(compare).toContainText("첫 응시");
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    // 잠금 해제 후 재응시(채점된 시험 재진입 → 초기화) — 2회차.
    await modeBtn(page, "연습").click();
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(compare).toBeVisible();
    await expect(compare).toContainText("2회차");
    await expect(compare).toContainText("직전");
    await expect(page.getByTestId("result-delta")).toBeVisible();
  });

  test("학습 통계에 세트별 회차 타임라인이 누적된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");

    // 2회 응시해 회차를 쌓는다.
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await modeBtn(page, "연습").click();
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    // 학습 통계 열기 → 세트별 회차 타임라인에 2회차가 표시된다.
    await page.getByTestId("stats-open").click();
    const timeline = page.getByTestId("stats-set-timeline");
    await expect(timeline).toBeVisible();
    const item = page.getByTestId("set-timeline-item").first();
    await expect(item).toContainText("2회차");
    // 회차 칩(1회/2회)이 렌더된다.
    await expect(item.locator(".stl-rounds li")).toHaveCount(2);
  });

  // QA12 — 델타 "존재"만이 아니라 "방향"을 검증한다. 오라클은 UI가 아니라 원본 JSON:
  // 데이터 기준으로 점수를 올리고(오답→정답) 내려서(정답→오답) ▲/▼가 실변화와 일치하는지 본다.
  test("직전 대비 델타의 방향(▲/▼)이 데이터 기준 점수 변화와 일치한다", async ({ page }) => {
    const res = await page.request.get("/data/istqb/sample-a.json");
    expect(res.ok()).toBeTruthy();
    const q1 = (await res.json()).questions[0];
    const correctIdxs: number[] = q1.answer.map((k: string) =>
      q1.options.findIndex((o: { key: string }) => o.key.toLowerCase() === k.toLowerCase()));
    expect(correctIdxs.every((i) => i >= 0)).toBeTruthy();
    const wrongIdx = q1.options.findIndex(
      (o: { key: string }) => !q1.answer.some((k: string) => k.toLowerCase() === o.key.toLowerCase()));
    expect(wrongIdx).toBeGreaterThanOrEqual(0);

    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");

    // 1회차(기준): 1번 문항 오답 → 0점.
    await enterExam(page);
    await page.locator("#options .option").nth(wrongIdx).click();
    await submitGrade(page);
    const delta = page.getByTestId("result-delta");

    // 2회차: 다시 풀기 → 시작 게이트 재통과 → 1번 정답 → 점수 상승 = ▲.
    await page.getByTestId("result-retry").click();
    await page.getByTestId("exam-start-btn").click();
    for (const idx of correctIdxs) await page.locator("#options .option").nth(idx).click();
    await submitGrade(page);
    await expect(delta).toContainText("▲");

    // 3회차: 다시 오답 → 점수 하락 = ▼.
    await page.getByTestId("result-retry").click();
    await page.getByTestId("exam-start-btn").click();
    await page.locator("#options .option").nth(wrongIdx).click();
    await submitGrade(page);
    await expect(delta).toContainText("▼");
  });
});
