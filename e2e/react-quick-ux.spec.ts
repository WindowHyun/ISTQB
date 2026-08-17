import { test, expect, Page } from "@playwright/test";
import { openProduct, enterQuick, quickStat, answerCurrent, goNextQuestion } from "./helpers";

/** 퀵 진입 UI 계약 — 패널 위치, 세트 컨트롤 부재, 헤더 점수판, 결과 모달의 오답노트 진입로 제거. */

async function openBar(page: Page) {
  if (!(await page.locator(".segmented").isVisible())) await page.getByTestId("drawer-open").click();
}

test("퀵 패널은 풀이 모드 아래에 있다(세트 계열 컨트롤을 가르지 않는다)", async ({ page }) => {
  await page.goto("/");
  await openProduct(page, "ISTQB");
  await openBar(page);

  // 퀵 밖: 세트 선택이 맨 위, 그 아래가 풀이 모드.
  const outside = await page.evaluate(() => {
    const y = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
    return { set: y("#examSelect"), segmented: y(".segmented") };
  });
  expect(outside.set).toBeGreaterThan(0);
  expect(outside.segmented, "풀이 모드가 세트 선택 바로 아래여야 한다").toBeGreaterThan(outside.set);

  // 퀵 안: 세트 선택은 아예 없고(퀵은 세트 개념이 없는 모드다), 퀵 패널이 모드 아래에 온다.
  await enterQuick(page);
  await openBar(page);
  const inside = await page.evaluate(() => {
    const y = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
    return { segmented: y(".segmented"), quick: y(".quick-panel") };
  });
  expect(inside.segmented).toBeGreaterThan(0);
  expect(inside.quick, "퀵 패널은 풀이 모드 아래여야 한다").toBeGreaterThan(inside.segmented);
});

/**
 * 퀵 패널의 버튼은 '진입'이 아니라 '재추첨'이다 — 패널 자체가 퀵 안에서만 렌더되므로
 * 여기 보인다는 것은 이미 회차가 돌고 있다는 뜻이다. 종전 계약("진행 중에는 시작 버튼이
 * 사라지고 채점하면 다시 나타난다")은 진입로가 이 버튼이던 시절의 것이다. 지금은 세그먼트가
 * 진입로라, 버튼을 감추면 회차를 다시 섞을 방법이 사라진다.
 */
test("퀵 패널의 버튼은 상시 '다시 섞어 시작'이고, 누르면 회차가 새로 뽑힌다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await enterQuick(page, "ISTQB");
  await openBar(page);

  const btn = page.getByTestId("quick-start-btn");
  await expect(btn).toBeVisible();
  await expect(btn).toHaveText("다시 섞어 시작");
  await expect(page.locator(".quick-panel .action-hint")).toContainText("퀵 진행 중");

  // 두 문항을 풀어 진행을 만든다 — 재추첨이 이 진행을 실제로 버리는지 보기 위해서다.
  for (let i = 0; i < 2; i += 1) {
    await answerCurrent(page);
    await expect(quickStat(page, "solved")).toHaveText(String(i + 1));
    if (i === 0) await goNextQuestion(page);
  }

  await openBar(page);
  await btn.click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  // 새 회차이므로 집계는 0부터 — 남아 있으면 이전 회차의 답안이 딸려 온 것이다.
  await expect(quickStat(page, "solved"), "재추첨했는데 이전 회차 집계가 남아 있다").toHaveText("0");
});

/**
 * 퀵에는 세션을 마감하는 채점이 없다 — 따라서 결과 요약 모달도, 그 안의 오답노트
 * 진입로도 없다. 채점은 문항 단위이고 집계는 그때마다 이미 끝난다.
 *
 * 사이드바의 '채점하기'도 함께 본다. 그 버튼이 남아 있으면 드로어를 열어 누르는 순간
 * 지금 보고 있는 문항 하나만 채점되는데, 이름과 자리(세션 액션)가 그 결과를 예고하지
 * 않아 세션을 마감한 것으로 읽힌다.
 */
