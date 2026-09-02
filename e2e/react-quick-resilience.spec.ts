import { test, expect } from "@playwright/test";
import { openProduct, answerQuick } from "./helpers";

/**
 * 퀵의 취약 지점 — 부분 로드 실패(E).
 *
 * 퀵만 제품의 전 세트를 동시에 연다. 종전에는 Promise.all이라 12세트 중 하나만
 * 404·타임아웃이어도 퀵 전체가 에러 화면이 됐다. 다른 모드는 세트 하나만 열어 이
 * 취약성이 없어서, 유닛으로는 드러나지 않는 퀵 고유의 결함이었다.
 * 오프라인(서비스워커 캐시 부분 적중)에서 실재하는 조건이다.
 *
 * 무한 모드가 되면서 이 위험은 오히려 커졌다 — 출제 순서가 풀 전체이므로 한 세트를
 * 못 읽으면 그 세트 문항이 세션 내내 한 번도 나오지 않는다.
 */

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

    const start = page.getByTestId("quick-start-btn");
    if (!(await start.isVisible())) await page.getByTestId("drawer-open").click();
    await start.click();

    // 문항이 실제로 떠야 한다 — 종전에는 여기서 에러 배너가 떴다.
    await expect(
      page.locator("#questionStem"),
      "세트 하나가 실패했다고 퀵 전체가 죽었다",
    ).toBeVisible({ timeout: 20_000 });
    expect(blockedHits, "테스트가 아무 세트도 막지 못했다(가정 붕괴)").toBeGreaterThan(0);

    // 살아남은 세트로 실제로 풀 수 있어야 한다 — 점수판이 오르면 출제가 성립한 것이다.
    // 확정 절차는 공용 헬퍼로 — 보기 하나만 누르면 복수정답 문항이 뽑힌 실행에서만 실패한다.
    await expect(page.getByTestId("qs-solved")).toHaveText("0");
    await answerQuick(page);
    await expect(page.getByTestId("qs-solved")).toHaveText("1");
  });
});
