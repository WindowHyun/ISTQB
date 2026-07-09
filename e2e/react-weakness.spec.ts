import { test, expect, Page } from "@playwright/test";
import { enterExam, modeBtn, openSet, submitGrade } from "./helpers";

// Phase 3: 챕터별 약점 분석·챕터 집중 연습·오답노트 전 회차 합산.

// 현재 표시 중인 문항을 데이터 정답으로 맞힌다(세트 JSON에서 정답 키를 조회).
async function answerCurrentCorrectly(page: Page, setPath: string) {
  const data = await (await page.request.get(`/data/${setPath}`)).json();
  const title = (await page.locator("#questionTitle").textContent()) || "";
  const num = parseInt(title.match(/문제 (\d+)/)?.[1] || "0", 10);
  const q = data.questions.find((x: { number: number }) => x.number === num);
  for (const key of q.answer) {
    await page
      .locator("#options .option")
      .filter({ has: page.locator(".option-key", { hasText: new RegExp(`^${key.toUpperCase()}$`) }) })
      .first()
      .click();
  }
}

test.describe("약점 분석(Phase 3)", () => {
  test("채점하면 통계에 챕터별 정답률이 뜨고, '연습'으로 챕터 집중 연습에 진입한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await submitGrade(page); // 전부 미응답 채점 → 챕터 전부 0%
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    await page.getByTestId("stats-open").click();
    const chapters = page.getByTestId("stats-chapters");
    await expect(chapters).toBeVisible();
    // ISTQB 세트 A는 6개 챕터 전부 출제(공식 청사진 8/6/4/11/9/2).
    await expect(page.getByTestId("stats-chapter-row")).toHaveCount(6);
    // 0%라 전부 약점(빨간) 표시 — 첫 행 기준만 확인.
    await expect(page.getByTestId("stats-chapter-row").first()).toHaveClass(/weak/);

    // 첫 행(가장 약한 챕터)의 '연습' → 통계 닫히고 연습 모드 + 필터 배너.
    const firstName = (await page.locator(".sc-name").first().textContent()) || "";
    await page.getByTestId("chapter-practice-btn").first().click();
    await expect(page.getByTestId("stats-dashboard")).toHaveCount(0);
    const banner = page.getByTestId("chapter-filter-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(firstName.trim());
    await expect(page.locator('.segmented button[data-mode="practice"]')).toHaveAttribute("aria-pressed", "true");
    // 필터가 실제로 적용됨: 팔레트 문항 수 < 40, 배너 표기와 일치.
    const filtered = await page.locator("#questionNav button").count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(40);
    await expect(banner).toContainText(`${filtered}문항`);
    // 전체 보기로 해제하면 40문항으로 복귀.
    await page.getByTestId("chapter-filter-clear").click();
    await expect(page.locator("#questionNav button")).toHaveCount(40);
  });

  test("오답노트는 전 회차 합산 — 최신 회차에서 맞힌 문항도 이전 회차 오답이면 남는다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    // 1회차(시험): 전부 미응답 → 40문항 전부 오답.
    await enterExam(page);
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    // 2회차(랜덤, 같은 세트): 첫 문항만 정답 → 최신 회차 오답 39.
    await modeBtn(page, "랜덤").click();
    await expect(page.locator("#questionStem")).toBeVisible();
    await answerCurrentCorrectly(page, "istqb/sample-a.json");
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    // 최신 회차만 보여주면 39 — 합산이므로 40이어야 한다.
    await page.getByRole("button", { name: "오답 노트" }).click();
    const setBtn = page.getByTestId("wrong-note-set-btn").first();
    await expect(setBtn).toContainText("오답 40");
  });
});
