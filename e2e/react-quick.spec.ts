import { expect, Page, test } from "./fixtures";
import { answerCurrent, enterQuick, openProduct, quickNext, quickStat, waitForList } from "./helpers";

// 퀵 랜덤 — 출제·이어풀기·복원력·퀵 오답 사양.

// ── react-quick.spec.ts에서 합침 ────────────────────────────────────────
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
    // 퀵에는 앞으로 가는 화살표가 없다 — 채점해야 '다음 문제'가 열린다. 유형 비율을 재려면
    // 훑는 문항을 실제로 풀며 지나가야 한다(answerCurrent가 답하고 채점까지 한다).
    for (let i = 0; i < 20; i += 1) {
      visited += 1;
      if (await page.locator(".short-answer-input").count()) shortAnswers += 1;
      await answerCurrent(page);
      if (!(await quickNext(page))) break;
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
    // (오답만 24시간 임시로 오답노트의 퀵 섹션에 남는다: 이 파일의 '퀵 오답' 부분)
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

// ── react-quick-resilience.spec.ts에서 합침 ────────────────────────────────────────
/**
 * 퀵의 취약 지점 두 가지를 실제 브라우저에서 고정한다.
 *
 * 1) 부분 로드 실패(E) — 퀵만 제품의 전 세트를 동시에 연다. 종전에는 Promise.all이라
 *    12세트 중 하나만 404·타임아웃이어도 퀵 전체가 에러 화면이 됐다. 다른 모드는 세트
 *    하나만 열어 이 취약성이 없어서, 유닛으로는 드러나지 않는 퀵 고유의 결함이었다.
 *    오프라인(서비스워커 캐시 부분 적중)에서 실재하는 조건이다.
 *
 * 2) 퀵 채점 후 새로고침 왕복 — 회귀 가드다(결함 재현 검사가 아니다).
 *    이제 퀵의 채점은 문항 단위라 setGraded를 부르지 않는다. 그래서 종전에 저장을
 *    대신 촉발하던 경로(채점 → isGraded 변경 → 타이머 effect cleanup의 flushPersist)가
 *    없어졌고, quickRounds를 감시하는 스토어 구독이 **유일한** 저장 경로다.
 *    그 계약은 순수 상태 계층(storage.quickrounds.test.ts)에서 못 박고, 여기서는
 *    브라우저 전체 왕복이 실제로 성립하는지를 지킨다.
 *
 * 3) 느린 출제(진입 경계) — 세그먼트를 누르는 순간 헤더·점수판은 퀵의 것이 되지만 문항은
 *    전 세트를 다 연 뒤에야 온다. 그 사이 화면에 남아 있는 것은 **직전 연습 세트의 목록**
 *    이다. 검사가 그 구간을 '진입 완료'로 읽으면 옛 목록을 재게 되므로, 진입 헬퍼가
 *    출제까지 기다리는지를 여기서 고정한다.
 */

/**
 * 퀵에서 size 문항을 **채점까지** 마친다.
 *
 * 퀵은 한 문항씩 채점하고 넘어가는 모드라, 답만 고르고 지나가면 회차에도 오답 목록에도
 * 아무것도 남지 않는다(answerCurrent가 채점까지 맡는다). 종전에는 문항을 훑어 답만 해
 * 두고 마지막에 '채점하기'로 한 번에 마감했다.
 */
async function gradeAll(page: Page, size: number) {
  for (let i = 0; i < size; i += 1) {
    await answerCurrent(page); // 헬퍼가 문항 채점까지 한다
    const next = page.getByTestId("quick-next-btn");
    if (!(await next.count())) break; // 마지막 문항 — 더 갈 곳이 없다
    await next.click();
  }
  // 대기 중인 저장을 흘려보낸다. 이게 없으면 마지막 조작이 걸어 둔 500ms 디바운스가
  // 검사의 읽기 뒤에 발화해, 저장되지 않은 상태를 '저장됐다'고 읽거나 그 반대가 된다.
  await page.waitForTimeout(900);
}

test.describe("퀵 — 복원력", () => {
  test("세트 하나를 못 불러와도 나머지로 출제한다(전멸이 아니다)", async ({ page }) => {
    // 먼저 정상 진입한다 — 기본 세트(sample-a)를 막으면 연습 모드 진입 자체가 실패해
    // 퀵의 부분 실패가 아니라 다른 경로를 재는 검사가 된다.
    await openProduct(page, "ISTQB");

    // 아직 로드되지 않은 세트 하나만 실패시킨다(로더는 Promise 캐시라 이미 연 세트는
    // 재요청하지 않는다). 퀵은 전 세트를 여니 이 세트에서 실패를 만난다.
    let blockedHits = 0;
    await page.route("**/data/istqb/sample-extra.json", async (route) => {
      blockedHits += 1;
      await route.fulfill({ status: 503, body: "blocked for test" });
    });

    const btn = page.locator('.segmented button[data-mode="quick"]');
    if (!(await btn.isVisible())) await page.getByTestId("drawer-open").click();
    await btn.click();

    // 문항이 실제로 떠야 한다 — 종전에는 여기서 에러 배너가 떴다.
    await expect(
      page.locator("#questionStem"),
      "세트 하나가 실패했다고 퀵 전체가 죽었다",
    ).toBeVisible({ timeout: 20_000 });
    expect(blockedHits, "테스트가 아무 세트도 막지 못했다(가정 붕괴)").toBeGreaterThan(0);
    // 남은 세트로 만든 목록이 실제로 실린 뒤에 센다 — 지문만 보고 세면 직전 연습 세트의
    // 문항을 퀵의 것으로 착각한 채 답하게 된다.
    await waitForList(page, { mode: "quick" });

    // 풀 수 있는 상태여야 한다. 퀵에는 진행률(분모)이 없으므로 헤더 점수판에서 읽는다 —
    // 한 세트가 빠져도 나머지로 출제가 이어지는지가 요점이고, 회차 크기는 데이터가 정한다.
    const solved = page.locator(".quick-scoreboard .qs-item").first().locator("b");
    await expect(solved).toHaveText("0");
    await answerCurrent(page);
    await expect(solved).toHaveText("1");
  });

  test("퀵 채점 직후 새로고침해도 회차와 퀵 오답이 남는다(왕복 가드)", async ({ page }) => {
    await enterQuick(page, "ISTQB");
    await gradeAll(page, 10);

    // 채점 외에는 아무것도 건드리지 않고 곧바로 새로고침한다 — 다른 상태 변경이
    // 저장을 대신 촉발해 결함을 가리지 않게 한다. 디바운스(500ms)만 넘긴다.
    await page.waitForTimeout(900);
    await page.reload();

    const rounds = await page.evaluate(() => {
      const raw = localStorage.getItem("istqb-fl-v4-sample-ui-state");
      return raw ? (JSON.parse(raw).quickRounds ?? []) : [];
    });
    expect(rounds.length, "새로고침 뒤 퀵 회차가 남아 있지 않다").toBeGreaterThan(0);

    // 오답이 있었다면 오답노트에서도 보여야 한다(출처 세트별로 갈라 담긴다).
    const wrongCount = rounds.reduce(
      (n: number, r: { wrongItems?: unknown[] }) => n + (r.wrongItems?.length ?? 0),
      0,
    );
    if (wrongCount > 0) {
      await openProduct(page, "ISTQB");
      const noteBtn = page.getByRole("button", { name: "오답 노트" });
      if (!(await noteBtn.isVisible())) await page.getByTestId("drawer-toggle").click();
      await noteBtn.click();
      await expect(
        page.getByTestId("quick-wrong-note"),
        "새로고침 뒤 오답노트에 퀵 오답이 없다",
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("퀵에서는 '오답 다시 풀기'를 내리고 갈 곳을 안내한다", async ({ page }) => {
    await enterQuick(page, "ISTQB");

    const drawer = page.getByTestId("drawer-toggle");
    if (await drawer.isVisible()) await drawer.click();

    // 퀵 오답은 세트 오답 버킷에 담기지 않는 사양이라, 이 버튼은 눌러도 될 수 없다.
    // 종전에는 버튼이 남아 있으면서 늘 "퀵에서 틀린 문항이 없습니다"라고 답했다.
    await expect(
      page.getByRole("button", { name: "오답 다시 풀기" }),
      "퀵에서 동작할 수 없는 버튼이 그대로 노출된다",
    ).toHaveCount(0);
    await expect(page.getByTestId("quick-review-hint")).toBeVisible();
    // 대체 경로(오답 노트)는 같은 자리에 남아 있어야 한다 — 안내가 막다른 길이면 안 된다.
    await expect(page.getByRole("button", { name: "오답 노트" })).toBeVisible();
  });

  test("출제가 느려도 진입은 목록이 실린 뒤에 끝난다(점수판이 먼저 뜬다)", async ({ page }) => {
    // 연습 세트가 실린 상태에서 시작한다 — 퀵이 덮기 전까지 화면에 남아 있을 목록이다.
    await openProduct(page, "ISTQB");
    // 지금 실린 목록의 주인을 워크스페이스의 data-list-* 로 읽는다.
    // 종전에는 팔레트 요약("문항 목록 1 / 40")의 분모로 쟀는데, 퀵에서는 팔레트를 렌더하지
    // 않으므로(이동 수단을 ‹ › 로 한정) 두 모드를 같은 자로 잴 수 없다. 세트 id까지 함께
    // 보는 이유는 mode만으로는 "새 맥락 + 옛 목록"의 옛 쪽이 무엇이었는지 못 잡기 때문이다.
    const listOwner = async () => {
      const ws = page.locator(".workspace");
      return { mode: await ws.getAttribute("data-list-mode"), set: await ws.getAttribute("data-list-set") };
    };
    const practiceOwner = await listOwner();
    expect(practiceOwner.set, "연습 세트의 목록을 읽지 못했다(가정 붕괴)").toBeTruthy();

    // 아직 열지 않은 세트의 응답을 늦춰 그 구간을 넓힌다. 늦추지 않으면 이 검사는 진입
    // 6/40회에서만 결함을 만나 — 고쳐도 안 고쳐도 대체로 통과하는 무력한 검사가 된다.
    await page.route("**/data/istqb/*.json", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });

    await enterQuick(page);

    // 헬퍼가 돌아온 **그 순간**을 잰다. 재시도하는 단언을 쓰면 기다리는 사이 목록이 도착해,
    // 일찍 돌려주는 헬퍼로도 통과해 버린다(getAttribute·textContent는 재시도하지 않는다).
    const owner = await listOwner();
    expect(
      owner.set,
      `진입이 끝났는데 화면에는 아직 연습 세트(${practiceOwner.set})의 목록이 있다 — 헬퍼가 출제 전에 돌려줬다`,
    ).not.toBe(practiceOwner.set);
    expect(owner.mode, "목록의 주인이 아직 퀵이 아니다").toBe("quick");
  });
});

// ── react-quick-wrongnote.spec.ts에서 합침 ────────────────────────────────────────
/**
 * 퀵 오답의 새 사양 — 회차 기록은 남기지 않고, 오답만 24시간 임시로 보여준다.
 * 세트 그룹과 섞이지 않아야 하고(세트를 다 푼 것이 아니므로), 통계 요약에도 안 잡혀야 한다.
 */

async function openBar(page: Page) {
  if (!(await page.locator(".segmented").isVisible())) await page.getByTestId("drawer-open").click();
}

/**
 * 퀵을 한 회차 풀고 채점한다. `count`는 '몇 문항을 풀 것인가'다 — 종전의 size(회차 크기)와
 * 다르다. 퀵은 문항 수를 고르지 않고 전 세트를 끝까지 내므로, 회차 크기는 데이터가 정하고
 * 검사가 정하는 것은 "몇 개까지 풀고 채점할 것인가"뿐이다.
 */
async function playQuick(page: Page, count: string) {
  await openBar(page);
  // 이미 퀵이면 재추첨 버튼으로, 아니면 세그먼트로 들어간다(회차마다 새로 섞기 위해).
  const inQuick = await page.getByTestId("quick-start-btn").count();
  if (inQuick) {
    await page.getByTestId("quick-start-btn").click();
  } else {
    await page.locator('.segmented button[data-mode="quick"]').click();
    // 진입은 목록이 실린 뒤가 끝이다(직전 세트의 문항이 남아 있는 구간이 있다).
    // 재추첨(quick-start-btn)은 맥락이 그대로라 이 대기로 구분되지 않는다 — 그쪽은
    // 아래 루프가 문항을 실제로 눌러 보며 진행한다.
    await waitForList(page, { mode: "quick" });
  }
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  // 퀵은 한 문항씩 채점하고 넘어간다 — 채점이 곧 집계이고, 세션을 마감하는 절차는 없다.
  // (종전에는 여기서 문항을 훑어 답만 해 두고 마지막에 '채점하기'로 한 번에 마감했다.)
  for (let i = 0; i < Number(count); i += 1) {
    // answerCurrent는 복수정답이면 정답 개수만큼 고른 뒤 채점까지 한다. 보기를 하나만
    // 누르는 루프로는 복수정답 문항에서 채점이 열리지 않아 그 자리에 멈춘다.
    await answerCurrent(page);
    if (!(await quickNext(page))) break; // 마지막 문항이거나 채점되지 않았다
  }
}

test("퀵 오답은 별도 목록으로 보이고 세트 그룹과 섞이지 않는다", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");
  await playQuick(page, "10");

  await openBar(page);
  await page.getByRole("button", { name: /오답 노트/ }).first().click();
  await expect(page.getByTestId("wrong-note")).toBeVisible({ timeout: 20_000 });

  // 퀵 전용 목록이 있어야 한다 — 없으면 방금 틀린 것을 볼 방법이 없다.
  await expect(page.getByTestId("quick-wrong-note")).toBeVisible();
  expect(await page.getByTestId("quick-wrong-item").count()).toBeGreaterThan(0);
  await expect(page.getByTestId("quick-wrong-note")).toContainText("24시간");

  // 세트 그룹에는 들어가지 않는다(세트를 다 푼 기록이 아니다).
  expect(await page.getByTestId("wrong-note-set-btn").count(),
    "퀵 오답이 세트 그룹으로 새어 들어갔다").toBe(0);
});

test("퀵은 회차 기록을 남기지 않는다(이력·요약에 안 잡힘)", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");
  await playQuick(page, "10");

  // IndexedDB에 퀵 회차가 저장되면 안 된다.
  const stored = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("istqb-db", 1);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const all: { mode?: string }[] = await new Promise((res) => {
      const tx = db.transaction("history", "readonly");
      const q = tx.objectStore("history").getAll();
      q.onsuccess = () => res(q.result);
    });
    return all.map((h) => h.mode);
  });
  expect(stored, `퀵이 이력에 저장됐다: ${JSON.stringify(stored)}`).not.toContain("quick");

  await openBar(page);
  await page.getByTestId("stats-open").click();
  const dash = page.getByTestId("stats-dashboard");
  await expect(dash).toBeVisible();
  // 회차로는 어디에도 안 잡힌다 — 요약(응시 횟수)·타임라인·짧은 세션 목록 모두.
  await expect(page.locator(".stats-summary"), "퀵이 응시 횟수로 잡혔다").toHaveCount(0);
  await expect(page.getByTestId("stats-mini-rounds"), "퀵이 짧은 세션 목록에 남았다").toHaveCount(0);
  await expect(page.getByTestId("mini-round-item")).toHaveCount(0);
  // 그러나 챕터 분석에는 기여한다 — 여기까지 비면 퀵으로 공부한 것이 통째로 사라진다.
  // 10문항이면 챕터당 표본이 작아 '판단하기 이른 챕터' 쪽에 실릴 수 있으므로 둘 다 센다.
  const chapterRows = await page.locator(".sc-rate").count();
  expect(chapterRows, "퀵만 풀었더니 챕터 분석이 비었다").toBeGreaterThan(0);
});

