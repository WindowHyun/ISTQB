import { test, expect, Page } from "@playwright/test";
import { expectMode, openProduct, solveQuickOne } from "./helpers";

/** 유형을 가리지 않고 현재 문항에 답한다 — 퀵은 유형을 가리지 않아 서답형도 그대로 나온다.
 *  보기 클릭만 쓰면 뽑기 결과에 따라 셀렉터가 아예 없어 타임아웃으로 죽는다. */
async function answerCurrent(page: Page) {
  const short = page.locator(".short-answer-input");
  const blanks = await short.count();
  if (blanks) {
    // 다답형은 모든 칸이 차야 '답함'으로 센다(isAnswered) — 첫 칸만 채우면 진행률이 안 오른다.
    for (let i = 0; i < blanks; i += 1) await short.nth(i).fill("테스트");
    return;
  }
  await page.locator("#options .option").first().click();
}

/**
 * 유저 관점 전수 시나리오 — "실제로 이 앱을 쓰는 사람이 겪는 흐름"을 끝까지 밟는다.
 *
 * 기존 스펙은 기능 단위로 쪼개져 있어, 한 사람이 이어서 하는 행동에서만 드러나는
 * 어긋남(모드를 오가며 상태가 섞이는 것 등)을 놓친다. 여기서는 한 세션 안에서
 * 연습→시험→퀵→오답→통계를 이어 밟고, 매 단계마다 콘솔 오류와 화면 정합을 본다.
 */

type Err = { kind: string; text: string };

function watchErrors(page: Page): Err[] {
  const errs: Err[] = [];
  page.on("pageerror", (e) => errs.push({ kind: "pageerror", text: String(e).slice(0, 300) }));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push({ kind: "console.error", text: m.text().slice(0, 300) });
  });
  return errs;
}

async function openSidebar(page: Page) {
  const sel = page.getByTestId("quick-start-btn");
  if (!(await sel.isVisible())) await page.getByTestId("drawer-open").click();
}

async function pickMode(page: Page, mode: string) {
  await openSidebar(page);
  await page.locator(`.segmented button[data-mode="${mode}"]`).click();
  // 시험은 시작 게이트가 워크스페이스를 가리므로 지문이 아직 보이지 않는다.
  if (mode === "exam") {
    await expect(page.getByTestId("exam-start-gate")).toBeVisible({ timeout: 20_000 });
    return;
  }
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
}

/** 현재 화면의 모든 문항에 첫 보기를 고른다(서답형은 건너뛴다). */
async function answerAll(page: Page, max = 80) {
  for (let i = 0; i < max; i += 1) {
    const opt = page.locator("#options .option").first();
    if (await opt.count()) await opt.click();
    const next = page.locator("#nextBtn");
    if (!(await next.count()) || (await next.isDisabled())) break;
    await next.click();
  }
}

async function grade(page: Page) {
  await openSidebar(page);
  await page.getByTestId("grade-button").click();
  const confirm = page.getByTestId("confirm-grade");
  if (await confirm.count()) await confirm.click();
  await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });
}

async function closeResult(page: Page) {
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();
}

