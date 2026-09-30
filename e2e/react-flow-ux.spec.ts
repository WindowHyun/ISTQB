import { test, expect } from "./fixtures";
import { completeAttempt, enterExam, openSet, submitGrade, closeResult } from "./helpers";

// 흐름·기획 개선(S1~S6) — 응시 포기, 채점 완료 회차 새로고침 가드, 챕터 미니 시험
// (추첨·새로고침 이어풀기·'연습으로 전체 보기'로 이탈), 오답 극복 배지, 시험 제한시간.
//
// '새 문제 뽑기'와 랜덤 초기화 안내는 여기 있었으나 제품에서 사라졌다(랜덤 탭이 퀵에
// 흡수되면서 재추첨 버튼도 함께 빠졌다) — 해당 검사도 함께 걷어냈다.

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
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await page.waitForSelector("#options .option");
    // 챕터 스코프가 유지되어 미니 시험 그대로 복원된다(문항 수·챕터·진행).
    await expect(page.getByTestId("chapter-filter-banner")).toBeVisible();
    await expect(page.getByTestId("chapter-filter-banner").locator("strong")).toHaveText(chapterBefore);
    await expect(page.locator("#progressText")).toHaveText(`1 / ${totalBefore}`);
  });

  /**
   * 배너의 '연습으로 전체 보기'는 **미니 시험을 끝내고 연습으로 나가는** 버튼이다.
   *
   * 종전에는 여기서도 챕터 필터만 풀었다. 모드가 'random'으로 남아 같은 버튼이 세트 전체
   * 40문항 무작위 회차를 새로 시작했고 — 모드 세그먼트에서 '랜덤'을 없앤 결정을 이 버튼
   * 하나가 우회하고 있었다 — 세그먼트는 어느 모드도 가리키지 않는 상태가 됐다.
   *
   * 그래서 '문항이 40개가 됐다'로는 회귀를 못 잡는다. 세트 전체 랜덤도 40문항이기 때문이다.
   * 구분되는 것은 **모드와 순서**다: 연습이면 세그먼트의 '연습'이 눌린 상태가 되고 1번
   * 문항부터 순서대로 나온다. 랜덤이면 눌린 버튼이 없고 첫 문항도 1번이 아니다.
   */
  test("미니 시험 배너의 '연습으로 전체 보기' → 연습 모드로 나간다(랜덤 회차를 새로 뽑지 않는다)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await completeAttempt(page); // 챕터 통계 생성 — 미니 시험의 유일한 진입로
    await page.getByTestId("stats-open").click();
    await page.getByTestId("chapter-minitest-btn").first().click();
    await expect(page.getByTestId("chapter-filter-banner")).toBeVisible();
    // 미니 시험에서는 버튼 이름이 결과를 예고한다(연습에서는 그냥 '전체 보기' — react-stats).
    const clear = page.getByTestId("chapter-filter-clear");
    await expect(clear).toHaveText("연습으로 전체 보기");
    await page.locator("#options .option").first().click(); // 1문항 응답 후 나간다

    await clear.click();

    // 모드가 실제로 연습이다 — 지문이 보인다는 것으로는 증명되지 않는다(helpers의 단언 규약).
    await expect(page.locator('.segmented button[data-mode="practice"]')).toHaveAttribute("aria-pressed", "true");
    // 챕터 제한이 풀리고 세트 전체가, 무작위가 아니라 순서대로 나온다.
    // (#progressText는 '답한 수 / 총계'다 — 0은 미니 시험의 답이 연습으로 새지 않았다는 뜻이기도 하다.)
    await expect(page.getByTestId("chapter-filter-banner")).toHaveCount(0);
    await expect(page.locator("#progressText")).toHaveText("0 / 40");
    await expect(page.locator("#questionTitle")).toHaveText("문제 1");

    // 저장 상태도 함께 넘어가야 한다 — 새로고침하면 미니 시험으로 되돌아가는 것을 막는다.
    // 디바운스 저장이 스스로 도는지 본다(새로고침 순간의 flush가 아니라) — 저장될 때까지 기다린다.
    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem("istqb-fl-v4-sample-ui-state") || "{}").mode)).toBe("practice");
    const ui = await page.evaluate(() => JSON.parse(localStorage.getItem("istqb-fl-v4-sample-ui-state") || "{}"));
    expect(ui.chapterFilter ?? null).toBeNull();
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
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await page.waitForSelector("#options .option");
    await expect(page.getByTestId("chapter-filter-banner")).toBeVisible();
    await expect(page.getByTestId("chapter-filter-banner").locator("strong")).toHaveText(chapter);
    await expect(page.locator("#progressText")).toContainText(`/ ${totalBefore}`);
  });
});
