import { test, expect, Page } from "./fixtures";
import { closeResult, enterExam, flushSaves, modeBtn, openSet, readHistoryRounds, submitGrade } from "./helpers";

// 남은 시간(#timerText)을 초로 읽는다 — "59:58" 또는 "1:00:00" 양쪽 표기를 다룬다.
async function remainingSeconds(page: Page): Promise<number> {
  const parts = (await page.locator("#timerText").innerText()).match(/\d+/g)?.map(Number) ?? [];
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}

// 저장된 '응시 시작 시각'을 과거로 밀어 앱이 꺼져 있던 시간을 흉내낸다.
async function rewindExamStart(page: Page, minutes: number) {
  await page.evaluate((min: number) => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes("examStartedAt")) continue;
      const o = JSON.parse(raw);
      const target = o.examStartedAt ? o : o.uiState;
      if (!target?.examStartedAt) continue;
      for (const id of Object.keys(target.examStartedAt)) target.examStartedAt[id] -= min * 60 * 1000;
      localStorage.setItem(k, JSON.stringify(o));
    }
  }, minutes);
}

// 시험 제한시간은 '응시 시작 벽시계'가 기준이어야 한다. 경과 누계만 쓰면 앱을 껐다 켠
// 시간이 빠져 60/90분 제한을 닫았다 열기만으로 무한히 늘릴 수 있었다.
test.describe("시험 제한시간", () => {
  test("앱이 꺼져 있던 시간도 제한시간에서 차감된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click(); // 응시 개시 흔적(복원 조건)
    const before = await remainingSeconds(page);
    expect(before).toBeGreaterThan(3500); // ISTQB 60분

    // 게이트로 빠져나가 저장을 확정시킨 뒤 조작한다 — 응시 중에 직접 건드리면
    // 언마운트 시 flushPersist가 메모리의 원래 값으로 덮어쓴다.
    await page.goto("/");
    await rewindExamStart(page, 20);

    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

    const after = await remainingSeconds(page);
    expect(after).toBeLessThan(before - 19 * 60); // 꺼져 있던 20분이 빠져야 한다
    expect(after).toBeGreaterThan(0);
  });

  test("꺼져 있는 사이 제한시간이 끝났으면 복귀 즉시 자동 제출된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();

    await page.goto("/");
    await rewindExamStart(page, 61); // 60분 제한을 넘긴 상태로 복귀

    await page.getByRole("button", { name: "ISTQB" }).click();
    // 자동 제출 → 결과 모달. 종전에는 시계가 멈춰 있어 그대로 계속 풀 수 있었다.
    await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });

    // 문항 로드를 기다리지 않고 제출하면 0/0 유령 회차가 남는다 —
    // 자동 제출은 canGrade를 거치지 않으므로 total 가드가 따로 필요하다.
    const rounds = await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const r = indexedDB.open("istqb-db", 1);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return new Promise<{ total: number }[]>((res) => {
        const tx = db.transaction("history", "readonly");
        const q = tx.objectStore("history").getAll();
        q.onsuccess = () => res(q.result.map((h: { total: number }) => ({ total: h.total })));
      });
    });
    expect(rounds).toHaveLength(1);
    expect(rounds[0].total).toBe(40); // 0이 아니어야 한다
  });
});

