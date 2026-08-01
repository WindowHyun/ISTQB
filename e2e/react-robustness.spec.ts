import { test, expect } from "@playwright/test";
import { openProduct } from "./helpers";

const note = (s: string) => console.log("· " + s);

// 오류 주입 — 정상 앱이 만들지 않는 값을 사용자 경로(백업 가져오기)로 밀어 넣는다.
test("주입: 음수 elapsedSeconds 백업으로 제한시간을 늘릴 수 있는가", async ({ page }) => {
  test.setTimeout(120_000);
  // 파일시스템을 거치지 않고 메모리 버퍼로 넘긴다 — 절대 경로를 박으면 다른 머신·CI에서
  // ENOENT로 죽고, 임시 디렉터리를 쓰면 러너마다 정리 시점이 달라 불안정하다.
  const backup = JSON.stringify({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    product: "istqb",
    state: {
      mode: "exam",
      setId: "ISTQB-FL-V4-A",
      index: 0,
      elapsedSeconds: -86400, // 하루치 음수 — 남은 시간이 제한(60분)을 넘어서는지
      reviewIds: {}, navCollapsed: false, randomDraw: null, chapterFilter: null,
    },
    answers: {},
    histories: {},
  });

  await openProduct(page, "ISTQB");
  await page.getByRole("button", { name: "⚙ 설정" }).click();
  await page.locator('input[type="file"][accept=".json"]').setInputFiles({
    name: "evil-elapsed.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await expect(page.getByTestId("import-confirm-modal")).toBeVisible();
  await page.getByTestId("import-confirm").click();
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");

  await page.locator('.segmented button[data-mode="exam"]').click();
  const gate = page.getByTestId("exam-start-btn");
  if (await gate.count()) await gate.click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600);

  const shown = await page.locator("#timerText").innerText();
  const secs = shown.split(":").map(Number).reverse().reduce((a, v, i) => a + v * 60 ** i, 0);
  note(`주입 후 표시된 남은 시간: ${shown} (${secs}초) — 제한은 3600초`);
  // 남은 시간이 제한시간을 넘으면 새 시험을 시작하기만 해도 제한시간이 무력화된다.
  expect(secs).toBeLessThanOrEqual(3600);
});

/**
 * 서비스워커 등록 실패는 앱 코드의 오류가 아니다.
 *
 * WebKit에서 간헐적으로 `.../sw.js due to access control checks.`가 pageerror로 올라온다
 * (CI에서 1건 관측, 재시도에서 통과). 이 검사가 보려는 것은 '손상된 저장소를 만나도 앱이
 * 복구해서 뜨는가'이므로, 브라우저가 SW 스크립트를 가져오지 못한 것은 그 질문과 무관하다.
 * 그렇다고 pageerror를 통째로 무시하면 정작 잡아야 할 앱 오류까지 놓치므로, sw.js를
 * 지목하는 이 한 종류만 걸러 낸다.
 * (SW가 없을 때 앱이 제대로 degrade하는지는 별개 질문이다 — react-pwa가 담당한다.)
 */
const isServiceWorkerNoise = (msg: string) => /sw\.js.*access control checks/i.test(msg);

test("주입: 손상된 저장소에서도 앱이 뜬다", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    if (isServiceWorkerNoise(e.message)) return;
    errors.push("pageerror: " + e.message);
  });

  await page.goto("/");
  await page.evaluate(() => {
    // 사용자가 만들 수 없는 형태지만, 저장 중 탭이 죽거나 용량이 차면 실제로 잘린 값이 남는다.
    localStorage.setItem("istqb-fl-v4-sample-ui-state", "{ 잘린 JSON");
    localStorage.setItem("istqb-fl-v4-sample-answers", "null");
    localStorage.setItem("istqb-fl-v4-sample-history-snapshot", '{"a":');
    localStorage.setItem("istqb-theme", "그런테마없음");
    localStorage.setItem("istqb-q-font", "NaN");
  });
  await page.reload();
  await page.getByRole("button", { name: "ISTQB" }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  note(`손상 저장소 복구: 문항 렌더 OK / pageerror ${errors.length}건`);
  expect(errors).toEqual([]);
});