test("이력 비우기는 퀵 오답 임시 목록까지 지운다", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");
  await playQuick(page, "10");

  await openBar(page);
  await page.getByTestId("stats-open").click();
  await expect(page.getByTestId("stats-dashboard")).toBeVisible();
  // 퀵만 있어도 비우기 진입로가 있어야 한다 — 없으면 지울 방법이 24시간 대기뿐이다.
  await page.getByRole("button", { name: "이력 비우기" }).click();
  await page.getByTestId("stats-clear-confirm").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("stats-dashboard")).toBeHidden();

  await openBar(page);
  await page.getByRole("button", { name: /오답 노트/ }).first().click();
  await expect(page.getByTestId("wrong-note")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("quick-wrong-note"), "비우기 후에도 퀵 오답이 남았다").toHaveCount(0);

  // 새로고침해도 되살아나지 않는다(localStorage 영속분까지 지워졌는가).
  await page.keyboard.press("Escape");
  await openProduct(page, "ISTQB");
  await openBar(page);
  await page.getByRole("button", { name: /오답 노트/ }).first().click();
  await expect(page.getByTestId("wrong-note")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("quick-wrong-note"), "새로고침하니 퀵 오답이 되살아났다").toHaveCount(0);
});

/**
 * 퀵 오답은 **본문 화면**에서 열린다 — 팝업 안이 아니다.
 *
 * 종전에는 이 목록이 보기 전용이었다(내 답·정답만). 퀵은 출처 세트가 문항마다 달라
 * "세트를 고르고 번호를 찾는" 노트의 기존 3단계로는 닿을 수 없었기 때문이다. 지금은
 * 줄마다 '오답 보기'가 있고, 누르면 노트가 닫히며 그 문항이 본문에 펼쳐진다.
 *
 * 세 가지를 함께 본다 — 노트가 닫히는가 / 지문·해설이 실제로 뜨는가 / 돌아갈 길이 있는가.
 * 마지막이 빠지면 사용자는 오답 화면에 갇힌다(풀던 회차로 돌아갈 방법이 없다).
 */
