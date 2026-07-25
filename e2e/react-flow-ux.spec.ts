import { test, expect } from "@playwright/test";
import { completeAttempt, enterExam, modeBtn, openSet, submitGrade, closeResult } from "./helpers";

// 흐름·기획 개선(S1~S6) — 응시 포기, 채점 완료 회차 새로고침 가드, 챕터 미니 시험,
// 랜덤 초기화 안내·새 문제 뽑기, 오답 극복 배지.

test.describe("응시 포기(S2)", () => {
  test("응시 중 '응시 포기' → 확인 → 답안 삭제·게이트 복귀, 회차 기록 없음", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();

    await page.getByTestId("quit-exam-btn").click();
    await expect(page.getByTestId("quit-exam-modal")).toBeVisible();
    await page.getByTestId("quit-exam-confirm").click();

    // 시작 게이트로 복귀 + 잠금 해제(다른 모드 버튼 활성).
    await expect(page.getByTestId("exam-start-gate")).toBeVisible();
    await expect(page.locator('.segmented button[data-mode="practice"]')).toBeEnabled();
    // 회차 기록이 없어야 한다 — 통계는 빈 상태 안내.
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard")).toContainText("아직 채점한 기록이 없습니다");
  });

  test("응시 중 '처음 화면으로'는 확인을 거쳐 이동한다(무단 우회 차단)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();

    await page.locator(".settings-open-btn", { hasText: "설정" }).click();
    await page.locator(".settings-action", { hasText: "처음 화면으로" }).click();
    // 바로 이동하지 않고 확인 모달이 먼저 뜬다.
    await expect(page.getByTestId("confirm-home-modal")).toBeVisible();
    await page.getByTestId("confirm-home-go").click();
    await expect(page.getByRole("heading", { name: "학습할 자격증을 선택하세요" })).toBeVisible();
  });
});

test.describe("채점 완료 회차 새로고침 가드(S4)", () => {
  test("채점 후 새로고침하면 이어풀기 대신 '채점 완료된 회차' 안내가 뜬다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await completeAttempt(page);
    await page.waitForTimeout(900); // debounce 저장 대기

    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    const guard = page.getByTestId("graded-resume-modal");
    await expect(guard).toBeVisible();
    await expect(guard).toContainText("이미 채점을 마친 회차");
    // 일반 이어풀기 모달은 뜨지 않는다.
    await expect(page.getByTestId("resume-prompt-modal")).toHaveCount(0);

    // '지난 결과 보기' → 결과 모달 + 채점 상태 복원(점수 표시).
    await page.getByTestId("graded-resume-view").click();
    await expect(page.getByTestId("result-summary")).toBeVisible();
    await closeResult(page);
    await expect(page.getByTestId("score")).toBeVisible();
  });

  test("'새 회차 시작'을 고르면 답안이 비워지고 시작 게이트부터", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await completeAttempt(page);
    await page.waitForTimeout(900);

    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.getByTestId("graded-resume-modal")).toBeVisible();
    await page.getByTestId("graded-resume-fresh").click();
    await expect(page.getByTestId("exam-start-gate")).toBeVisible();
  });
});

test.describe("챕터 미니 시험(S3)", () => {
  test("통계 → 미니 시험: 챕터 10문항 추첨·채점 시 '미니' 회차로 기록, 세트 타임라인엔 미포함", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await completeAttempt(page); // 챕터 통계 생성

    await page.getByTestId("stats-open").click();
    await page.getByTestId("chapter-minitest-btn").first().click();

    // 미니 시험 배너 + 문항 수 ≤10.
    const banner = page.getByTestId("chapter-filter-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("미니 시험");
    const totalText = await page.locator("#progressText").textContent();
    const total = Number(totalText?.split("/")[1]?.trim());
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(10);

    // 채점 → 결과 모달의 회차 라벨이 '미니'로 구분된다.
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(page.getByTestId("result-compare")).toContainText("미니");
    await closeResult(page);

    // 세트 타임라인 회차 칩은 여전히 1개(미니 회차는 세트 회차가 아님).
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("set-timeline-item").first().locator(".stl-rounds li")).toHaveCount(1);
  });

  test("미니 시험 진행 중 새로고침 → 같은 챕터·문항으로 이어푼다(일반 랜덤으로 바뀌지 않음)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await completeAttempt(page); // 챕터 통계 생성
    await page.getByTestId("stats-open").click();
    await page.getByTestId("chapter-minitest-btn").first().click();

    const banner = page.getByTestId("chapter-filter-banner");
    await expect(banner).toBeVisible();
    const chapterBefore = (await banner.locator("strong").textContent()) || "";
    const totalBefore = (await page.locator("#progressText").textContent())?.split("/")[1]?.trim();
    await page.locator("#options .option").first().click(); // 1문항 응답(미채점)
    await page.waitForTimeout(900); // debounce 저장 대기(추첨·답안)

    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await page.waitForSelector("#options .option");
    // 챕터 스코프가 유지되어 미니 시험 그대로 복원된다(문항 수·챕터·진행).
    await expect(page.getByTestId("chapter-filter-banner")).toBeVisible();
    await expect(page.getByTestId("chapter-filter-banner").locator("strong")).toHaveText(chapterBefore);
    await expect(page.locator("#progressText")).toHaveText(`1 / ${totalBefore}`);
  });
});

