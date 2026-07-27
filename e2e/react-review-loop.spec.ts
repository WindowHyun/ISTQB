import { test, expect, Page } from "@playwright/test";
import { enterExam, modeBtn, openSet, submitGrade } from "./helpers";

const SET = "ISTQB-FL-V4-A";
const SET_PATH = "istqb/sample-a.json";

// 현재 표시 중인 문항을 데이터 정답으로 맞힌다.
async function answerCurrentCorrectly(page: Page) {
  const data = await (await page.request.get(`/data/${SET_PATH}`)).json();
  const title = (await page.locator("#questionTitle").textContent()) || "";
  const num = parseInt(title.match(/문제 (\d+)/)?.[1] || "0", 10);
  const q = data.questions.find((x: { number: number }) => x.number === num);
  for (const key of q.answer) {
    await page.locator("#options .option")
      .filter({ has: page.locator(".option-key", { hasText: new RegExp(`^${key.toUpperCase()}$`) }) })
      .first().click();
  }
  return num;
}

// "오답 발견 → 보완 → 재측정"의 마지막 단계.
// 종전에는 오답 모드에 채점 경로가 없어(canGrade는 exam·random 한정) 오답을 전부
// 맞혀도 reviewIds가 그대로였다 — 다음에도 같은 목록이 나와 루프가 닫히지 않았다.
test.describe("오답 재풀이 루프", () => {
  test("복습 완료하면 맞힌 문항이 오답 목록에서 빠진다", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    await enterExam(page);
    await submitGrade(page); // 전부 미응답 → 40문항 오답
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    await page.getByRole("button", { name: /오답 다시 풀기|오답 풀기/ }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    const before = await page.locator("#questionNav button").count();
    expect(before).toBe(40);

    // 첫 문항만 정답으로 맞힌다.
    await answerCurrentCorrectly(page);
    const btn = page.getByTestId("complete-review-btn");
    await expect(btn).toBeEnabled();
    await expect(btn).toContainText("1/40");
    await btn.click();

    // 목록이 실제로 줄어든다 — 종전에는 40 그대로였다.
    await expect.poll(() => page.locator("#questionNav button").count()).toBe(before - 1);
  });

  test("복습 진척은 새로고침 후에도 유지된다", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    await enterExam(page);
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await page.getByRole("button", { name: /오답 다시 풀기|오답 풀기/ }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    await answerCurrentCorrectly(page);
    await page.getByTestId("complete-review-btn").click();
    await expect.poll(() => page.locator("#questionNav button").count()).toBe(39);

    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await modeBtn(page, "오답").click();
    // 저장하지 않으면 새로고침마다 복습이 헛일이 된다.
    await expect.poll(() => page.locator("#questionNav button").count()).toBe(39);
  });

  test("맞힌 게 없으면 복습 완료를 누를 수 없다", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    await enterExam(page);
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await page.getByRole("button", { name: /오답 다시 풀기|오답 풀기/ }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("complete-review-btn")).toBeDisabled();
  });

  test("오답노트에는 '복습함'으로 남는다(기록은 지우지 않음)", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    await enterExam(page);
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await page.getByRole("button", { name: /오답 다시 풀기|오답 풀기/ }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    const num = await answerCurrentCorrectly(page);
    await page.getByTestId("complete-review-btn").click();

    await page.getByRole("button", { name: "오답 노트" }).click();
    await page.getByTestId("wrong-note-set-btn").first().click();
    // 틀렸던 사실은 남기고 상태만 구분한다.
    const item = page.getByTestId("wrong-note-item-btn").filter({ hasText: `문제 ${num}` }).first();
    await expect(item).toContainText("복습함");
  });
});