test("퀵에는 세션 채점도 결과 요약 모달도 없다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await enterQuick(page, "ISTQB");

  await answerCurrent(page); // 헬퍼가 문항 채점까지 한다
  await expect(quickStat(page, "solved")).toHaveText("1");
  await expect(page.getByTestId("result-summary"), "문항을 채점했더니 세션 결과가 떴다").toHaveCount(0);

  await openBar(page);
  await expect(page.getByTestId("grade-button"), "퀵에 세션 채점 버튼이 남아 있다").toHaveCount(0);
});

test("시험·랜덤 결과에는 오답노트 버튼이 그대로 있다(퀵만 예외)", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");
  await openBar(page);
  await page.locator('.segmented button[data-mode="exam"]').click();
  const gate = page.getByTestId("exam-start-btn");
  if (await gate.count()) await gate.click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await page.locator("#options .option").first().click();
  await openBar(page);
  await page.getByTestId("grade-button").click();
  const c = page.getByTestId("confirm-grade");
  if (await c.count()) await c.click();
  await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("result-summary").getByRole("button", { name: "오답 노트 보기" })).toBeVisible();
});

/**
 * 퀵에는 진행률(#progressText)도 타이머도 없다 — 끝을 정해 놓지 않아 분모가 없고 회차가
 * 기록으로 남지도 않는다. 사이드바의 '진행 / 시간' 줄이 통째로 빠지는 이유다. 그 자리를
 * 아무것도 대신하지 않으면 지금 몇 개를 맞히고 있는지 알 방법이 화면에 없으므로, 문제
 * 헤더의 점수판이 그 값을 맡는다. 둘은 한 쌍이라 함께 본다 — 하나만 검사하면 "진행률은
 * 지웠는데 대신할 것도 없는" 상태가 통과한다.
 */
test("퀵에는 진행률 대신 헤더 점수판이 있고, 답할 때마다 갱신된다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await enterQuick(page, "CSTS");
  await openBar(page);

  await expect(page.locator("#progressText"), "퀵에 진행률이 남아 있다(분모가 없는 모드다)").toHaveCount(0);
  const board = page.locator(".quick-scoreboard");
  await expect(board).toBeVisible();
  await expect(board.locator(".qs-item")).toHaveCount(4);
  await expect(quickStat(page, "solved")).toHaveText("0");

  // 점수판은 헤더 카드 안에 있어야 한다 — 헤더와 문제 사이에 끼면 지문이 화면 아래로 밀린다.
  await expect(page.locator(".topbar .quick-scoreboard")).toHaveCount(1);

  // 답할 때마다 '진행'이 오르고, 정답·오답 둘 중 하나가 함께 오른다.
  for (let i = 0; i < 3; i += 1) {
    await answerCurrent(page);
    await expect(quickStat(page, "solved")).toHaveText(String(i + 1));
    const correct = Number(await quickStat(page, "correct").textContent());
    const wrong = Number(await quickStat(page, "wrong").textContent());
    expect(correct + wrong, "진행은 올랐는데 정답·오답 어디에도 안 잡혔다").toBe(i + 1);
    if (i < 2) await goNextQuestion(page);
  }
});

/**
 * 퀵은 세트 개념이 없는 모드다(제품의 전 세트에서 뽑는다). 종전에는 세트 콤보를 남겨 두고
 * disabled로만 막았는데, 그러면 "지금 이 세트를 풀고 있다"는 잘못된 읽기를 화면이 계속
 * 제공한다 — 퀵으로 들어오기 직전에 고른 세트 이름이 그대로 떠 있기 때문이다.
 *
 * 그래서 두 가지를 함께 본다 — 퀵 안에서 사라지는가, 그리고 나오면 **들어가기 직전 세트로**
 * 돌아오는가. 사라지게만 하고 복귀를 안 보면, 퀵을 잠깐 들른 대가로 풀던 세트를 잃는
 * 새 결함이 그대로 통과한다(퀵의 setId는 센티넬이라 사이드바가 첫 세트로 되돌린다).
 */
