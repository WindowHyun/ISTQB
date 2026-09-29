import { expect, Page, test } from "./fixtures";
import { answerCurrent, enterQuick, goNextQuestion, gotoStable, openProduct, pinQuickDraw, quickNext, quickStat, selectCurrent } from "./helpers";
import AxeBuilder from "@axe-core/playwright";

// 퀵 조작·UI — 패널·점수판·이동 수단·axe·터치 타깃·대비.

// ── react-quick-ux.spec.ts에서 합침 ────────────────────────────────────────
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
  // 아래에서 이동을 제목으로 판정하므로 추첨을 못 박는다(pinQuickDraw 주석 참고).
  await pinQuickDraw(page);
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
  // 뽑기에 기대지 않는다 — 이 검사는 '다음 문항으로 넘어갔는가'를 문제 번호로 판정하는데,
  // 퀵은 전 세트를 섞으므로 **연속한 두 문항이 같은 번호일 수 있다**(번호는 원본 세트의 것이다).
  // 실측으로 25회 중 1회가 "문제 9 → 문제 9"로 뽑혀 이 단언이 실패했다.
  // 같은 파일의 복수정답 검사와 같은 방법으로 추첨을 못 박는다(quickDraw — 새로고침
  // 이어풀기가 쓰는 그 경로). 한 세트의 연속 번호 두 문항이면 번호가 겹칠 수 없다.
  await page.evaluate(() => localStorage.clear());
  await pinQuickDraw(page); // 문제 1 · 문제 2
  await enterQuick(page, "ISTQB");

  const grade = page.getByTestId("quick-grade-btn");
  const feedback = page.locator("#feedback");

  // 답을 고르기 전 — 채점은 잠겨 있고 정답도 없다.
  await expect(grade, "답도 고르지 않았는데 채점이 열려 있다").toBeDisabled();
  await expect(feedback).toHaveCount(0);

  // 고르기만 해서는 아무것도 열리지 않는다(시험처럼) — 스스로 판단할 틈을 준다.
  // selectCurrent는 채점하지 않는다. 보기를 하나만 누르면 복수정답 문항이 뽑힌 회차에서
  // 확정되지 않아 아래 toBeEnabled가 무작위로 실패한다(F-5 — 실측 25회 중 3회).
  await selectCurrent(page);
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
  // 아래에서 이동을 제목으로 판정하므로 추첨을 못 박는다(pinQuickDraw 주석 참고).
  await pinQuickDraw(page);
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

// ── react-uiux-quick.spec.ts에서 합침 ────────────────────────────────────────
/**
 * 퀵 랜덤 UI/UX 검사.
 *
 * 퀵은 기존 UI/UX 스펙(a11y·responsive·layout·settings) 어디에도 들어 있지 않다 —
 * 화면과 CSS가 새로 생겼는데 접근성·반응형·테마 조합 검사를 한 번도 거치지 않았다.
 * 특히 .result-score.neutral과 .quick-start-btn은 이번에 추가된 색이라 대비가 미검증이다.
 */

const problems: string[] = [];
const bad = (s: string) => { problems.push(s); console.log("  ✗ " + s); };
const note = (s: string) => console.log("· " + s);

/**
 * 보기가 있는 문항이 나올 때까지 넘긴다(찾으면 true).
 *
 * 퀵에는 앞으로 가는 화살표가 없다 — 채점해야 '다음 문제'가 열린다. 그래서 보기가 없는
 * 문항(서답형)은 풀고 채점해 지나간다(answerCurrent가 둘 다 한다). 찾은 문항은 답하지
 * 않고 그대로 둔다 — 부르는 쪽이 그 문항으로 키보드 조작을 검사한다.
 */
async function advanceToOptionQuestion(page: Page, max = 20): Promise<boolean> {
  for (let i = 0; i < max; i += 1) {
    if (await page.locator("#options .option").count()) return true;
    await answerCurrent(page);
    if (!(await quickNext(page))) return false;
    await page.waitForTimeout(80);
  }
  return false;
}

