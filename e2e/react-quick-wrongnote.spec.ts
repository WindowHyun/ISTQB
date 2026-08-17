import { test, expect, Page } from "@playwright/test";
import { openProduct, waitForList, answerCurrent, quickNext} from "./helpers";

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
});
