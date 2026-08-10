import { test, expect } from "@playwright/test";
import { openProduct, startQuick, answerQuick, solveQuickOne, modeBtn } from "./helpers";

/**
 * 퀵 — 제품의 전 세트를 섞어 한 문항씩 무한으로 푸는 모드(구 '랜덤'을 흡수했다).
 *
 * 사양의 뼈대는 넷이다.
 *  1) 풀면 바로 정답·해설이 보인다(채점 단계 없음).
 *  2) '다음 문제'로만 넘어간다 — 되돌아갈 수 없고 문항 목록도 없다.
 *  3) 진행·정답·오답·연속 정답을 상시 보여준다(진행률·타이머 없음).
 *  4) 아무 기록도 남지 않는다 — 회차 이력·요약·타임라인·오답 노트 어디에도.
 *
 * setId가 센티넬(QUICK)이라 세트를 전제하는 경로가 조용히 어긋날 수 있다 — 그 지점들도 함께 고정한다.
 */

test.describe("퀵 — 진입과 기본 흐름", () => {
  test("시작하면 문항이 뜨고, 답하면 바로 정답·해설이 열린다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    // 채점 전 공개가 없는 시험과 달리, 퀵은 고르는 즉시 피드백이다.
    await expect(page.locator("#feedback")).toHaveCount(0);
    await answerQuick(page);
    await expect(page.locator("#feedback")).toBeVisible();
  });

  test("답을 확인하기 전에는 '다음 문제'가 잠겨 있다", async ({ page }) => {
    // 확인 없이 넘기면 그 문항이 집계에서 빠져 "진행 3인데 정답+오답은 2"가 된다.
    await startQuick(page, "ISTQB");
    const next = page.getByTestId("quick-next-btn");
    await expect(next).toBeDisabled();
    await answerQuick(page);
    await expect(next).toBeEnabled();
  });

  test("확인한 문항은 잠긴다 — 답을 바꿔 집계를 흔들 수 없다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    await answerQuick(page);
    const opts = page.locator("#options .option");
    if (await opts.count()) await expect(opts.first()).toBeDisabled();
  });

  test("'다음 문제'를 누르면 새 문항으로 넘어간다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    const stem = () => page.locator("#questionStem").innerText();
    const first = await stem();
    await solveQuickOne(page);
    await expect(page.locator("#feedback")).toHaveCount(0); // 새 문항은 미공개 상태
    expect(await stem(), "같은 문항이 다시 떴다").not.toBe(first);
  });

  test("채점 버튼과 결과 요약이 없다 — 회차라는 단위가 없는 모드다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    await expect(page.getByTestId("grade-button")).toHaveCount(0);
    await expect(page.getByTestId("grade-button-m")).toHaveCount(0);
    await expect(page.getByTestId("result-open")).toHaveCount(0);
  });
});

test.describe("퀵 — 점수판", () => {
  test("진행·정답·오답·연속을 보여주고 풀 때마다 오른다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    const board = page.getByTestId("quick-scoreboard");
    await expect(board).toBeVisible();
    await expect(page.getByTestId("qs-solved")).toHaveText("0");

    await answerQuick(page);
    await expect(page.getByTestId("qs-solved")).toHaveText("1");
    // 정답이든 오답이든 둘 중 하나는 1이 된다(합이 진행과 같다).
    const correct = Number(await page.getByTestId("qs-correct").innerText());
    const wrong = Number(await page.getByTestId("qs-wrong").innerText());
    expect(correct + wrong).toBe(1);
    // 맞혔으면 연속이 1, 틀렸으면 0으로 끊긴다.
    await expect(page.getByTestId("qs-streak")).toHaveText(correct === 1 ? "1" : "0");
  });

  test("세 문항을 풀면 진행이 3이고 정답+오답과 맞는다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    for (let i = 0; i < 3; i += 1) await solveQuickOne(page);
    await expect(page.getByTestId("qs-solved")).toHaveText("3");
    const correct = Number(await page.getByTestId("qs-correct").innerText());
    const wrong = Number(await page.getByTestId("qs-wrong").innerText());
    expect(correct + wrong, "진행과 정답+오답이 어긋난다").toBe(3);
  });

  test("새로고침해도 진행 집계와 위치가 유지된다", async ({ page }) => {
    // 집계는 답안에서 파생하므로 화면 상태가 날아가도 수치가 흔들리면 안 된다.
    await startQuick(page, "ISTQB");
    for (let i = 0; i < 2; i += 1) await solveQuickOne(page);
    const before = await page.getByTestId("qs-solved").innerText();

    await page.reload();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("qs-solved")).toHaveText(before);
  });
});