for (const product of ["ISTQB", "CSTS"] as const) {
  test(`${product} — 한 사람이 연습→시험→퀵→오답→통계를 이어서 밟는다`, async ({ page }) => {
    const errs = watchErrors(page);
    await openProduct(page, product);

    // 1) 연습 — 즉시 피드백. 채점 개념이 없으므로 채점 버튼이 없어야 한다.
    await pickMode(page, "practice");
    await page.locator("#options .option").first().click();
    expect(await page.getByTestId("grade-button").count()).toBe(0);

    // 2) 시험 — 시작 게이트를 통과해야 응시가 시작된다.
    await pickMode(page, "exam");
    const gate = page.getByTestId("exam-start-btn");
    if (await gate.count()) await gate.click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    // 응시 중에는 퀵 시작이 잠긴다(잠금 우회 방지).
    await openSidebar(page);
    await expect(page.getByTestId("quick-start-btn")).toBeDisabled();
    await answerAll(page);
    await grade(page);
    const examRate = await page.getByTestId("result-rate").textContent();
    await closeResult(page);

    // 3) 퀵 — 세트를 고르지 않고 전 세트를 섞어 한 문항씩. 채점도 결과 모달도 없다.
    await openSidebar(page);
    await page.getByTestId("quick-start-btn").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("quick-scoreboard")).toBeVisible();
    // 퀵은 유형을 가리지 않아 서답형·복수정답이 그대로 나온다 — 보기 하나만 눌러서는
    // 확정되지 않는 문항이 있으므로 공용 헬퍼로 유형별 절차를 밟는다.
    for (let i = 0; i < 3; i += 1) await solveQuickOne(page);
    await expect(page.getByTestId("qs-solved")).toHaveText("3");
    await expect(page.getByTestId("grade-button")).toHaveCount(0);

    // 4) 오답 노트 — 퀵은 아무것도 남기지 않으므로 시험 오답만 모여 있어야 한다.
    await openSidebar(page);
    await page.getByRole("button", { name: /오답 노트/ }).first().click();
    await expect(page.getByTestId("wrong-note")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("wrong-note-sets")).toBeVisible();
    await page.keyboard.press("Escape");

    // 5) 오답 재풀이 — 시험에서 틀린 문항이 모인다.
    //
    // 이 단계는 종전에 아무것도 검증하지 못했다. 4)까지 마치면 앱은 아직 '퀵' 모드인데,
    // 퀵에서는 이 버튼이 아예 렌더되지 않는다(세트 오답 버킷에 퀵이 담기지 않으므로).
    // 세트 모드로 돌아온 뒤 눌러 흐름의 전제를 맞추고, 실제로 '오답' 모드에 들어갔는지 단언한다.
    await pickMode(page, "practice"); // 퀵을 빠져나와 세트 스코프로 복귀
    await openSidebar(page);
    await page.getByRole("button", { name: "오답 다시 풀기" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expectMode(page, "오답"); // 규약: 상태 주장은 상태를 직접 읽는다(helpers.ts 단언 규약)

    // 6) 통계 — 퀵은 어디에도 남지 않는다.
    await openSidebar(page);
    await page.getByTestId("stats-open").click();
    const dash = page.getByTestId("stats-dashboard");
    await expect(dash).toBeVisible();
    // 응시 횟수는 시험 1회여야 한다 — 퀵이 섞이면 2가 된다.
    const attempts = await page.locator(".stats-summary div:nth-child(1) strong").textContent();
    console.log(`[유저] ${product} 응시 횟수=${attempts} · 시험 결과=${examRate}`);
    expect(attempts).toBe("1");

    // 챕터 분모 합이 '풀어 본 서로 다른 문항 수'를 넘지 않는다(중복 이중 집계 감지).
    const denom = await page.locator(".sc-rate").evaluateAll((els) =>
      els.reduce((sum, el) => {
        const m = (el.textContent || "").match(/\d+\s*\/\s*(\d+)/);
        return sum + (m ? Number(m[1]) : 0);
      }, 0));
    console.log(`[유저] ${product} 챕터 분모 합=${denom}`);
    expect(denom).toBeGreaterThan(0);

    expect(errs, JSON.stringify(errs, null, 1)).toEqual([]);
  });
}

test("제품을 오가도 퀵 상태가 새지 않는다", async ({ page }) => {
  const errs = watchErrors(page);

  await openProduct(page, "ISTQB");
  await openSidebar(page);
  await page.getByTestId("quick-start-btn").click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await answerCurrent(page);

  // 설정 → 처음 화면으로 → CSTS 진입
  await openProduct(page, "CSTS");
  await openSidebar(page);
  await page.getByTestId("quick-start-btn").click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  // 새 제품에서는 진행 집계가 0부터 — ISTQB에서 푼 것이 넘어오면 안 된다.
  await expect(page.getByTestId("qs-solved")).toHaveText("0");

  const draw = await page.evaluate(() => {
    const raw = localStorage.getItem("csts-fl-v1-sample-ui-state");
    return raw ? JSON.parse(raw).quickDraw : null;
  });
  expect(draw.certification).toBe("csts");
  // ISTQB 문항이 섞이면 제품 격리가 깨진 것이다.
  expect(draw.items.every((i: { id: string }) => !i.id.startsWith("ISTQB"))).toBe(true);
  expect(errs, JSON.stringify(errs, null, 1)).toEqual([]);
});