async function axeScan(page: Page, label: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  if (!r.violations.length) { note(`${label}: 위반 없음`); return; }
  for (const v of r.violations) {
    const where = v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ");
    bad(`${label} :: [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length}곳: ${where})`);
  }
}

// ─────────────────────────────────────────────────────────────
test("UI: 퀵 화면 axe 스캔 — 라이트·다크·모바일", async ({ page }) => {
  test.setTimeout(300_000);

  // 라이트 · 데스크톱 — 진입 패널이 보이는 상태
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  // 퀵 패널은 퀵 안에서만 렌더된다(진입로는 모드 세그먼트다) — 밖에서 스캔하면
  // 아무것도 없는 사이드바를 훑고 통과한다. 들어간 뒤에 본다.
  await enterQuick(page, "ISTQB");
  await axeScan(page, "퀵 풀이 화면(라이트) — 패널·헤더 점수판 포함");

  // 채점 결과 — 퀵은 문항 단위로 채점하므로 결과가 뜨는 자리는 정답·해설 카드다
  // (세션 결과 모달은 이 모드에 없다). 잠긴 보기와 해설이 함께 뜬 상태를 훑는다.
  await answerCurrent(page); // 헬퍼가 문항 채점까지 한다
  await expect(page.locator("#feedback")).toBeVisible({ timeout: 20_000 });
  await axeScan(page, "퀵 채점 결과(라이트) — 정답·해설·잠긴 보기");

  // 다크
  await page.evaluate(() => localStorage.setItem("istqb-theme", "dark"));
  await page.reload();
  await enterQuick(page, "ISTQB");
  await page.waitForTimeout(400);
  await axeScan(page, "퀵 화면(다크)");

  // 모바일
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await enterQuick(page, "ISTQB");
  await page.getByTestId("drawer-open").click();
  await page.waitForTimeout(400);
  await axeScan(page, "퀵 화면(모바일 다크)");

  expect(problems, problems.join("\n")).toEqual([]);
});

// ─────────────────────────────────────────────────────────────
test("UX: 키보드만으로 퀵을 시작하고 풀 수 있다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");

  // 퀵의 진입로는 모드 세그먼트다(문항 수 셀렉트는 없앴다 — 끝이 정해지지 않은 모드에
  // 문항 수를 고르게 하는 것이 거짓말이라서). 그 버튼에 키보드로 닿고 이름이 읽히는가.
  const quickBtn = page.locator('.segmented button[data-mode="quick"]');
  const reached = await quickBtn.evaluate((el) => ({
    tabbable: (el as HTMLButtonElement).tabIndex >= 0 && !(el as HTMLButtonElement).disabled,
    named: ((el.textContent || "") + (el.getAttribute("aria-label") || "")).trim().length > 0,
  }));
  if (!reached.tabbable) bad("퀵 모드 버튼에 키보드로 도달할 수 없다");
  if (!reached.named) bad("퀵 모드 버튼에 접근 가능한 이름이 없다");

  // 버튼을 Enter로 눌러 진입한다.
  await quickBtn.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await expect(quickStat(page, "solved")).toHaveText("0");
  note("키보드만으로 퀵 진입 성공");

  // 보기 선택도 키보드로 — 라디오/버튼 어느 쪽이든 포커스 후 Enter/Space가 먹어야 한다.
  // 퀵에는 서답형이 섞이므로(B5) 보기가 있는 문항까지 이동한 뒤 검사한다.
  // 그냥 첫 문항을 잡으면 서답형이 뽑힌 회차에서 셀렉터가 없어 헛되이 죽는다.
  if (!(await advanceToOptionQuestion(page))) {
    bad("20문항을 다 넘겨도 보기가 있는 문항이 없다 — 퀵이 서답형만 뽑았다");
    expect(problems, problems.join("\n")).toEqual([]);
    return;
  }
  // 진행은 헤더 점수판에서 읽는다 — 퀵에는 진행률(#progressText)이 없다(분모가 없는 모드).
  const solvedBefore = Number((await quickStat(page, "solved").textContent()) ?? "0");
  const solved = async () => Number((await quickStat(page, "solved").textContent()) ?? "0");
  const opt = page.locator("#options .option").first();
  await opt.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  let picked = (await opt.getAttribute("aria-pressed")) === "true";
  if (!picked) {
    await page.keyboard.press(" ");
    await page.waitForTimeout(200);
    picked = (await opt.getAttribute("aria-pressed")) === "true";
  }
  if (!picked) bad("보기를 키보드(Enter/Space)로 선택할 수 없다");

  // 퀵은 한 문항씩 채점하고 넘어간다 — 고르는 것만으로는 진행이 오르지 않는다.
  // 채점 버튼까지 키보드로 닿아야 이 모드의 흐름이 키보드만으로 닫힌다.
  const grade = page.getByTestId("quick-grade-btn");
  // 복수정답이면 정답 개수만큼 골라야 채점이 열린다 — 나머지도 키보드로 고른다.
  const optionCount = await page.locator("#options .option").count();
  for (let i = 1; i < optionCount && (await grade.isDisabled()); i += 1) {
    await page.locator("#options .option").nth(i).focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
  }
  if (await grade.isDisabled()) {
    bad("답을 다 골랐는데 채점 버튼이 열리지 않는다");
  } else {
    await grade.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    if (!((await solved()) > solvedBefore)) bad("키보드로 채점했는데 진행이 오르지 않는다");
  }

  // 문항 이동도 키보드로(← →) — 이미 다른 스펙이 보지만 퀵에서도 성립하는지 확인한다.
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  const title = await page.locator("#questionTitle").textContent();
  note(`화살표 이동 후 헤더: ${title?.trim()}`);

  expect(problems, problems.join("\n")).toEqual([]);
});