test.describe("퀵 — 없어진 것들", () => {
  test("타이머가 없다", async ({ page }) => {
    // 기록을 남기지 않는 모드라 시간을 잴 이유가 없다.
    await startQuick(page, "ISTQB");
    await expect(page.locator("#timerText")).toHaveCount(0);
  });

  test("문항 목록·점프 진입로가 없다", async ({ page }) => {
    // 목록은 "정해진 N문항 중 어디쯤인가"를 위한 장치인데 퀵에는 그 N이 없다.
    await startQuick(page, "ISTQB");
    await expect(page.locator(".palette-block")).toHaveCount(0);
    await expect(page.getByTestId("palette-jump-btn")).toHaveCount(0);
    await expect(page.getByTestId("jump-pin")).toHaveCount(0);
  });

  test("이전 문제로 돌아가는 버튼이 없다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    await expect(page.locator("#prevBtn")).toHaveCount(0);
    await expect(page.locator("#nextBtn")).toHaveCount(0);
  });

  test("사이드바 진행/시간 줄이 숨는다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    await expect(page.locator("#progressText")).toHaveCount(0);
  });

  test("문항 수 선택이 없다 — 끝이 정해지지 않은 모드다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await expect(page.locator("#quickSize")).toHaveCount(0);
  });

  test("모드 세그먼트에 '랜덤'이 없다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await expect(page.locator('.segmented button[data-mode="random"]')).toHaveCount(0);
    for (const label of ["연습", "시험", "오답"]) {
      await expect(modeBtn(page, label)).toBeVisible();
    }
  });
});

test.describe("퀵 — 기록을 남기지 않는다", () => {
  test("여러 문항을 풀어도 학습 통계에 회차가 쌓이지 않는다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    for (let i = 0; i < 3; i += 1) await solveQuickOne(page);

    await page.getByTestId("stats-open").click();
    // 회차가 하나도 없을 때의 빈 안내가 그대로여야 한다.
    await expect(page.getByTestId("stats-dashboard")).toContainText("아직 채점한 기록이 없습니다");
  });

  test("퀵 오답은 오답 노트에 들어가지 않는다", async ({ page }) => {
    // 세트를 다 푼 것이 아니므로 세트 오답 버킷에 섞이면 안 된다.
    await startQuick(page, "ISTQB");
    for (let i = 0; i < 3; i += 1) await solveQuickOne(page);

    await page.getByRole("button", { name: /오답 노트/ }).first().click();
    await expect(page.getByTestId("wrong-note")).toContainText("표시할 오답이 없습니다");
  });

  test("퀵에서는 '오답 다시 풀기' 버튼을 내린다", async ({ page }) => {
    // 퀵 오답은 세트 버킷에 담기지 않아 다시 풀 대상이 구조적으로 없다.
    await startQuick(page, "ISTQB");
    await expect(page.getByRole("button", { name: "오답 다시 풀기" })).toHaveCount(0);
  });
});

test.describe("퀵 — 세트 센티넬의 파급", () => {
  test("퀵 중에는 세트를 바꿀 수 없고 이유를 밝힌다", async ({ page }) => {
    // 바꿔도 출제는 그대로인데 답안 키가 어긋나 진행이 통째로 사라진다.
    await startQuick(page, "ISTQB");
    await expect(page.getByTestId("set-select")).toBeDisabled();
    await expect(page.getByTestId("quick-set-lock-hint")).toBeVisible();
  });

  test("다른 모드로 나가면 세트 선택이 다시 열린다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    await modeBtn(page, "연습").click();
    await expect(page.getByTestId("set-select")).toBeEnabled();
  });

  test("'다시 섞어 시작'은 진행을 처음부터 되돌린다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    for (let i = 0; i < 2; i += 1) await solveQuickOne(page);
    await expect(page.getByTestId("qs-solved")).toHaveText("2");

    const restart = page.getByTestId("quick-start-btn");
    if (!(await restart.isVisible())) await page.getByTestId("drawer-open").click();
    await restart.click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("qs-solved")).toHaveText("0");
    // 새 세션의 첫 문항은 미공개 상태여야 한다(옛 답이 남아 정답이 미리 보이면 안 된다).
    await expect(page.locator("#feedback")).toHaveCount(0);
  });

  test("제품을 바꾸면 그 제품 문항으로 새로 시작한다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    await solveQuickOne(page);
    await startQuick(page, "CSTS");
    await expect(page.getByTestId("qs-solved")).toHaveText("0");
  });
});
