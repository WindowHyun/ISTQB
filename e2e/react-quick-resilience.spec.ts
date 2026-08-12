import { test, expect, Page } from "@playwright/test";
import { openProduct } from "./helpers";

/**
 * 퀵의 취약 지점 두 가지를 실제 브라우저에서 고정한다.
 *
 * 1) 부분 로드 실패(E) — 퀵만 제품의 전 세트를 동시에 연다. 종전에는 Promise.all이라
 *    12세트 중 하나만 404·타임아웃이어도 퀵 전체가 에러 화면이 됐다. 다른 모드는 세트
 *    하나만 열어 이 취약성이 없어서, 유닛으로는 드러나지 않는 퀵 고유의 결함이었다.
 *    오프라인(서비스워커 캐시 부분 적중)에서 실재하는 조건이다.
 *
 * 2) 퀵 채점 후 새로고침 왕복 — 회귀 가드다(결함 재현 검사가 아니다).
 *    스토어 구독이 quickRounds를 감시하지 않는 문제(A)를 이 검사로 잡을 수는 없다:
 *    실측해 보니 구독 수정을 되돌려도 통과한다. 채점이 setGraded를 함께 호출하고,
 *    QuestionWorkspace의 타이머 effect가 isGraded를 의존성에 둬 그 cleanup의
 *    flushPersist()가 이미 동기로 저장하기 때문이다. A의 계약은 순수 상태 계층
 *    (storage.quickrounds.test.ts)에서 못 박고, 여기서는 브라우저 전체 왕복이
 *    실제로 성립하는지만 지킨다 — 두 저장 경로 중 무엇이 일하든 결과는 같아야 한다.
 */

async function startQuick(page: Page) {
  await openProduct(page, "ISTQB");
  const btn = page.locator('.segmented button[data-mode="quick"]');
  if (!(await btn.isVisible())) await page.getByTestId("drawer-open").click();
  await btn.click();
}

async function answerCurrent(page: Page) {
  const short = page.locator(".short-answer-input");
  const blanks = await short.count();
  if (blanks) {
    for (let i = 0; i < blanks; i += 1) await short.nth(i).fill("테스트");
    return;
  }
  await page.locator("#options .option").first().click();
}

async function gradeAll(page: Page, size: number) {
  for (let i = 0; i < size; i += 1) {
    await answerCurrent(page);
    const next = page.locator("#nextBtn");
    if (!(await next.count()) || (await next.isDisabled())) break;
    await next.click();
  }
  // 채점 전에 대기 중인 저장을 모두 흘려보낸다. 이게 없으면 마지막 문항 이동(index는
  // 감시 대상)이 걸어 둔 500ms 디바운스가 채점 뒤에 발화해 quickRounds를 덤으로 실어
  // 나른다 — 결함이 있어도 검사가 통과한다(실제로 그렇게 통과했다).
  await page.waitForTimeout(900);
  await page.getByTestId("grade-button").click();
  const confirm = page.getByTestId("confirm-grade");
  if (await confirm.count()) await confirm.click();
  await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();
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

    // 진행률 분모가 정상적으로 잡혀 풀 수 있는 상태여야 한다.
    await expect(page.locator("#progressText")).toContainText("/ 10");
    await answerCurrent(page);
    await expect(page.locator("#progressText")).toContainText("1 / 10");
  });

  test("퀵 채점 직후 새로고침해도 회차와 퀵 오답이 남는다(왕복 가드)", async ({ page }) => {
    await startQuick(page);
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
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
    await startQuick(page);
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

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
});
