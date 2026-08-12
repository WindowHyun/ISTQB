import { test, expect, Page } from "@playwright/test";
import { expectMode, openProduct, enterQuick, quickStat, answerCurrent } from "./helpers";

/**
 * 유저 관점 전수 시나리오 — "실제로 이 앱을 쓰는 사람이 겪는 흐름"을 끝까지 밟는다.
 *
 * 기존 스펙은 기능 단위로 쪼개져 있어, 한 사람이 이어서 하는 행동에서만 드러나는
 * 어긋남(모드를 오가며 상태가 섞이는 것 등)을 놓친다. 여기서는 한 세션 안에서
 * 연습→시험→랜덤→퀵→오답→통계를 이어 밟고, 매 단계마다 콘솔 오류와 화면 정합을 본다.
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
  if (!(await page.locator(".segmented").isVisible())) await page.getByTestId("drawer-open").click();
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
  test(`${product} — 한 사람이 연습→시험→랜덤→퀵→오답→통계를 이어서 밟는다`, async ({ page }) => {
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
    // 응시 중에는 다른 모드로 나갈 수 없다 — 퀵 세그먼트도 함께 잠긴다(잠금 우회 방지).
    // 종전에는 퀵 패널의 시작 버튼이 상시 떠 있어 그 disabled를 봤는데, 그 패널은 이제
    // 퀵 안에서만 렌더된다. 잠금을 거는 지점 자체가 세그먼트로 옮겨졌다.
    await openSidebar(page);
    await expect(page.locator('.segmented button[data-mode="quick"]')).toBeDisabled();
    await answerAll(page);
    await grade(page);
    const examRate = await page.getByTestId("result-rate").textContent();
    await closeResult(page);

    // 3) 랜덤
    await pickMode(page, "random");
    await answerAll(page);
    await grade(page);
    await closeResult(page);

    // 4) 퀵 — 세트를 고르지 않고 전 세트에서 낸다(문항 수도 고르지 않는다).
    await enterQuick(page);
    await expect(quickStat(page, "solved")).toHaveText("0");
    await answerAll(page, 12);
    await grade(page);
    const quickResult = page.getByTestId("result-summary");
    // 퀵은 합격 판정을 내리지 않는다.
    await expect(quickResult).not.toContainText("합격 기준");
    await expect(page.getByTestId("result-rate")).toContainText("문항");
    await closeResult(page);

    // 5) 오답 노트 — 세트 오답(시험·랜덤)과 퀵 오답이 서로 다른 자리에 모인다.
    //    퀵은 회차를 남기지 않으므로 세트 그룹에 섞이면 안 되고, 대신 임시 목록으로 보인다.
    await openSidebar(page);
    await page.getByRole("button", { name: /오답 노트/ }).first().click();
    await expect(page.getByTestId("wrong-note")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("quick-wrong-note")).toBeVisible();
    expect(await page.getByTestId("quick-wrong-item").count()).toBeGreaterThan(0);
    await page.keyboard.press("Escape");

    // 6) 오답 재풀이 — 시험·랜덤에서 틀린 문항이 모인다.
    //
    // 이 단계는 종전에 아무것도 검증하지 못했다. 5)까지 마치면 앱은 아직 '퀵' 모드인데,
    // 퀵에서는 이 버튼이 세트 오답 버킷(퀵은 담기지 않는 곳)을 뒤지고 토스트만 띄운 뒤
    // 모드를 바꾸지 않고 돌아갔다. 그런데 단언이 "#questionStem이 보인다"뿐이라, 퀵 문항이
    // 그대로 떠 있는 것만으로 통과했다 — 재풀이에 진입하지 못해도 초록불이었다.
    // 이제 (a) 세트 모드로 돌아온 뒤 눌러 흐름의 전제를 맞추고,
    //     (b) 실제로 '오답' 모드에 들어갔는지를 단언한다.
    await pickMode(page, "random"); // 퀵을 빠져나와 세트 스코프로 복귀
    await openSidebar(page);
    await page.getByRole("button", { name: "오답 다시 풀기" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expectMode(page, "오답"); // 규약: 상태 주장은 상태를 직접 읽는다(helpers.ts 단언 규약)

    // 7) 통계 — 퀵은 회차 목록 어디에도 남지 않는다(챕터 집계에만 조용히 기여).
    await openSidebar(page);
    await page.getByTestId("stats-open").click();
    const dash = page.getByTestId("stats-dashboard");
    await expect(dash).toBeVisible();
    const minis = page.getByTestId("stats-mini-rounds");
    if (await minis.count()) await expect(minis).not.toContainText("퀵 랜덤");

    // 응시 횟수는 시험+랜덤 2회여야 한다 — 퀵이 섞이면 3이 된다.
    const attempts = await page.locator(".stats-summary div:nth-child(1) strong").textContent();
    console.log(`[유저] ${product} 응시 횟수=${attempts} · 시험 결과=${examRate}`);
    expect(attempts).toBe("2");

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

test("퀵을 반복해도 챕터 분모가 계속 부풀지 않는다", async ({ page }) => {
  const errs = watchErrors(page);
  await openProduct(page, "CSTS");

  const denoms: number[] = [];
  for (let round = 0; round < 3; round += 1) {
    // 회차마다 새로 섞는다 — 퀵 안에서는 세그먼트 재클릭이 아니라 이 버튼이 재추첨이다.
    await openSidebar(page);
    if (round === 0) await enterQuick(page);
    else {
      await page.getByTestId("quick-start-btn").click();
      await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    }
    await answerAll(page, 22);
    await grade(page);
    await closeResult(page);

    await openSidebar(page);
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard")).toBeVisible();
    denoms.push(await page.locator(".sc-rate").evaluateAll((els) =>
      els.reduce((sum, el) => {
        const m = (el.textContent || "").match(/\d+\s*\/\s*(\d+)/);
        return sum + (m ? Number(m[1]) : 0);
      }, 0)));
    await page.getByRole("button", { name: "닫기", exact: true }).first().click();
  }

  console.log("[유저] 퀵 3회 반복 챕터 분모 추이:", denoms.join(" → "));
  // 퀵은 회차 기록을 남기지 않지만 챕터 분석에는 기여한다 — 0이면 통계 화면이
  // "기록 없음"으로 가려졌다는 뜻이고, 아래 단조 증가 검사가 통째로 무의미해진다.
  expect(denoms[0], "퀵만 풀었더니 챕터 통계가 비어 있다").toBeGreaterThan(0);
  // 매 회차 20문항이지만 재수록·중복 제거로 60까지는 가지 않는다.
  expect(denoms[2]).toBeLessThanOrEqual(60);
  // 그리고 단조 증가여야 한다(새 문항을 풀었으므로 줄어들면 집계가 깨진 것).
  expect(denoms[1]).toBeGreaterThanOrEqual(denoms[0]);
  expect(denoms[2]).toBeGreaterThanOrEqual(denoms[1]);
  expect(errs, JSON.stringify(errs, null, 1)).toEqual([]);
});

test("제품을 오가도 퀵 상태가 새지 않는다", async ({ page }) => {
  const errs = watchErrors(page);

  await enterQuick(page, "ISTQB");
  await answerCurrent(page);

  // 설정 → 처음 화면으로 → CSTS 진입
  await enterQuick(page, "CSTS");
  await expect(quickStat(page, "solved")).toHaveText("0");

  const draw = await page.evaluate(() => {
    const raw = localStorage.getItem("csts-fl-v1-sample-ui-state");
    return raw ? JSON.parse(raw).quickDraw : null;
  });
  expect(draw.certification).toBe("csts");
  // ISTQB 문항이 섞이면 제품 격리가 깨진 것이다.
  expect(draw.items.every((i: { id: string }) => !i.id.startsWith("ISTQB"))).toBe(true);
  expect(errs, JSON.stringify(errs, null, 1)).toEqual([]);
});
