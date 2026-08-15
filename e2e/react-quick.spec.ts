import { test, expect, Page } from "@playwright/test";
import { openProduct, enterQuick, quickStat, answerCurrent, quickNext } from "./helpers";

// 퀵 랜덤 — 제품의 전 세트를 섞어 한 문항씩 내는 모드(끝을 정해 두지 않는다).
// 세트 하나에 매이지 않아 setId가 센티넬(QUICK)이라, 세트를 전제하는 기존 경로들이
// 조용히 어긋날 수 있다. 그 지점들을 여기서 고정한다.
//
// 진입·응답 헬퍼는 helpers로 모았다 — 문항 수 콤보가 사라지면서 스펙마다 복사돼 있던
// 지역 헬퍼가 전부 같은 지점에서 깨졌다(그 자체가 중복의 대가였다).

/**
 * quickDraw는 saveUiState의 500ms 디바운스를 거쳐 저장된다. 시작 직후 바로 읽으면
 * 아직 없어서 null이 나온다 — 실제로 그렇게 간헐 실패했다(#170). 저장될 때까지 기다린다.
 */
async function readQuickDrawIds(page: Page, product: "istqb" | "csts"): Promise<string[]> {
  let ids: string[] = [];
  await expect.poll(async () => {
    const ui = await readUi(page, product);
    ids = ui?.quickDraw?.items?.map((i: { id: string }) => i.id) ?? [];
    return ids.length;
  }, { message: "quickDraw가 저장되지 않았다(saveUiState 500ms 디바운스)", timeout: 10_000 })
    .toBeGreaterThan(0);
  return ids;
}

function readUi(page: Page, product: "istqb" | "csts") {
  const key = product === "csts" ? "csts-fl-v1-sample-ui-state" : "istqb-fl-v4-sample-ui-state";
  return page.evaluate((k: string) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, key);
}

