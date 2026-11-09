import { readFileSync } from "fs";
import path from "path";
import { test, expect, Page } from "./fixtures";
import { enterExam, goNextQuestion, modeBtn, openSet } from "./helpers";

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

// IndexedDB에 저장된 회차(history)의 요약 — 채점 결과가 기록에 어떻게 남았는지 본다.
async function readRounds(page: Page) {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("istqb-db", 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return new Promise<{ correct: number; total: number; wrong: number }[]>((res) => {
      const tx = db.transaction("history", "readonly");
      const q = tx.objectStore("history").getAll();
      q.onsuccess = () => res(q.result.map((h: { correct: number; total: number; wrongItems?: unknown[] }) => (
        { correct: h.correct, total: h.total, wrong: h.wrongItems?.length ?? 0 }
      )));
    });
  });
}

// 데이터 파일의 앞 n문항(보기형)과 정답 키 — 시험 모드는 세트 순서 그대로 출제한다.
function firstChoiceQuestions(file: string, n: number): { number: number; answer: string[] }[] {
  const data = JSON.parse(readFileSync(path.resolve(process.cwd(), "www/data", file), "utf8"));
  const qs = data.questions.slice(0, n) as { number: number; type: string; answer: string[] }[];
  expect(qs.every((q) => q.type === "multiple_choice"), "앞 문항이 보기형이 아니면 이 테스트의 풀이 절차를 고쳐야 한다").toBe(true);
  return qs;
}

// 앞 문항을 차례로 정답으로 푼다(시험은 세트 순서 그대로 출제한다).
async function answerAll(page: Page, solved: { number: number; answer: string[] }[]) {
  for (const [i, q] of solved.entries()) {
    if (i > 0) expect(await goNextQuestion(page), "다음 문항으로 넘어가지 못했다").toBe(true);
    for (const key of q.answer) {
      await page.getByRole("button", { name: new RegExp(`^선택지 ${key}(,|$)`) }).click();
    }
  }
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
    const rounds = await readRounds(page);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].total).toBe(40); // 0이 아니어야 한다
  });

  // 위 두 테스트는 '꺼졌다 켜진 뒤 복원'만 덮는다. 그 경로에서는 복원된 답안이 타이머 effect가
  // 만들어지기 전에 이미 스토어에 있어서, effect가 붙잡은 채점 함수가 **만들어진 시점의 답안**을
  // 읽는 결함이 가려진다(앱이 켜진 채 만료되면 채점은 빈 답안으로 돌아 40문항이 전부 오답으로
  // 기록되는데, 결과 모달만 렌더 때 값을 읽어 정답으로 보인다). 가짜 시계로 응시 도중에
  // 만료시켜 그 경로를 직접 탄다 — 설치 뒤에도 시간은 정상 속도로 흐르고, 건너뛰기는 한 번이다.
  test("응시 도중 제한시간이 끝나면 그때까지 고른 답안으로 채점·기록된다", async ({ page }) => {
    const solved = firstChoiceQuestions("istqb/sample-a.json", 3);
    await page.clock.install();
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);

    await answerAll(page, solved);

    await page.clock.fastForward("01:01:00"); // 60분 제한을 넘긴다 — 앱은 켜진 채다
    await expect(page.getByTestId("result-summary")).toBeVisible();

    // 저장은 비동기이므로 기다린다. 정답 3문항이 그대로 기록돼야 한다(결함: correct 0 · 오답 40).
    await expect.poll(() => readRounds(page), { message: "자동 제출 회차가 고른 답안과 다르게 기록됐다" })
      .toEqual([{ correct: solved.length, total: 40, wrong: 40 - solved.length }]);
  });

  // 같은 결함이 백그라운드 복귀 경로에도 있었다(visibilitychange → checkExamDeadline). 화면이 가려진 동안은
  // 타이머가 멈추므로 시계만 건너뛰어서는 만료가 안 걸린다 — 숨김 → 시계 점프 → 복귀의 순서로 탄다.
  test("백그라운드에 있다가 돌아와 만료를 처리해도 그때까지 고른 답안으로 기록된다", async ({ page }) => {
    const solved = firstChoiceQuestions("istqb/sample-a.json", 3);
    await page.clock.install();
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await answerAll(page, solved);

    const setHidden = (hidden: boolean) => page.evaluate((h) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);

    await setHidden(true);
    await page.clock.fastForward("01:01:00"); // 가려진 동안 제한시간이 지난다
    await expect(page.getByTestId("result-summary")).toHaveCount(0); // 아직 아무도 제출하지 않았다
    await setHidden(false);
    await expect(page.getByTestId("result-summary")).toBeVisible();

    await expect.poll(() => readRounds(page), { message: "복귀 시 자동 제출 회차가 고른 답안과 다르게 기록됐다" })
      .toEqual([{ correct: solved.length, total: 40, wrong: 40 - solved.length }]);
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
