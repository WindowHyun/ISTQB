import { test, expect, Page } from "@playwright/test";
import { openProduct, openSet, modeBtn, submitGrade, closeResult, enterExam } from "./helpers";

/**
 * 4지선다 — 현재 세트에서 **보기가 4개인 문항만** 골라 섞어 내고 채점하는 모드.
 *
 * 시험과 세트 스코프를 공유하지만 표본이 다르다(진위형·서답형·5지선다가 빠진다).
 * 그래서 확인해야 하는 것도 둘로 갈린다.
 *  1) 약속한 것만 나오는가 — 보기 4개짜리만, 원본과 다른 순서로.
 *  2) 채점이 있는 모드의 규칙을 그대로 따르는가 — 채점 전 비공개, 회차 기록,
 *     오답이 오답 모드로, 새로고침 뒤 재채점 금지.
 *
 * 특히 4번은 시험에만 있던 가드를 모드 전체로 넓힌 자리라, 여기서 고정하지 않으면
 * "새로고침 한 번에 같은 답안이 회차로 두 번 쌓이는" 상태로 돌아간다.
 */

const A = "ISTQB-FL-V4-A"; // 40문항 중 보기 4개짜리 38

/** 모드 진입 — 세그먼트는 드로어 안일 수 있으므로 실사용자와 같은 경로로 연다. */
async function enterChoice(page: Page) {
  const btn = modeBtn(page, "4지선다");
  if (!(await btn.isVisible())) await page.getByTestId("drawer-open").click();
  await btn.click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
}

/** 팔레트에 뜬 문항 번호 — 출제 순서를 그대로 읽는 창이다. */
async function order(page: Page): Promise<string[]> {
  const nav = page.locator("#questionNav button");
  await expect(nav.first()).toBeVisible({ timeout: 20_000 });
  return nav.allInnerTexts();
}

async function totalOf(page: Page): Promise<number> {
  const text = (await page.locator("#progressText").innerText()) ?? "";
  return Number(text.match(/\/\s*(\d+)/)?.[1] ?? 0);
}

test.describe("4지선다 — 무엇이 나오는가", () => {
  test("보기 4개짜리만 나온다 — 진위형·서답형·5지선다는 빠진다", async ({ page }) => {
    // CSTS 2402는 70문항 중 50문항만 보기 4개다(나머지는 진위형·서답형).
    // 그 차이가 화면에 그대로 드러나야 이 모드가 이름값을 한다.
    await openSet(page, "CSTS", "CSTS-FL-2402");
    const setTotal = await totalOf(page);
    await enterChoice(page);
    const choiceTotal = await totalOf(page);
    expect(choiceTotal, "세트 전체가 그대로 나왔다 — 거르지 않았다").toBeLessThan(setTotal);
    expect(choiceTotal).toBeGreaterThan(0);

    // 표본으로 몇 문항을 넘겨 보며 보기 수를 확인한다 — 하나라도 4개가 아니면 약속이 깨진다.
    for (let i = 0; i < 5; i += 1) {
      await expect(
        page.locator("#options .option"),
        "보기가 4개가 아닌 문항이 나왔다",
      ).toHaveCount(4);
      await page.locator("#nextBtn").click();
    }
  });

  test("원본 세트 순서가 아니라 섞여서 나온다", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    await enterChoice(page);
    const nums = (await order(page)).map(Number);
    const sorted = [...nums].sort((a, b) => a - b);
    expect(nums, "번호가 오름차순 그대로다 — 섞이지 않았다").not.toEqual(sorted);
    // 섞였을 뿐 빠지거나 늘지 않았다.
    expect(new Set(nums).size).toBe(nums.length);
  });

  test("새로고침해도 같은 순서로 이어푼다", async ({ page }) => {
    // 매번 다시 섞으면 답안은 문항 id로 남는데 순서와 커서만 어긋나,
    // 사용자에겐 "풀던 자리가 사라진" 것으로 보인다(폐지된 랜덤 모드가 겪은 문제다).
    await openSet(page, "ISTQB", A);
    await enterChoice(page);
    const before = await order(page);
    await page.waitForTimeout(900); // 저장 디바운스

    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).first().click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    expect(await order(page), "새로고침에 출제 순서가 다시 섞였다").toEqual(before);
  });

  test("답안을 초기화하면(새 회차) 새로 섞인다", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    await enterChoice(page);
    const before = await order(page);

    await page.locator(".settings-open-btn").nth(1).click();
    await page.getByText("현재 모드 답안 초기화").click();
    await page.getByTestId("confirm-reset-yes").click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(async () => (await order(page)).join(","), { timeout: 10_000 })
      .not.toBe(before.join(","));
  });
});