// ─────────────────────────────────────────────────────────────
test("UI: 모바일에서 퀵 컨트롤이 터치 타깃 최소 크기를 만족한다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await enterQuick(page, "ISTQB");
  await page.getByTestId("drawer-open").click();
  await page.waitForTimeout(400);

  // WCAG 2.1 AA(2.5.5는 AAA지만 모바일 실사용 기준으로 44px를 쓴다).
  const MIN = 44;
  for (const [label, sel] of [
    ["퀵 모드 버튼", '.segmented button[data-mode="quick"]'],
    ["다시 섞어 시작 버튼", '[data-testid="quick-start-btn"]'],
  ] as const) {
    const box = await page.locator(sel).boundingBox();
    if (!box) { bad(`${label}: 화면에 없다`); continue; }
    note(`${label}: ${Math.round(box.width)}×${Math.round(box.height)}`);
    if (box.height < MIN) bad(`${label} 높이 ${Math.round(box.height)}px < ${MIN}px`);
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

// ─────────────────────────────────────────────────────────────
test("UI: 테마 × 글자 크기 조합에서 퀵 화면이 넘치거나 잘리지 않는다", async ({ page }) => {
  test.setTimeout(400_000);

  // 실제로 몇 조합에서 '넘침을 볼 수 있는 화면'까지 갔는지 센다. 퀵 패널이 없으면
  // continue로 빠지는데, 그 경로만 12번 타도 problems가 비어 있는 한 통과해 버린다
  // (bad를 부르므로 지금은 걸리지만, 검사 대상 화면에 닿았는지 자체를 세어 두면
  // 셀렉터·레이아웃이 바뀌어 조용히 건너뛰는 경우까지 잡는다).
  let inspected = 0;
  for (const theme of ["light", "dark"] as const) {
    for (const font of ["small", "normal", "large"] as const) {
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        // 한 테스트가 12번 연속으로 이동한다 — 간헐적 net::ERR_ABORTED 대응은 공용 헬퍼로.
        await gotoStable(page);
        await page.evaluate(([t, f]) => {
          localStorage.clear();
          localStorage.setItem("istqb-theme", t as string);
          localStorage.setItem("istqb-q-font", f as string);
        }, [theme, font]);
        await enterQuick(page, "ISTQB");
        if (width === 390) await page.getByTestId("drawer-open").click();
        await page.waitForTimeout(350);

        const label = `${theme}/${font}/${width}px`;
        // 진입 패널 넘침
        const panel = await page.evaluate(() => {
          const el = document.querySelector(".quick-panel") as HTMLElement | null;
          if (!el) return null;
          return { scrollW: el.scrollWidth, clientW: el.clientWidth };
        });
        if (!panel) { bad(`${label}: 퀵 패널이 없다`); continue; }
        if (panel.scrollW > panel.clientW + 1) {
          bad(`${label}: 퀵 패널 가로 넘침 ${panel.scrollW}>${panel.clientW}`);
        }

        // 헤더 점수판 — 문제 제목과 한 줄을 나눠 쓰므로 큰 글자·좁은 폭에서 먼저 넘친다.
        const board = await page.evaluate(() => {
          const el = document.querySelector(".quick-scoreboard") as HTMLElement | null;
          if (!el) return null;
          const bar = el.closest(".topbar") as HTMLElement | null;
          return {
            scrollW: el.scrollWidth,
            clientW: el.clientWidth,
            barOverflow: bar ? bar.scrollWidth > bar.clientWidth + 1 : false,
          };
        });
        if (!board) { bad(`${label}: 퀵 점수판이 없다`); continue; }
        if (board.scrollW > board.clientW + 1) {
          bad(`${label}: 점수판 가로 넘침 ${board.scrollW}>${board.clientW}`);
        }
        if (board.barOverflow) bad(`${label}: 점수판이 헤더 카드를 넘겼다`);

        // 문서 전체 넘침
        const doc = await page.evaluate(() => ({
          s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth,
        }));
        if (doc.s > doc.c + 1) bad(`${label}: 문서 가로 넘침 ${doc.s}>${doc.c}`);
        inspected += 1;
      }
    }
  }
  note(`테마 2 × 글자크기 3 × 폭 2 = 12조합 중 ${inspected}조합 검사`);
  expect(inspected, "12조합을 다 보지 못했다 — 검사가 무력하다").toBe(12);
  expect(problems, problems.join("\n")).toEqual([]);
});

// ─────────────────────────────────────────────────────────────
test("UI: 퀵 채점 결과 카드가 라이트·다크 모두에서 읽을 수 있는 대비를 갖는다", async ({ page }) => {
  test.setTimeout(300_000);

  // 상대 휘도 → 대비비. axe가 놓치는 조합(동적 클래스)을 직접 잰다.
  const contrast = (fg: string, bg: string) => {
    const lum = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return 0;
      const [r, g, b] = m[1].split(",").slice(0, 3).map((v) => {
        const s = Number(v.trim()) / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const a = lum(fg); const b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };

  for (const theme of ["light", "dark"] as const) {
    await page.goto("/");
    await page.evaluate((t) => { localStorage.clear(); localStorage.setItem("istqb-theme", t as string); }, theme);
    await enterQuick(page, "ISTQB");
    await answerCurrent(page); // 헬퍼가 문항 채점까지 한다
    await expect(page.locator("#feedback")).toBeVisible({ timeout: 20_000 });

    // 퀵에서 결과가 뜨는 자리는 문항의 정답·해설 카드다(세션 결과 모달은 이 모드에 없다).
    // 정오답에 따라 배경이 갈리므로 지금 뜬 그 표면을 그대로 잰다.
    const colors = await page.evaluate(() => {
      const box = document.querySelector("#feedback") as HTMLElement | null;
      const strong = box?.querySelector("strong") as HTMLElement | null;
      if (!box) return null;
      const cs = getComputedStyle(box);
      const head = strong ?? box;
      return {
        cls: box.className,
        bg: cs.backgroundColor,
        bodyFg: cs.color,
        bodySize: parseFloat(cs.fontSize),
        strongFg: getComputedStyle(head).color,
        strongSize: parseFloat(getComputedStyle(head).fontSize),
      };
    });
    if (!colors) { bad(`${theme}: 채점 결과 카드를 찾지 못함`); continue; }
    if (!/correct|wrong/.test(colors.cls)) bad(`${theme}: 정오답 표시가 없는 결과 카드 (${colors.cls})`);

    // 큰 글자(≥24px 굵게)는 3:1, 본문 크기는 4.5:1이 AA 기준이다.
    const bodyRatio = contrast(colors.bodyFg, colors.bg);
    const strongRatio = contrast(colors.strongFg, colors.bg);
    note(`${theme}: 본문 ${colors.bodySize}px 대비 ${bodyRatio.toFixed(2)}:1 · 제목 ${colors.strongSize}px 대비 ${strongRatio.toFixed(2)}:1`);
    if (bodyRatio < 4.5) bad(`${theme}: 채점 결과 본문 대비 ${bodyRatio.toFixed(2)}:1 < 4.5:1`);
    const strongNeed = colors.strongSize >= 24 ? 3 : 4.5;
    if (strongRatio < strongNeed) bad(`${theme}: 채점 결과 제목 대비 ${strongRatio.toFixed(2)}:1 < ${strongNeed}:1`);
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

// ─────────────────────────────────────────────────────────────
/**
 * 안내 문구는 네 가지를 말해야 한다 — 출제 범위 · 제한시간 · 회차 기록, 그리고 **그 제품에
 * 서답형이 있을 때만** 출제 유형. 마지막 조건이 중요하다: 서답형 문장을 자격증과 무관하게
 * 늘 붙이면, 서답형이 한 문항도 없는 ISTQB 사용자에게 나오지도 않을 유형을 예고하게 된다.
 * 그래서 두 제품을 모두 밟는다 — 종전에는 CSTS만 봐서 이 어긋남이 검사를 통과했다.
 */
test("UX: 퀵 안내 문구가 잘리지 않고, 그 제품에 맞는 출제 범위를 알린다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const product of ["CSTS", "ISTQB"] as const) {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    // 퀵 패널은 퀵 안에서만 렌더된다(진입로는 모드 세그먼트) — 밖에서 찾으면 늘 null이다.
    await enterQuick(page, product);
    await page.getByTestId("drawer-open").click();
    await page.waitForTimeout(400);

    // 기대값의 근거는 데이터다(scripts로 실측: CSTS 440문항 중 서답형 63, ISTQB 186 중 0).
    // 문구가 이 사실을 따라오는지가 요점이므로, 기대는 여기서 못 박고 화면을 대조한다.
    // 데이터가 바뀌어 ISTQB에 서답형이 생기면 이 줄이 먼저 틀려 갱신 지점을 알려 준다.
    const expectShort = product === "CSTS";

    const hint = await page.evaluate(() => {
      const panel = document.querySelector(".quick-panel") as HTMLElement | null;
      const p = panel?.querySelector(".action-hint") as HTMLElement | null;
      if (!p) return null;
      return { text: p.textContent ?? "", clipped: p.scrollHeight > p.clientHeight + 1 };
    });
    if (!hint) { bad(`${product}: 퀵 안내 문구가 없다`); continue; }

    note(`${product} 안내: ${hint.text}`);
    if (!new RegExp(product).test(hint.text)) bad(`${product}: 안내가 다른 자격증을 말한다`);
    if (!/전 세트/.test(hint.text)) bad(`${product}: 안내에 '전 세트 출제'가 없다`);
    if (!/제한시간/.test(hint.text)) bad(`${product}: 안내에 제한시간 여부가 없다`);
    // 퀵은 회차 이력을 남기지 않는다 — 이 사실을 안내에서 알 수 있어야 한다.
    if (!/기록/.test(hint.text)) bad(`${product}: 안내에 회차 기록 여부가 없다`);
    if (hint.clipped) bad(`${product}: 안내 문구가 세로로 잘렸다`);

    const saysShort = /서답형/.test(hint.text);
    if (expectShort && !saysShort) bad(`${product}: 서답형이 나오는데 안내가 알리지 않는다`);
    if (!expectShort && saysShort) {
      bad(`${product}: 서답형이 한 문항도 없는데 안내가 예고한다`);
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