test.describe("시험 제한시간 — 자동 제출이 기록하는 것", () => {
  // 위 테스트는 '복원 직후' 만료만 본다 — 그때는 훅이 새로 만들어져 최신 답안을 읽는다. 응시를 시작한 채
  // 앱이 떠 있다가 만료되는 경우가 실제 사용이고, 그때 타이머 effect는 시작 시점의 렌더가 만든 채점
  // 함수를 붙잡고 있다. 그 함수가 클로저의 답안으로 채점하면 결과 모달은 실제 점수를 보이는데 저장된
  // 회차는 0점·전 문항 오답이 된다(total만 확인하던 종전 검사는 이를 못 잡았다).
  test("응시 중에 만료되면 그때까지 고른 답으로 회차가 기록된다", async ({ page }) => {
    await page.clock.install();
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    for (let i = 0; i < 3; i++) {
      await page.locator("#options .option").first().click();
      await page.locator("#nextBtn").click();
    }

    await page.clock.fastForward("01:01:00"); // 60분 제한 초과 — 앱은 계속 떠 있다
    await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });

    const rounds = await readHistoryRounds(page);
    expect(rounds).toHaveLength(1);
    expect(
      Object.keys(rounds[0].answers),
      "자동 제출이 시작 시점의 빈 답안으로 채점해 고른 답이 기록에 없다",
    ).toHaveLength(3);
    // 기록된 정답 수가 결과 모달이 보여 준 값과 같다.
    const shown = await page.getByTestId("result-summary").innerText();
    expect(shown).toContain(`${rounds[0].correct}`);
  });

  // graded는 비영속이다. 새로고침 뒤 답안만 남은 채 이 시험에 다시 들어가면, 채점 때 지워지지 않은
  // 시작 시각 때문에 옛 시각으로 제한시간을 판정해 같은 답안이 한 번 더 자동 제출됐다.
  test("채점한 시험은 새로고침 뒤 다시 들어가도 회차가 늘지 않고 새로 시작한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await closeResult(page);
    await modeBtn(page, "연습").click();
    await flushSaves(page);
    // 채점과 함께 제한시간의 시작 시각도 끝난다 — 저장소에 남아 있으면 다음 복원이 옛 시각을 읽는다.
    const savedStartedAt = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("istqb-fl-v4-sample-ui-state") ?? "{}").examStartedAt ?? {});
    expect(savedStartedAt, "채점이 끝났는데 응시 시작 시각이 저장소에 남아 있다").toEqual({});

    await page.goto("/");
    await rewindExamStart(page, 61); // 남은 기준점이 있다면 제한시간을 넘긴 시각으로 만든다
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

    await modeBtn(page, "시험").click();
    await expect(
      page.getByTestId("exam-start-gate"),
      "채점이 끝난 시험이 응시 중으로 되살아나 시작 게이트 없이 열렸다",
    ).toBeVisible({ timeout: 10_000 });
    expect(await readHistoryRounds(page), "같은 답안이 한 번 더 기록됐다").toHaveLength(1);
  });
});

// react-flow-ux에서 옮김 — 제한시간 기능을 한 파일에서 본다
test.describe("시험 제한시간(자격증별)", () => {
  test("ISTQB 시험은 60분 카운트다운으로 시작하고 게이트에 제한시간을 안내한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    // 시작 게이트에 제한시간 안내가 보인다.
    const gate = page.getByTestId("exam-start-gate");
    await expect(gate).toContainText("제한시간 60분");
    await expect(gate).toContainText("자동으로 제출");
    await page.getByTestId("exam-start-btn").click();
    // 경과가 아니라 남은 시간(60분 부근)이 표시된다. TimerClock은 사이드바·모바일 상단바
    // 두 곳에 렌더되므로 사이드바(#timerText)로 범위를 좁힌다.
    const remaining = page.locator("#timerText").getByTestId("timer-remaining");
    await expect(remaining).toBeVisible();
    await expect(remaining).toHaveText(/^(1:00:00|59:5\d)$/);
  });

  test("CSTS 시험은 90분으로 안내되고 남은 시간이 줄어든다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await modeBtn(page, "시험").click();
    await expect(page.getByTestId("exam-start-gate")).toContainText("제한시간 90분");
    await page.getByTestId("exam-start-btn").click();
    const remaining = page.locator("#timerText").getByTestId("timer-remaining");
    await expect(remaining).toHaveText(/^1:(29|30):\d\d$/); // 90분에서 카운트다운
    const first = await remaining.textContent();
    await expect(remaining).not.toHaveText(first ?? "", { timeout: 5_000 }); // 실제로 감소한다
  });

  test("연습 모드는 제한시간이 없어 경과 시간을 그대로 센다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await expect(page.locator("#timerText").getByTestId("timer-remaining")).toHaveCount(0);
    await expect(page.locator("#timerText")).toHaveText(/^\d\d:\d\d$/);
  });
});
