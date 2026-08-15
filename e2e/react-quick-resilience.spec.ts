import { test, expect, Page } from "@playwright/test";
import { answerCurrent, enterQuick, openProduct, waitForList } from "./helpers";

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