test.describe("랜덤 UX(S1·S5)", () => {
  test("'새 문제 뽑기'로 답안 초기화 + 재추첨(S5)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.locator('.segmented button[data-mode="random"]').click();
    await page.waitForSelector("#options .option");
    await page.locator("#options .option").first().click();
    await expect(page.locator("#progressText")).toHaveText("1 / 40");

    await page.getByTestId("random-redraw").click();
    await expect(page.locator("#progressText")).toHaveText("0 / 40");
  });

  test("랜덤 진행 중 새로고침 → 같은 추첨으로 진행이 유지된다(S1)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.locator('.segmented button[data-mode="random"]').click();
    await page.waitForSelector("#options .option");
    const before = (await page.locator("#questionTitle").textContent()) || "";
    await page.locator("#options .option").first().click();
    await expect(page.locator("#progressText")).toHaveText("1 / 40");
    await page.waitForTimeout(900); // debounce 저장 대기(추첨·답안)

    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await page.waitForSelector("#options .option");
    // 우발적 새로고침이라도 재추첨하지 않고 같은 문항·답안·위치로 이어푼다.
    await expect(page.locator("#progressText")).toHaveText("1 / 40");
    await expect(page.locator("#questionTitle")).toHaveText(before);
  });
});

test.describe("오답 극복 배지(S6)", () => {
  test("최근 시험 2회 연속 정답 문항에 '극복' 배지 + 흐림 처리", async ({ page }) => {
    // 데이터 오라클로 1번 문항의 정답/오답 보기를 구한다.
    const res = await page.request.get("/data/istqb/sample-a.json");
    expect(res.ok()).toBeTruthy();
    const q1 = (await res.json()).questions[0];
    const correctIdxs: number[] = q1.answer.map((k: string) =>
      q1.options.findIndex((o: { key: string }) => o.key.toLowerCase() === k.toLowerCase()));
    const wrongIdx = q1.options.findIndex(
      (o: { key: string }) => !q1.answer.some((k: string) => k.toLowerCase() === o.key.toLowerCase()));

    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");

    // 1회차: 1번 오답 → 오답 노트에 등재.
    await enterExam(page);
    await page.locator("#options .option").nth(wrongIdx).click();
    await submitGrade(page);
    await closeResult(page);

    // 2·3회차: 1번 정답(연속 2회) — 시험 탭 재클릭 = 원클릭 재응시.
    for (let round = 0; round < 2; round += 1) {
      await enterExam(page);
      for (const idx of correctIdxs) await page.locator("#options .option").nth(idx).click();
      await submitGrade(page);
      await closeResult(page);
    }

    // 오답 노트: 문제 1은 극복 배지, 범례 노출.
    await page.locator(".actions button", { hasText: "오답 노트" }).click();
    await page.getByTestId("wrong-note-set-btn").first().click();
    await expect(page.getByTestId("wrong-note-overcome-hint")).toBeVisible();
    const first = page.getByTestId("wrong-note-item-btn").first();
    await expect(first).toContainText("문제 1");
    await expect(first.locator('[data-testid="wrong-note-overcome-tag"]')).toBeVisible();
    // 여전히 틀리는 문항(2번 이후 미응답 오답)에는 배지가 없다.
    const second = page.getByTestId("wrong-note-item-btn").nth(1);
    await expect(second.locator('[data-testid="wrong-note-overcome-tag"]')).toHaveCount(0);
  });
});

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
    await page.waitForTimeout(2200);
    expect(await remaining.textContent()).not.toBe(first); // 실제로 감소한다
  });

  test("연습 모드는 제한시간이 없어 경과 시간을 그대로 센다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await expect(page.locator("#timerText").getByTestId("timer-remaining")).toHaveCount(0);
    await expect(page.locator("#timerText")).toHaveText(/^\d\d:\d\d$/);
  });
});

test.describe("챕터 필터 복원", () => {
  test("챕터 집중 연습 중 새로고침해도 필터가 유지된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await completeAttempt(page); // 챕터 통계 생성
    await page.getByTestId("stats-open").click();
    await page.getByTestId("chapter-practice-btn").first().click();

    const banner = page.getByTestId("chapter-filter-banner");
    await expect(banner).toBeVisible();
    const chapter = (await banner.locator("strong").textContent()) || "";
    const totalBefore = (await page.locator("#progressText").textContent())?.split("/")[1]?.trim();
    await page.waitForTimeout(900); // debounce 저장 대기

    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await page.waitForSelector("#options .option");
    await expect(page.getByTestId("chapter-filter-banner")).toBeVisible();
    await expect(page.getByTestId("chapter-filter-banner").locator("strong")).toHaveText(chapter);
    await expect(page.locator("#progressText")).toContainText(`/ ${totalBefore}`);
  });
});