test("퀵에서는 세트 컨트롤이 사라지고, 나오면 들어가기 직전 세트로 돌아온다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "CSTS");
  await openBar(page);

  // 첫 세트가 아닌 세트를 고른다 — 첫 세트면 '돌아왔다'와 '첫 세트로 리셋됐다'를 못 가른다.
  const sel = page.locator("#examSelect");
  const values = await sel.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  const chosen = values[2];
  await sel.selectOption(chosen);
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

  await enterQuick(page);
  await openBar(page);
  await expect(sel, "퀵인데 세트 컨트롤이 남아 있다").toHaveCount(0);

  // 두 문항을 채점하며 진행을 만든 뒤에도 여전히 없어야 한다(채점 전후로 되살아나지 않는다).
  for (let i = 0; i < 2; i += 1) {
    await answerCurrent(page); // 헬퍼가 문항 채점까지 한다
    await expect(quickStat(page, "solved")).toHaveText(String(i + 1));
    if (i === 0) await page.getByTestId("quick-next-btn").click();
  }
  await openBar(page);
  await expect(sel, "채점했다고 퀵에 세트 컨트롤이 생겼다").toHaveCount(0);

  // 다른 모드로 나오면 컨트롤이 돌아오고, 값은 퀵에 들어가기 직전 세트여야 한다.
  await page.locator('.segmented button[data-mode="practice"]').click();
  await openBar(page);
  await expect(sel).toBeVisible();
  await expect(sel, "퀵을 들렀다고 풀던 세트를 잃었다").toHaveValue(chosen);
});

/**
 * 점수판은 '지금 보고 있는 위치'가 아니라 '푼 것'을 센다.
 *
 * 종전에는 현재 문항 인덱스까지만 세어, ‹ 로 앞 문항에 돌아가면 점수판이 뒤로 감겼다
 * (진행 3 → 1). 퀵에는 진행률이 없어 이 점수판이 유일한 진행 표시라 대조할 곳도 없다.
 * 게다가 채점 대상은 커서와 무관해서, 그 상태로 채점하면 화면은 "진행 1"인데 회차는
 * 3문항으로 기록됐다 — 화면과 기록이 갈리는 결함이다.
 *
 * 순수 계층은 quickStats.test.ts가 고정한다. 여기서는 실제 이동·채점으로 두 숫자가
 * 같은 것을 본다(팔레트의 '답함'까지 셋이 함께 움직여야 한다).
 */
test("퀵: 앞 문항으로 돌아가도 점수판이 되감기지 않고, 채점 범위와 일치한다", async ({ page }) => {
  await enterQuick(page, "ISTQB");

  for (let i = 0; i < 3; i += 1) {
    await answerCurrent(page);
    await expect(quickStat(page, "solved")).toHaveText(String(i + 1));
    if (i < 2) await goNextQuestion(page);
  }

  // 앞 문항으로 두 번 돌아간다 — 여기서 값이 줄면 종전 결함이다.
  await page.locator("#prevBtn").click();
  await page.locator("#prevBtn").click();
  await expect(
    quickStat(page, "solved"),
    "앞 문항으로 돌아갔더니 '진행'이 줄었다 — 점수판이 보고 있는 위치를 세고 있다",
  ).toHaveText("3");

  // 되돌아온 문항은 이미 채점한 것이므로 정답이 그대로 열려 있고, 다시 채점할 수 없다.
  // (종전에는 이 자리에서 '세션 채점'을 눌러 회차 문항 수를 점수판과 대조했다. 지금은
  //  채점이 문항 단위라 세션 채점 자체가 없고, 회차는 채점할 때마다 이미 자란다.)
  await expect(page.locator("#feedback")).toBeVisible();
  await expect(page.getByTestId("quick-grade-btn")).toHaveCount(0);

  // 회차에 실제로 3문항이 담겼는지는 저장된 퀵 회차에서 확인한다 — 점수판이 말한 수와
  // 기록이 어긋나면(종전 결함의 본체) 여기서 갈린다.
  //
  // 저장은 500ms 디바운스라 즉시 읽으면 비어 있다. 그리고 회차는 **하나**여야 한다 —
  // 문항마다 새 회차를 쌓으면 24시간 오답 목록이 한 문항짜리 덩어리로 쪼개진다.
  await expect
    .poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem("istqb-fl-v4-sample-ui-state");
      const rounds = raw ? JSON.parse(raw).quickRounds ?? [] : [];
      return rounds.length === 1 ? rounds[0].total : `회차 ${rounds.length}개`;
    }), { message: "점수판이 말한 진행 수와 회차에 기록된 문항 수가 다르다", timeout: 5000 })
    .toBe(3);
});