test("퀵 오답의 '오답 보기'는 팝업이 아니라 본문 화면으로 연다", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");
  await playQuick(page, "12");

  await openBar(page);
  await page.getByRole("button", { name: /오답 노트/ }).first().click();
  await expect(page.getByTestId("wrong-note")).toBeVisible({ timeout: 20_000 });
  const items = page.getByTestId("quick-wrong-item");
  expect(await items.count(), "퀵 오답이 하나도 없다(가정 붕괴)").toBeGreaterThan(0);

  await page.getByTestId("quick-wrong-open").first().click();

  // 팝업은 닫히고, 본문이 오답 화면으로 바뀐다.
  await expect(page.getByTestId("wrong-note"), "오답 보기인데 팝업이 그대로 떠 있다").toHaveCount(0);
  const screen = page.getByTestId("wrong-view-screen");
  await expect(screen).toBeVisible({ timeout: 20_000 });

  // 지문과 해설이 실제로 실린다 — 내 답/정답만 보여 주던 종전 목록과의 차이가 여기다.
  // 지문은 #questionStem을 이어받는다: 앱 셸의 스킵 링크('본문 바로가기')가 그 id를
  // 가리키므로, 풀이 화면을 대신하는 이 화면에도 같은 목적지가 있어야 키보드 사용자가
  // 본문으로 건너뛸 수 있다.
  await expect(screen.locator("#questionStem")).toBeVisible();
  await expect(page.locator("#questionStem"), "스킵 링크 목적지가 둘이 됐다").toHaveCount(1);
  await expect(page.getByTestId("wrong-note-explain")).toBeVisible();
  await expect(screen, "내 답·정답 표기가 없다").toContainText("내 답");
  // 내 답과 정답이 보기에 색으로도 구분된다.
  await expect(page.locator(".wrong-note-options .option.correct")).not.toHaveCount(0);

  // 돌아갈 길 둘 — 노트로, 그리고 풀던 회차로.
  await page.getByTestId("wrong-view-back").click();
  await expect(page.getByTestId("wrong-note"), "'오답 노트'로 돌아가지 못했다").toBeVisible();
  await page.getByTestId("quick-wrong-open").first().click();
  await page.getByTestId("wrong-view-close").click();
  await expect(page.getByTestId("wrong-view-screen")).toHaveCount(0);
  await expect(page.locator(".quick-scoreboard"), "풀던 퀵 회차로 돌아오지 못했다").toBeVisible();

  // 뒤로가기도 돌아갈 길이다. 이 화면은 종전에 뒤로가기 가드에 등록되지 않았는데,
  // 화면을 통째로 차지해 풀이 화면이 언마운트된 상태였으므로 뒤로가기 한 번에
  // **페이지를 벗어났다**(APK에서는 해설을 읽다 앱이 그대로 종료됐다).
  // 되돌아가는 자리는 '풀이'가 아니라 **눌러서 들어온 노트**다.
  await openBar(page);
  await page.getByRole("button", { name: /오답 노트/ }).first().click();
  await expect(page.getByTestId("wrong-note")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("quick-wrong-open").first().click();
  await expect(page.getByTestId("wrong-view-screen")).toBeVisible({ timeout: 20_000 });

  await page.goBack();

  await expect(page.getByTestId("wrong-view-screen"), "뒤로가기가 오답 화면을 지나쳤다").toHaveCount(0);
  await expect(page.getByTestId("wrong-note"), "뒤로가기가 노트로 돌아가지 않았다").toBeVisible();
});