test.describe("4지선다 — 채점 모드의 규칙을 따른다", () => {
  test("채점 전에는 정답이 공개되지 않고, 채점하면 열린다", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    await enterChoice(page);
    await page.locator("#options .option").first().click();
    await expect(page.locator("#feedback"), "채점 전에 해설이 열렸다").toHaveCount(0);

    await submitGrade(page);
    await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });
    await closeResult(page);
    await expect(page.locator("#feedback")).toBeVisible();
    // 채점 후에는 보기가 잠긴다(시험과 같은 규칙).
    await expect(page.locator("#options .option").first()).toBeDisabled();
  });

  test("채점하면 회차가 통계에 '4지선다'로 쌓인다", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    await enterChoice(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await closeResult(page);

    await page.getByTestId("stats-open").click();
    const stats = page.getByTestId("stats-dashboard");
    await expect(stats).toBeVisible({ timeout: 20_000 });
    // 모드 이름이 없으면 타임라인에 모드 id('choice')가 영문으로 그대로 노출된다.
    await expect(stats, "회차가 기록되지 않았거나 모드 라벨이 없다").toContainText("4지선다");
  });

  test("합격 가늠(요약)에는 들어가지 않고, 회차 이력에는 남는다", async ({ page }) => {
    // CSTS에서 4지선다 50문항은 100점 중 정확히 75점 — 합격선과 같은 몫이다.
    // 요약에 섞이면 90%(=67.5점, 불합격)가 '합격 기준 75%' 배너 바로 아래에서
    // 합격 신호로 읽힌다. 그래서 요약은 시험 회차만, 이력은 모드별로 전부 보여준다.
    await openSet(page, "ISTQB", A);
    await enterChoice(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await closeResult(page);

    await page.getByTestId("stats-open").click();
    const stats = page.getByTestId("stats-dashboard");
    await expect(stats).toBeVisible({ timeout: 20_000 });
    // 시험 회차가 하나도 없으므로 요약 블록 자체가 뜨지 않고, 그 이유를 밝힌다.
    await expect(page.getByTestId("stats-summary-note"), "4지선다가 합격 가늠에 섞였다")
      .toHaveCount(0);
    await expect(page.getByTestId("stats-gauge-empty"), "요약이 이유 없이 비어 있다")
      .toBeVisible();
    // 회차는 타임라인에 그대로 남아 있어야 한다 — 여기서까지 빠지면 '기록된다'가 거짓이 된다.
    await expect(page.getByTestId("stats-set-timeline")).toContainText("4지선다");
    await page.keyboard.press("Escape");

    // 시험을 한 번 채점하면 요약이 나타나고, 그 숫자는 시험 회차만 센다.
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await closeResult(page);
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-summary-note")).toBeVisible();
    await expect(page.getByTestId("stats-gauge-empty")).toHaveCount(0);
    await expect(
      stats.locator(".stats-summary"),
      "요약이 4지선다 회차까지 세고 있다(응시 1회여야 한다)",
    ).toContainText("1");
  });

  test("여기서 틀린 문항은 오답 모드로 출제된다", async ({ page }) => {
    // 채점이 있는데 오답 대상에서 빠지면, 그 오답이 오답 노트에는 보이는데
    // 오답 모드에는 나오지 않는다 — 이 저장소가 여러 번 고친 불일치다.
    await openSet(page, "ISTQB", A);
    await enterChoice(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await closeResult(page);

    await modeBtn(page, "오답").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    expect(await totalOf(page), "4지선다 오답이 오답 모드에 오지 않았다").toBeGreaterThan(0);
  });

  test("채점 후 새로고침하면 같은 답안을 다시 채점할 수 없다", async ({ page }) => {
    // graded는 비영속이라 새로고침 뒤 미채점처럼 보인다 — 가드가 없으면 같은 답안이
    // 회차로 두 번 쌓인다. 시험에만 있던 가드를 채점 모드 전체로 넓힌 자리다.
    await openSet(page, "ISTQB", A);
    await enterChoice(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await closeResult(page);
    await page.waitForTimeout(900);

    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).first().click();
    await expect(page.getByTestId("graded-resume-modal"), "중복 채점 가드가 뜨지 않았다")
      .toBeVisible({ timeout: 20_000 });
    // 안내를 닫아도 채점 버튼은 다시 나타나지 않는다(이미 채점한 회차다).
    await page.getByTestId("graded-resume-view").click();
    await closeResult(page);
    await expect(page.getByTestId("grade-button")).toHaveCount(0);
  });
});

test.describe("4지선다 — 다른 모드와 섞이지 않는다", () => {
  test("시험 답안과 서로를 덮지 않는다 — 모드마다 답안 키가 갈린다", async ({ page }) => {
    await openSet(page, "ISTQB", A);
    await enterChoice(page);
    await page.locator("#options .option").first().click();
    await expect(page.locator("#progressText")).toContainText("1 /");

    await modeBtn(page, "연습").click();
    await expect(page.locator("#progressText"), "연습에 4지선다 답안이 새어 들어왔다")
      .toContainText("0 /");

    await enterChoice(page);
    await expect(page.locator("#progressText"), "돌아왔더니 4지선다 답안이 사라졌다")
      .toContainText("1 /");
  });

  test("모드 캡션이 표본이 다르다는 것을 밝힌다", async ({ page }) => {
    // 같은 세트인데 문항 수가 적어 보이는 이유이고, 정답률을 시험 회차와 나란히
    // 비교하면 안 되는 이유이기도 하다 — 화면에서 말하지 않으면 알 방법이 없다.
    await openProduct(page, "ISTQB");
    await enterChoice(page);
    const caption = page.getByTestId("mode-caption");
    await expect(caption).toContainText("보기 4개");
    await expect(caption).toContainText("기록");
  });
});