test.describe("퀵 랜덤", () => {
  // 사양 변경: 문항 수를 고르지 않는다 — 제품의 전 세트를 섞어 끝까지 낸다.
  // 그래서 '몇 개인가'가 아니라 '어디에서 왔는가'를 본다(전 세트 출제·출처 보존).
  test("제품의 전 세트에서, 출처를 남기고 뽑는다", async ({ page }) => {
    await enterQuick(page, "CSTS");

    const ui = await readUi(page, "csts");
    expect(ui.mode).toBe("quick");
    const items: { id: string; setId: string }[] = ui.quickDraw.items;
    // 한 세트 분량(70문항)을 넘어야 '전 세트를 섞었다'가 성립한다 — 개수를 못 박지 않는
    // 이유는 재수록 제거로 총계가 데이터에 따라 달라지기 때문이다.
    expect(items.length, "전 세트 출제인데 한 세트 분량도 안 된다").toBeGreaterThan(70);
    expect(new Set(items.map((i) => i.setId)).size).toBeGreaterThan(1);
    // 출처 세트가 비면 오답 귀속과 복원이 성립하지 않는다.
    expect(items.every((i) => !!i.setId)).toBe(true);
  });

  // QuestionCard가 답안 키를 독립 조립하던 시절이라면 여기서 집계가 오르지 않는다.
  // 퀵에는 진행률(#progressText)이 없다 — 끝이 정해지지 않아 분모가 없다. 헤더 점수판이
  // 그 자리를 맡으므로 '답했다'의 증거도 거기서 읽는다.
  test("답을 고르면 헤더 점수판의 진행이 오른다", async ({ page }) => {
    await enterQuick(page, "ISTQB");
    await expect(quickStat(page, "solved")).toHaveText("0");
    await answerCurrent(page);
    await expect(quickStat(page, "solved")).toHaveText("1");
  });

  test("새로고침해도 같은 문항으로 이어 푼다", async ({ page }) => {
    await enterQuick(page, "CSTS");
    const before = await readQuickDrawIds(page, "csts");
    await answerCurrent(page);
    await expect(quickStat(page, "solved")).toHaveText("1");

    await page.reload();
    // 진입 시 항상 제품 게이트를 먼저 보여주는 것이 이 앱의 사양(#5)이라 다시 고른다 —
    // 제품을 고르는 순간 저장된 진행이 복원된다.
    await openProduct(page, "CSTS");
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    // 답안이 유지된다 = 같은 문항을 같은 키로 보고 있다.
    await expect(quickStat(page, "solved")).toHaveText("1");
    const after = await readQuickDrawIds(page, "csts");
    expect(after).toEqual(before);
  });

  // 사양 변경(B5): 서답형도 퀵에 나온다. 다만 한 회차를 점령하면 '퀵'이 아니므로 30% 상한을 둔다.
  // 상한은 총량이 아니라 접두 성질이다(drawQuick 주석) — 끝이 정해지지 않은 모드에서
  // '총량 30%'는 아무것도 막지 못하기 때문이다. 그래서 앞 20문항을 실제로 밟아 확인한다.
  test("서답형이 섞이되 앞 20문항에서 30%를 넘지 않는다", async ({ page }) => {
    await enterQuick(page, "CSTS");
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

  /**
   * 퀵에는 합격 판정이 뜨는 자리 자체가 없다.
   *
   * 종전에는 세션을 마감하는 채점이 결과 요약 모달을 띄웠고, 그 모달에서 '합격 기준 미달'을
   * 숨기는 것이 이 검사의 대상이었다. 지금은 채점이 문항 단위라 그 모달이 아예 없다 —
   * 짧은 표본에 합격/불합격을 붙이지 않는다는 결정이 구조로 굳었다.
   * 화면에 남는 것은 문항별 정답·해설과 헤더 점수판뿐이고, 둘 중 어디에도 판정어가 없어야 한다.
   */
  test("퀵에는 합격 판정이 없다 — 짧은 표본에 '기준 미달'은 오해를 만든다", async ({ page }) => {
    await enterQuick(page, "ISTQB");
    await answerCurrent(page); // 헬퍼가 문항 채점까지 한다

    await expect(page.locator("#feedback")).toBeVisible();
    await expect(page.getByTestId("result-summary"), "퀵에 세션 결과 모달이 떴다").toHaveCount(0);
    const screen = page.locator(".workspace");
    await expect(screen).not.toContainText("합격 기준 미달");
    await expect(screen).not.toContainText("합격 기준 충족");
    // 점수판은 %가 아니라 개수로 말한다 — 표본이 짧아 비율이 오해를 만든다.
    await expect(page.locator(".quick-scoreboard")).not.toContainText("%");
  });

  test("퀵 회차는 요약(응시 횟수·최고 정답률)을 부풀리지 않는다", async ({ page }) => {
    await enterQuick(page, "ISTQB");
    // 전 문항 정답을 고를 수 없으므로 한 문항만 채점한다 — 요약에 섞이는지만 본다.
    await answerCurrent(page); // 헬퍼가 문항 채점까지 한다
    await expect(page.locator("#feedback")).toBeVisible();

    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard")).toBeVisible();

    // '있어야 할 것'을 먼저 기다린다. 대시보드가 보이는 것과 챕터 표가 그려지는 것 사이에
    // 한 프레임이 있어, 그 전에 부재를 단언하면 아직 안 그려진 것을 '없다'고 통과시킨다.
    // count()는 재시도하지 않으므로 부재 단언에는 특히 위험하다(실제로 이 순서 때문에
    // 전수 실행에서 한 번 실패했다 — 단독 실행에서는 늘 통과해 원인이 안 보였다).
    //
    // 한 문항만 답했으므로 그 챕터의 표본은 1이다 — 순위표(MIN_CHAPTER_SAMPLE=5)가 아니라
    // '표본이 적은 챕터' 구간에 실린다. 둘 다 .sc-rate를 쓰므로 이 단언은 양쪽을 덮는다.
    await expect(page.locator(".sc-rate"),
      "퀵만 풀었더니 챕터 분석이 비었다").not.toHaveCount(0);

    // 실전 회차가 하나도 없으므로 요약 블록 자체가 뜨지 않아야 한다.
    await expect(page.locator(".stats-summary")).toHaveCount(0);
    // 사양 변경: 퀵은 회차 기록을 남기지 않는다 — 짧은 세션 목록에도 나오지 않는다.
    // (오답만 24시간 임시로 오답노트의 퀵 섹션에 남는다: react-quick-wrongnote.spec.ts)
    await expect(page.getByTestId("stats-mini-rounds")).toHaveCount(0);
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
    await enterQuick(page, "ISTQB");
    // 열 문항을 채점한다 — 채점이 곧 집계이므로, 여기서 세트 오답 버킷이 오염되면 드러난다.
    for (let i = 0; i < 10; i += 1) {
      await answerCurrent(page); // 복수정답도 다 고른 뒤 채점까지 한다
      if (!(await quickNext(page))) break;
    }

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