/**
 * 퀵의 '답함'은 확정 기준이다 — 화면 세 곳이 같은 답을 해야 한다.
 *
 * 종전에는 팔레트만 isAnswered를 써서, 복수정답을 하나만 고른 문항이 팔레트에서는 답한
 * 색으로 칠해지고 '답함'에도 세어졌다. 그런데 점수판(진행)과 채점 회차는 확정 기준이라
 * 그 문항을 빼고 셌다 — 실측으로 팔레트 "답함 2" · 진행 "1" · 회차 "1문항"이었다.
 * 답한 것으로 보이던 문항이 결과에서 사라지는 셈이다.
 *
 * 뽑기에 기대면 복수정답을 만나지 못하는 회차가 생기므로(ISTQB 186문항 중 9개),
 * 저장된 추첨(quickDraw — 새로고침 이어풀기가 쓰는 그 경로)으로 두 문항짜리 회차를
 * 못 박아 결정적으로 만든다: 단일 정답 1문항 + 복수정답(정답 2개) 1문항.
 */
test("퀵: 복수정답을 일부만 고르면 점수판이 '답함'으로 세지 않는다", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("istqb-fl-v4-sample-ui-state", JSON.stringify({
      quickDraw: {
        certification: "istqb",
        items: [
          { id: "ISTQB-FL-V4-A-001", setId: "ISTQB-FL-V4-A" }, // 정답 1개
          { id: "ISTQB-FL-V4-A-006", setId: "ISTQB-FL-V4-A" }, // 정답 2개(복수정답)
        ],
      },
    }));
  });
  await enterQuick(page, "ISTQB");

  // 추첨이 2문항인지는 ‹ › 의 경계로 확인한다 — 퀵에는 분모를 적는 자리가 없다
  // (팔레트를 렌더하지 않는다). 첫 문항에서 ‹ 는 잠겨 있고, 한 번 넘기면 › 가 잠긴다.
  await expect(page.locator("#prevBtn"), "첫 문항인데 ‹ 가 열려 있다").toBeDisabled();

  // 1) 단일 정답 문항을 답하고 채점한다 — 한 번 클릭이 곧 확정이고, 채점이 집계를 올린다.
  await page.locator("#options .option").first().click();
  await page.getByTestId("quick-grade-btn").click();
  await expect(quickStat(page, "solved")).toHaveText("1");

  // 2) 복수정답 문항으로 이동해 **하나만** 고른다.
  await page.getByTestId("quick-next-btn").click();
  await expect(page.locator("#questionTitle")).toContainText("복수정답");
  await page.locator("#options .option").first().click();

  // 확정 규칙의 단일 원천은 computeQuickStats다(유닛이 규칙 자체를 덮는다). 여기서는
  // 화면에 남은 표시자 둘 — 채점 버튼의 잠금과 점수판 — 이 그 규칙을 말하는지 본다.
  await expect(
    page.getByTestId("quick-grade-btn"),
    "복수정답을 하나만 골랐는데 채점이 열렸다",
  ).toBeDisabled();
  await expect(quickStat(page, "solved")).toHaveText("1");

  // 3) 나머지 하나를 마저 고르면 그때 채점이 열리고, 채점해야 집계가 오른다.
  await page.locator("#options .option").nth(1).click();
  await expect(page.getByTestId("quick-grade-btn")).toBeEnabled();
  await expect(quickStat(page, "solved"), "아직 채점 전이다").toHaveText("1");
  await page.getByTestId("quick-grade-btn").click();
  await expect(quickStat(page, "solved")).toHaveText("2");
  // 저장된 추첨이 2문항이었음은 여기서 드러난다 — 마지막 문항을 채점하면 '다음 문제'가
  // 아니라 '다시 섞어 시작'이 뜬다(퀵에는 분모를 적는 자리가 없다).
  await expect(
    page.getByTestId("quick-reshuffle-btn"),
    "저장된 추첨 2문항으로 시작해야 한다(마지막 문항이 아니다)",
  ).toBeVisible();
});

