import { test, expect, Page } from "@playwright/test";
import { openProduct } from "./helpers";

// 퀵 랜덤 — 제품의 전 세트에서 10~20문항을 짧게 푸는 모드.
// 세트 하나에 매이지 않아 setId가 센티넬(QUICK)이라, 세트를 전제하는 기존 경로들이
// 조용히 어긋날 수 있다. 그 지점들을 여기서 고정한다.

async function startQuick(page: Page, product: "ISTQB" | "CSTS", size: string) {
  await openProduct(page, product);
  const select = page.locator("#quickSize");
  // 모바일에서는 사이드바가 드로어라 숨어 있다 — 실사용자와 동일하게 연다.
  if (!(await select.isVisible())) await page.getByTestId("drawer-toggle").click();
  await select.selectOption(size);
  await page.getByTestId("quick-start-btn").click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
}

function readUi(page: Page, product: "istqb" | "csts") {
  const key = product === "csts" ? "csts-fl-v1-sample-ui-state" : "istqb-fl-v4-sample-ui-state";
  return page.evaluate((k: string) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, key);
}

test.describe("퀵 랜덤", () => {
  test("고른 문항 수만큼, 제품의 여러 세트에서 뽑는다", async ({ page }) => {
    await startQuick(page, "CSTS", "10");
    await expect(page.locator("#progressText")).toContainText("/ 10");

    const ui = await readUi(page, "csts");
    expect(ui.mode).toBe("quick");
    const items: { id: string; setId: string }[] = ui.quickDraw.items;
    expect(items).toHaveLength(10);
    // 한 세트에서만 뽑혔다면 '전 세트 출제'가 성립하지 않는다(CSTS는 7세트 440문항이라
    // 10문항이 우연히 한 세트에 몰릴 확률은 무시할 수 있다).
    expect(new Set(items.map((i) => i.setId)).size).toBeGreaterThan(1);
    // 출처 세트가 비면 오답 귀속과 복원이 성립하지 않는다.
    expect(items.every((i) => !!i.setId)).toBe(true);
  });

  // QuestionCard가 답안 키를 독립 조립하던 시절이라면 여기서 진행률이 오르지 않는다.
  test("답을 고르면 진행률이 오른다", async ({ page }) => {
    await startQuick(page, "ISTQB", "10");
    await expect(page.locator("#progressText")).toContainText("0 / 10");
    await page.locator("#options .option").first().click();
    await expect(page.locator("#progressText")).toContainText("1 / 10");
  });

  test("새로고침해도 같은 문항으로 이어 푼다", async ({ page }) => {
    await startQuick(page, "CSTS", "10");
    const before = (await readUi(page, "csts")).quickDraw.items.map((i: { id: string }) => i.id);
    await page.locator("#options .option").first().click();
    await expect(page.locator("#progressText")).toContainText("1 / 10");

    await page.reload();
    // 진입 시 항상 제품 게이트를 먼저 보여주는 것이 이 앱의 사양(#5)이라 다시 고른다 —
    // 제품을 고르는 순간 저장된 진행이 복원된다.
    await openProduct(page, "CSTS");
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    // 답안이 유지된다 = 같은 문항을 같은 키로 보고 있다.
    await expect(page.locator("#progressText")).toContainText("1 / 10");
    const after = (await readUi(page, "csts")).quickDraw.items.map((i: { id: string }) => i.id);
    expect(after).toEqual(before);
  });

  // 사양 변경(B5): 서답형도 퀵에 나온다. 다만 한 회차를 점령하면 '퀵'이 아니므로 30% 상한을 둔다.
  // 종전 검사는 존재하지 않는 셀렉터([data-testid="next-btn"])로 첫 문항에서 바로 빠져나가
  // 20문항을 한 번도 보지 않았다 — 헛돌던 검사를 실제로 도는 것으로 바꾼다.
  test("서답형이 섞이되 30%를 넘지 않는다", async ({ page }) => {
    await startQuick(page, "CSTS", "20");
    let shortAnswers = 0;
    let visited = 0;
    for (let i = 0; i < 20; i += 1) {
      visited += 1;
      if (await page.locator(".short-answer-input").count()) shortAnswers += 1;
      const next = page.locator("#nextBtn");
      if (!(await next.count()) || (await next.isDisabled())) break;
      await next.click();
      await page.waitForTimeout(60);
    }
    // 셀렉터가 어긋나 조기 이탈하면 검사가 무력해진다 — 실제로 20문항을 밟았는지 먼저 본다.
    expect(visited, "20문항을 다 훑지 못했다 — 검사가 무력하다").toBe(20);
    expect(shortAnswers, `20문항 중 서답형 ${shortAnswers}개`).toBeLessThanOrEqual(6);
  });

  test("채점 결과에 합격 판정이 없다 — 10문항에 '기준 미달'은 오해를 만든다", async ({ page }) => {
    await startQuick(page, "ISTQB", "10");
    await page.locator("#options .option").first().click();
    await page.getByTestId("grade-button").click();
    const confirm = page.getByTestId("confirm-grade");
    if (await confirm.count()) await confirm.click();

    const result = page.getByTestId("result-summary");
    await expect(result).toBeVisible({ timeout: 15_000 });
    await expect(result).toContainText("퀵 랜덤");
    await expect(result).not.toContainText("합격 기준 미달");
    await expect(result).not.toContainText("합격 기준 충족");
    // %가 아니라 맞힌 개수로 보여준다.
    await expect(page.getByTestId("result-rate")).toContainText("/ 10문항");
  });

  test("퀵 회차는 요약(응시 횟수·최고 정답률)을 부풀리지 않는다", async ({ page }) => {
    await startQuick(page, "ISTQB", "10");
    // 전 문항 정답을 고를 수 없으므로 첫 보기만 찍고 채점한다 — 요약에 섞이는지만 본다.
    await page.locator("#options .option").first().click();
    await page.getByTestId("grade-button").click();
    const confirm = page.getByTestId("confirm-grade");
    if (await confirm.count()) await confirm.click();
    await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();

    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard")).toBeVisible();
    // 실전 회차가 하나도 없으므로 요약 블록 자체가 뜨지 않아야 한다.
    expect(await page.locator(".stats-summary").count()).toBe(0);
    // 사양 변경: 퀵은 회차 기록을 남기지 않는다 — 짧은 세션 목록에도 나오지 않는다.
    // (오답만 24시간 임시로 오답노트의 퀵 섹션에 남는다: react-quick-wrongnote.spec.ts)
    await expect(page.getByTestId("stats-dashboard")).toContainText("아직 채점한 기록이 없습니다");
  });

    // 영속 계약 — 퀵 회차가 IndexedDB에 어떤 모양으로 남는지. 여기서 하나라도 빠지면
    // 새로고침·백업 복원 뒤에 조용히 망가진다: mode가 exam으로 보정되면 요약을 부풀리고,
    // chapterQuestions가 없으면 챕터 통계에서 빠지고, wrongItems[].setId가 없으면
    // 오답노트가 다시 출처를 잃는다.
  // 퀵의 setId는 센티넬이라 오답 조회가 항상 빈 결과다 — 그대로 두면 방금 여러 문항을
  // 틀린 사용자가 "현재 문제 세트에는 오답이 없습니다"라는 사실과 다른 안내를 받고,
  // 오답 모드로 넘어가지도 못한다(퀵 화면에 그대로 머문다).
  // 사양 변경(B1): 퀵 오답은 세트별 오답 버킷에 넣지 않는다 — 세트를 다 풀지도 않았는데
  // 그 세트의 오답 모드가 퀵 결과로 오염된다. 퀵만 푼 상태에서는 재풀이 대상이 없어야 한다.
  test("퀵은 세트의 '오답 다시 풀기' 대상을 만들지 않는다", async ({ page }) => {
    await startQuick(page, "ISTQB", "10");
    for (let i = 0; i < 10; i += 1) {
      const o = page.locator("#options .option").first();
      if (await o.count()) await o.click();
      const n = page.locator("#nextBtn");
      if (!(await n.count()) || (await n.isDisabled())) break;
      await n.click();
    }
    await page.getByTestId("grade-button").click();
    const confirm = page.getByTestId("confirm-grade");
    if (await confirm.count()) await confirm.click();
    await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();

    // 저장된 오답 버킷(reviewIds)이 비어 있어야 한다 — 퀵이 세트 오답을 만들지 않는다.
    const reviewCount = await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) {
        if (!k.endsWith("-ui-state")) continue;
        const ui = JSON.parse(localStorage.getItem(k) || "{}");
        return Object.values(ui.reviewIds ?? {}).reduce((n: number, v) => n + (v as string[]).length, 0);
      }
      return -1;
    });
    expect(reviewCount, "퀵 오답이 세트 오답 버킷으로 새어 들어갔다").toBe(0);
  });


});