test("주입: localStorage 자체가 막힌 환경(시크릿 모드 모사)", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.addInitScript(() => {
    const blocked = () => { throw new DOMException("QuotaExceededError", "QuotaExceededError"); };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: blocked, setItem: blocked, removeItem: blocked, clear: blocked, key: blocked, length: 0 },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "ISTQB" }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await page.locator("#options .option").first().click();
  await expect(page.locator("#feedback")).toBeVisible();
  note(`localStorage 차단 상태: 풀이 가능 / pageerror ${errors.length}건`);
  expect(errors).toEqual([]);
});

test("주입: IndexedDB가 막힌 환경에서 채점·통계", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: { open: () => { throw new DOMException("blocked", "SecurityError"); } },
    });
  });
  await openProduct(page, "ISTQB");
  await page.locator('.segmented button[data-mode="exam"]').click();
  await page.getByTestId("exam-start-btn").click();
  await page.locator("#options .option").first().click();
  await page.getByTestId("grade-button").click();
  const c = page.getByTestId("confirm-grade");
  if (await c.count()) await c.click();
  await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByTestId("stats-open").click();
  await expect(page.getByTestId("stats-dashboard")).toBeVisible();
  note(`IndexedDB 차단 상태: 채점·통계 도달 / pageerror ${errors.length}건`);
  expect(errors).toEqual([]);
});

test("주입: 문항 데이터 요청이 실패하면 오류 안내와 재시도가 뜬다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("**/data/istqb/**", (r) => r.abort("failed"));
  await page.goto("/");
  await page.getByRole("button", { name: "ISTQB" }).click();
  await expect(page.getByTestId("load-error")).toBeVisible({ timeout: 20_000 });
  note(`네트워크 실패: ${(await page.getByTestId("load-error").innerText()).replace(/\n/g, " ").slice(0, 80)}`);
  // 재시도가 실제로 복구되는지 — 안내만 띄우고 못 벗어나면 앱이 잠긴다.
  await page.unroute("**/data/istqb/**");
  await page.getByTestId("load-retry").click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  note("재시도 후 복구: OK");
});

// 위 테스트는 '시험 시작 전' 주입이라 syncExamElapsed가 즉시 벽시계로 덮어썼다.
// 이미 응시 중(examStartedAt 존재)에 주입하면 다음 틱 전까지 창이 열리는지 본다.
test("주입: 응시 중에 음수 elapsedSeconds를 밀어 넣으면", async ({ page }) => {
  test.setTimeout(120_000);
  await openProduct(page, "ISTQB");
  await page.locator('.segmented button[data-mode="exam"]').click();
  await page.getByTestId("exam-start-btn").click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  // 답을 하나 남겨야 새로고침 후에도 게이트가 아닌 응시 상태로 복원된다.
  await page.locator("#options .option").first().click();
  note(`주입 전: ${await page.locator("#timerText").innerText()}`);

  // 스토어에 직접 밀어 넣는다(가져오기가 하는 것과 동일한 결과 상태).
  await page.evaluate(() => {
    const ls = localStorage.getItem("istqb-fl-v4-sample-ui-state");
    const o = JSON.parse(ls || "{}");
    o.elapsedSeconds = -86400;
    localStorage.setItem("istqb-fl-v4-sample-ui-state", JSON.stringify(o));
  });
  await page.reload();
  await page.getByRole("button", { name: "ISTQB" }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

  const immediate = await page.locator("#timerText").innerText();
  note(`복원 직후(틱 이전): ${immediate}`);
  await page.waitForTimeout(1500);
  const settled = await page.locator("#timerText").innerText();
  note(`1.5초 후(틱 이후): ${settled}`);

  const secs = (t: string) => t.split(":").map(Number).reverse().reduce((a, v, i) => a + v * 60 ** i, 0);
  expect(secs(settled)).toBeLessThanOrEqual(3600);
  expect(secs(immediate)).toBeLessThanOrEqual(3600); // 한 틱이라도 제한을 넘겨 보이면 안 된다
});