/**
 * 퀵의 이동 수단은 ‹ › 뿐이다.
 *
 * 번호로 건너뛰는 조작이 이 모드에서는 뜻을 갖지 않는다 — 팔레트 칸에 찍히는 값은 순번이
 * 아니라 원본 세트의 문항 번호이고, 퀵은 전 세트를 섞어 내므로 세트가 다르면 같은 번호가
 * 여러 번 나온다. 게다가 추첨 규모가 늘 '전부'라 격자가 수백 칸이 된다.
 *
 * 데스크톱(팔레트의 '⤢ 문항 이동')과 모바일(하단바의 점프 핀) 두 진입로를 함께 본다.
 * DOM에서 빠졌는지를 보는 이유: CSS로만 감추면 키보드·스크린리더에는 그대로 남는다.
 */
test("퀵에서는 문항 이동(점프)과 팔레트가 사라지고 ‹ › 만 남는다", async ({ page }) => {
  await page.goto("/");
  await openProduct(page, "ISTQB");

  // 연습에서는 셋 다 있다 — 퀵에서만 빠지는 것임을 같은 검사 안에서 못박는다.
  await expect(page.getByTestId("palette-jump-btn")).toHaveCount(1);
  await expect(page.getByTestId("jump-pin")).toHaveCount(1);
  await expect(page.locator(".palette-block")).toHaveCount(1);

  await enterQuick(page, "ISTQB");

  await expect(page.getByTestId("palette-jump-btn"), "퀵에 '문항 이동' 버튼이 남아 있다").toHaveCount(0);
  await expect(page.getByTestId("jump-pin"), "퀵에 모바일 점프 핀이 남아 있다").toHaveCount(0);
  await expect(page.locator(".palette-block"), "퀵에 팔레트 블록이 남아 있다").toHaveCount(0);
  await expect(page.locator("#questionNav"), "퀵에 번호 격자가 남아 있다").toHaveCount(0);

  // 남은 이동 수단은 실제로 동작해야 한다 — 앞으로는 채점 뒤의 '다음 문제', 뒤로는 ‹.
  await expect(page.locator("#prevBtn"), "첫 문항에서는 ‹ 가 잠긴다").toBeDisabled();
  const first = (await page.locator("#questionTitle").textContent()) || "";
  await answerCurrent(page); // 헬퍼가 채점까지 한다
  await page.getByTestId("quick-next-btn").click();
  await expect(page.locator("#questionTitle")).not.toHaveText(first);
  await page.locator("#prevBtn").click();
  await expect(page.locator("#questionTitle")).toHaveText(first);
});

/**
 * 퀵의 채점은 **문항 단위**다 — 한 문항 풀고 채점하면 그 자리에서 정답이 열리고,
 * 같은 버튼이 '다음 문제'로 바뀐다.
 *
 * 종전에는 '채점하기'가 세션을 마감했다(확정한 문항을 한꺼번에 집계하고 결과 요약을 띄운
 * 뒤 잠금). 그래서 "한 문항씩 무한히 푸는 모드"라는 사양과 달리, 계속 풀려면 매번
 * '다시 섞어 시작'으로 회차를 새로 뽑아야 했다.
 *
 * 네 가지를 함께 본다 — 고르기만 해서는 안 열린다 / 채점이 열고 점수판을 올린다 /
 * 버튼이 다음으로 바뀐다 / 다음 문항은 다시 미채점이다. 하나만 보면 "열리긴 하는데
 * 집계가 안 되는" 반쪽 상태가 통과한다.
 */
