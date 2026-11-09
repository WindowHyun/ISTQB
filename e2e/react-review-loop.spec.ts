import { test, expect, Page } from "./fixtures";
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

  // 사이드바 가드가 '다시 풀 문항 수'(복습 완료를 뺀 실제 출제 수)로 판정하는지 — 예전에는 오답 기록의
  // 유무만 봐서, 모두 복습을 마친 세트에서도 진입 처리를 하고 빈 오답 화면으로 갔다(R-10).
  test("오답을 모두 복습 완료했으면 사이드바 '오답 다시 풀기'는 안내만 하고 모드를 바꾸지 않는다", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    await enterExam(page);
    await submitGrade(page); // 전부 미응답 → 40문항 오답
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    // 저장을 확정시킨 뒤 '복습 완료' 목록을 40문항 전부로 채운다(40번의 풀이를 흉내낸다).
    await page.goto("/");
    await page.evaluate((setId: string) => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        const raw = localStorage.getItem(k);
        if (!raw || !raw.includes("reviewIds")) continue;
        const o = JSON.parse(raw);
        const target = o.reviewIds ? o : o.uiState;
        if (!target?.reviewIds) continue;
        target.reviewedOk = { ...(target.reviewedOk ?? {}), [setId]: Array.from({ length: 40 }, (_, n) => n + 1) };
        localStorage.setItem(k, JSON.stringify(o));
      }
    }, SET);

    await page.getByRole("button", { name: "ISTQB" }).click();
    // 채점이 끝난 시험은 시작 게이트로 복원된다 — 문항 본문이 아니라 사이드바 버튼을 기다린다.
    const retry = page.getByRole("button", { name: /오답 다시 풀기|오답 풀기/ });
    await expect(retry).toBeVisible({ timeout: 20_000 });
    const modeBefore = await page.locator(".workspace").getAttribute("data-list-mode");
    await retry.click();
    await expect(page.getByText("이 세트의 오답은 모두 복습을 마쳤습니다.")).toBeVisible();
    await expect(page.locator(".workspace")).toHaveAttribute("data-list-mode", modeBefore ?? "exam");
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