test("퀵: 한 문항을 채점하면 그 자리에서 정답이 열리고 버튼이 '다음 문제'가 된다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await enterQuick(page, "ISTQB");

  const grade = page.getByTestId("quick-grade-btn");
  const feedback = page.locator("#feedback");

  // 답을 고르기 전 — 채점은 잠겨 있고 정답도 없다.
  await expect(grade, "답도 고르지 않았는데 채점이 열려 있다").toBeDisabled();
  await expect(feedback).toHaveCount(0);

  // 고르기만 해서는 아무것도 열리지 않는다(시험처럼) — 스스로 판단할 틈을 준다.
  await page.locator("#options .option").first().click();
  await expect(feedback, "고르자마자 정답이 열렸다 — 채점 전이다").toHaveCount(0);
  await expect(grade).toBeEnabled();
  await expect(quickStat(page, "solved"), "채점 전인데 점수판이 올랐다").toHaveText("0");

  // 채점 — 정답·해설이 열리고 점수판이 오른다.
  await grade.click();
  await expect(feedback).toBeVisible();
  await expect(quickStat(page, "solved")).toHaveText("1");
  const correct = Number(await quickStat(page, "correct").textContent());
  const wrong = Number(await quickStat(page, "wrong").textContent());
  expect(correct + wrong, "진행은 올랐는데 정답·오답 어디에도 안 잡혔다").toBe(1);

  // 같은 자리의 버튼이 '다음 문제'로 바뀐다(채점 버튼은 사라진다).
  await expect(grade).toHaveCount(0);
  const next = page.getByTestId("quick-next-btn");
  await expect(next).toBeVisible();

  // 다음 문항으로 넘어가면 처음 상태로 돌아간다 — 미채점, 정답 닫힘.
  const before = (await page.locator("#questionTitle").textContent()) || "";
  await next.click();
  await expect(page.locator("#questionTitle")).not.toHaveText(before);
  await expect(page.locator("#feedback")).toHaveCount(0);
  await expect(page.getByTestId("quick-grade-btn")).toBeDisabled();
  // 앞 문항의 채점 결과는 그대로 남는다(점수판은 되감기지 않는다).
  await expect(quickStat(page, "solved")).toHaveText("1");
});

test("퀵: 채점한 문항으로 ‹ 돌아가면 정답이 그대로 열려 있고 다시 고를 수 없다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await enterQuick(page, "ISTQB");

  await answerCurrent(page); // 헬퍼가 채점까지 한다
  await expect(quickStat(page, "solved")).toHaveText("1");
  await page.getByTestId("quick-next-btn").click();
  await page.locator("#prevBtn").click();

  // 채점 표시는 답안과 함께 저장되므로 되돌아와도 유지된다.
  await expect(page.locator("#feedback")).toBeVisible();
  await expect(page.locator("#options .option").first()).toBeDisabled();
  await expect(page.getByTestId("quick-next-btn"), "이미 채점한 문항인데 채점 버튼이 다시 떴다").toBeVisible();
});

/**
 * 퀵에는 **앞으로 가는 화살표가 없다.**
 *
 * 전 세트를 섞어 한 문항씩 내는 모드에서 '다음'을 미리 눌러 볼 수 있으면, 채점하지 않은
 * 문항을 그냥 지나칠 수 있고 그 문항은 집계에도 남지 않는다. 앞으로 가는 길은 채점 뒤에
 * 나타나는 '다음 문제' 하나뿐이다.
 *
 * 버튼과 키보드를 함께 본다 — 버튼만 없애면 → 키 하나로 같은 일이 그대로 된다.
 * 뒤로(‹ · ←)는 열어 둔다: 이미 채점해 정답을 본 문항을 다시 보는 것은 해가 없다.
 */
test("퀵에는 앞으로 가는 ›가 없고, → 키도 채점 전에는 움직이지 않는다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");

  // 연습에는 있다 — 퀵에서만 빠지는 것임을 같은 검사에서 못박는다.
  await expect(page.locator("#nextBtn")).toHaveCount(1);

  await enterQuick(page, "ISTQB");
  await expect(page.locator("#nextBtn"), "퀵에 앞으로 가는 화살표가 남아 있다").toHaveCount(0);
  await expect(page.locator("#prevBtn"), "뒤로 가는 화살표까지 사라졌다").toHaveCount(1);

  // → 키로도 못 넘어간다(채점 전).
  const first = (await page.locator("#questionTitle").textContent()) || "";
  await page.locator("#questionStem").click(); // 입력 필드가 아닌 곳에 포커스
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  await expect(page.locator("#questionTitle"), "채점 전인데 → 키로 다음 문항에 갔다").toHaveText(first);

  // 채점하면 그때는 → 키도 열린다(버튼과 같은 규칙).
  await answerCurrent(page); // 헬퍼가 채점까지 한다
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#questionTitle")).not.toHaveText(first);
});
