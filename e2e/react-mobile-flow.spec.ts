import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "./fixtures";
import {
  answerCurrent,
  closeResult,
  enterExam,
  enterMiniTest,
  enterQuick,
  gotoQuestionMobile,
  openProduct,
  openQuestionList,
  openSet,
  settle,
  submitGrade,
  waitForList,
} from "./helpers";

/**
 * 모바일 풀이 흐름 — 헤더·상태 줄, 하단 바·진행 스트립, 문항 목록 시트, 세트 선택 시트, 그림 확대.
 *
 * 시안(docs/ui-mockups)의 다섯 화면이 실제 앱에서 **약속한 대로 동작하는가**를 본다. 눈으로 보이는 모양은
 * 스크린샷으로 확인하고, 여기서는 모양이 아니라 약속을 못 박는다 — 특히 아래 셋은 조용히 어긋나기 쉽다.
 *  · 시험 응시 중에 정오가 새지 않는다(스트립·목록 시트가 채점 전에는 푼/안 푼만 말한다).
 *  · 배지·버튼의 숫자가 눌렀을 때 열리는 화면의 크기와 같다(오답 노트 배지, 'N문제 다시 풀기').
 *  · 새 오버레이(시트·확대 화면)가 뒤로가기로 닫힌다 — APK에서만 드러나는 결함 클래스.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const CSTS_2018 = "CSTS-EL-2018";

const indexJson = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "www/data/index.json"), "utf8"),
) as { sets: { id: string; certification: string; title: string; questionCount: number }[] };

// 모바일에서 시험 진입 — 모드 세그먼트는 드로어 안에 있다(모드 변경이 드로어를 닫는다).
async function enterExamViaDrawer(page: Page) {
  await page.getByTestId("drawer-open").click();
  await enterExam(page);
}

// 모바일에서 미니 시험(랜덤) 진입 — 통계 버튼이 드로어 안에 있다. 시험 회차 하나가 선행돼야 한다.
async function enterMiniTestViaDrawer(page: Page) {
  await page.getByTestId("drawer-open").click();
  await enterMiniTest(page);
  // 통계 모달에서 미니 시험을 시작해도 드로어는 열린 채일 수 있다 — 닫아야 상단바가 다시 눌린다.
  if ((await page.locator(".app-shell").getAttribute("data-drawer")) === "open") {
    await page.keyboard.press("Escape");
    await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "closed");
  }
}

// 채점하고 결과 모달을 닫는다(하단 바의 채점 버튼).
async function gradeAndClose(page: Page) {
  await submitGrade(page, "grade-button-m");
  await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 8_000 });
  await closeResult(page);
}

async function nextQuestion(page: Page) {
  await page.getByRole("button", { name: "다음 문제" }).click();
}

type TouchType = "touchStart" | "touchMove" | "touchEnd" | "touchCancel";

const tones = (page: Page) =>
  page.locator('[data-testid="progress-strip"] span').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.tone));

test.describe("헤더와 상태 줄", () => {
  test("윗줄에 제품·등급과 짧은 세트 이름, 아랫줄에 모드·위치를 둔다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    const bar = page.locator(".mobile-topbar");
    await expect(bar.locator(".mtb-sub")).toHaveText("CSTS · 일반등급");
    await expect(bar.locator(".mtb-ttl")).toHaveText("2018 일반등급 예제");
    await expect(bar.locator(".mtb-chip")).toHaveText("연습");
    await expect(page.getByTestId("mtb-pos")).toContainText("1 / 20");

    // 위치는 이동을 따라간다 — 푼 수가 아니다(푼 수는 스트립과 문항 목록이 맡는다).
    await nextQuestion(page);
    await expect(page.getByTestId("mtb-pos")).toContainText("2 / 20");
  });

  test("모든 세트의 이름이 헤더에서 잘리지 않는다(세트 시트로 하나씩 연다)", async ({ page }) => {
    await openProduct(page, "CSTS");
    for (const s of indexJson.sets.filter((x) => x.certification === "CSTS")) {
      await page.getByTestId("set-sheet-open").click();
      const row = page.locator(`[data-testid="set-row"][data-set-id="${s.id}"]`);
      await row.click();
      await waitForList(page, { setId: s.id });
      // 이름 글자(.mtb-ttl > span)가 상자보다 넓으면 말줄임으로 잘린 것이다(표식 ▾는 이름 밖이라 영향 없다).
      const clipped = await page.locator(".mtb-ttl > span").evaluate((e) => e.scrollWidth > e.clientWidth);
      expect(clipped, `${s.id}: 세트 이름이 말줄임으로 잘렸다`).toBe(false);
    }
  });

  test("오답 노트 칩의 배지는 노트가 나열하는 문항 수와 같다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    // 오답이 없으면 숫자 없이 입구만 남긴다.
    await expect(page.getByTestId("wrong-note-chip")).toBeVisible();
    await expect(page.locator(".mtb-wrong b")).toHaveCount(0);

    await enterExamViaDrawer(page);
    await answerCurrent(page);
    await gradeAndClose(page); // 미응답은 오답으로 센다 → 대부분이 오답

    const badge = Number(await page.locator(".mtb-wrong b").textContent());
    expect(badge).toBeGreaterThan(0);

    await page.getByTestId("wrong-note-chip").click();
    await expect(page.getByTestId("wrong-note")).toBeVisible();
    const metas = await page.locator('[data-testid="wrong-note-set-btn"] .wns-meta').allTextContents();
    const listed = metas.reduce((sum, t) => sum + Number(/오답 (\d+)/.exec(t)?.[1] ?? 0), 0);
    expect(badge, `배지 ${badge} ≠ 노트가 나열한 ${listed}`).toBe(listed);
  });

  // 입구는 경고가 아니라 길이다. 분홍 채움·빨간 테두리·빨간 글자·빨간 배지가 겹치면 에러 배너처럼 읽히고 옆의
  // ☰·모드 칩과 톤이 맞지 않았다. 색 값을 못 박지 않고 관계를 잰다 — 라이트·다크 어디서든 ☰와 같은 중립 버튼이어야 한다.
  test("오답 노트 칩은 ☰와 같은 중립 버튼이고, 붉은색은 개수 배지에만 쓴다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    await enterExamViaDrawer(page);
    await answerCurrent(page);
    await gradeAndClose(page); // 미응답은 오답으로 센다 → 배지가 뜬다
    await expect(page.locator(".mtb-wrong b")).toBeVisible();

    const style = (sel: string) => page.locator(sel).first().evaluate((e) => {
      const s = getComputedStyle(e);
      return { bg: s.backgroundColor, border: s.borderTopColor, color: s.color };
    });
    const [chip, menu, badge] = [await style(".mtb-wrong"), await style(".mtb-menu"), await style(".mtb-wrong b")];
    expect(chip.bg, "칩 배경이 ☰와 다르다 — 경고색으로 칠했다").toBe(menu.bg);
    expect(chip.border, "칩 테두리가 ☰와 다르다 — 경고색으로 둘렀다").toBe(menu.border);
    expect(chip.color, "칩 글자가 배지와 같은 붉은색이다").not.toBe(badge.bg);
    expect(badge.color, "배지는 붉은 면 위의 흰 글자다").toBe("rgb(255, 255, 255)");
  });

  test("퀵에서는 위치·시간을 내리고, 세트 이름 버튼은 막힌 이유를 알려 준다", async ({ page }) => {
    await enterQuick(page, "CSTS");
    await expect(page.locator(".mtb-pos, .mtb-time")).toHaveCount(0);
    await expect(page.locator(".mtb-chip")).toHaveText("퀵");
    await expect(page.getByTestId("wrong-note-chip")).toBeVisible();

    const opener = page.getByTestId("set-sheet-open");
    await expect(opener).toHaveAttribute("aria-disabled", "true");
    // 드로어가 슬라이드로 빠져나가는 동안에는 사이드바가 이 버튼을 덮고 있다 — 강제 클릭은 그 가림을
    // 확인하지 않으므로 전환이 끝난 뒤에 누른다.
    await settle(page);
    // aria-disabled는 Playwright가 '비활성'으로 보고 클릭을 기다리기만 한다 — 사용자는 누를 수 있으므로 강제로 누른다.
    await opener.click({ force: true });
    await expect(page.getByTestId("toast")).toContainText("퀵은 모든 세트를 섞어 냅니다");
    await expect(page.getByTestId("set-sheet")).toHaveCount(0);
  });

  test("시험 응시 중에는 오답 노트 칩을 내리고(정답이 든 입구), 채점하면 다시 낸다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    await expect(page.getByTestId("wrong-note-chip")).toBeVisible();
    await enterExamViaDrawer(page);
    await answerCurrent(page);
    await expect(page.getByTestId("wrong-note-chip"), "응시 중에 오답 노트 입구가 열려 있다").toHaveCount(0);
    await gradeAndClose(page);
    await expect(page.getByTestId("wrong-note-chip")).toBeVisible();
  });

  test("새 컨트롤은 터치 타깃 44px을 지킨다(헤더·상태 줄·하단 바·시트)", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    const sizes = async (sel: string) => page.locator(sel).first().evaluate((e) => {
      const r = e.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    for (const [name, sel] of [
      ["세트 이름 버튼", ".mtb-title"], ["메뉴", ".mtb-menu"], ["오답 노트 칩", ".mtb-wrong"],
      ["이전", '.ab-nav[aria-label="이전 문제"]'], ["문항 목록", ".ab-list"], ["다음", '.ab-nav[aria-label="다음 문제"]'],
    ] as const) {
      const { w, h } = await sizes(sel);
      expect(Math.min(w, h), `${name}: ${w}×${h}`).toBeGreaterThanOrEqual(44);
    }
    await openQuestionList(page);
    for (const [name, sel] of [["필터 칩", ".qchip"], ["문항 칸", ".qcell"], ["닫기", ".modal-close"]] as const) {
      const { w, h } = await sizes(sel);
      expect(Math.min(w, h), `${name}: ${w}×${h}`).toBeGreaterThanOrEqual(44);
    }
  });

  test("보기 카드는 56px 이상, 원형 라벨은 32px이다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    const card = await page.locator("#options .option").first().boundingBox();
    expect(Math.round(card!.height)).toBeGreaterThanOrEqual(56);
    const key = await page.locator("#options .option-key").first().boundingBox();
    expect(Math.round(key!.width)).toBe(32);
  });

  test("드로어가 열려 있는 동안 세트 이름·상태 줄은 접근성 트리에서 빠지고(같은 이름의 버튼이 둘로 보이지 않는다), ☰는 남는다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    await expect(page.getByRole("button", { name: /오답 노트/ })).toHaveCount(1); // 상단바 칩(드로어는 닫혀 있다)
    const menu = page.getByTestId("drawer-open");
    await menu.click();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "open");
    await expect(page.getByRole("button", { name: /오답 노트/ })).toHaveCount(1); // 드로어의 버튼
    await expect(page.locator(".mtb-brand")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator(".mtb-status")).toHaveAttribute("aria-hidden", "true");

    // ☰는 드로어가 닫힐 때 포커스가 돌아갈 자리다 — 열리는 같은 렌더에서 그 버튼을 inert로 만들면 포커스가 밀려난
    // 뒤에야 연 요소를 기록하게 된다. 브라우저의 포커스 정리가 효과보다 늦느냐에 기대는 순서라, 구조로 막는다.
    const live = await menu.evaluate((el) => el.closest("[inert], [aria-hidden='true']") === null);
    expect(live, "☰가 inert/aria-hidden 영역 안에 있다 — 닫을 때 포커스가 돌아갈 자리를 잃는다").toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.locator(".mtb-status")).not.toHaveAttribute("aria-hidden", "true");
    await expect(page.locator(".mtb-brand")).not.toHaveAttribute("aria-hidden", "true");
    await expect(menu).toBeFocused();
  });
});

test.describe("하단 바와 진행 스트립", () => {
  test("문항당 한 칸이고 지금 문제는 따로 표시되며, 연습에서는 푼 문항이 정오 색을 얻는다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    expect(await tones(page)).toEqual(["current", ...Array(19).fill("unanswered")]);

    await answerCurrent(page);
    await nextQuestion(page);
    const after = await tones(page);
    expect(after).toHaveLength(20);
    expect(["correct", "wrong"]).toContain(after[0]);
    expect(after[1]).toBe("current");
    await expect(page.getByTestId("progress-strip")).toHaveAttribute("aria-label", /20문항 중 2번째/);
  });

  test("시험 응시 중에는 정오를 말하지 않고, 채점 뒤에 말한다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    await enterExamViaDrawer(page);
    await answerCurrent(page);
    await nextQuestion(page);
    await answerCurrent(page);
    await nextQuestion(page);

    const during = await tones(page);
    expect(during.filter((t) => t === "answered"), "푼 문항 두 칸").toHaveLength(2);
    expect(during.some((t) => t === "correct" || t === "wrong"), "채점 전에 정오 색이 새어 나왔다").toBe(false);
    const labelBefore = (await page.getByTestId("progress-strip").getAttribute("aria-label")) ?? "";
    expect(labelBefore).toContain("푼 문제 2");
    expect(labelBefore).not.toMatch(/정답|오답/);

    await gradeAndClose(page);
    const after = await tones(page);
    // 채점 뒤에는 미응답도 오답으로 센다 — '푼/안 푼' 색은 남지 않는다.
    expect(after.some((t) => t === "answered" || t === "unanswered")).toBe(false);
    await expect(page.getByTestId("progress-strip")).toHaveAttribute("aria-label", /정답 \d+, 오답 \d+/);
  });

  test("바 높이가 바뀌어도(채점 줄) 본문 아래 여백이 그만큼 따라간다", async ({ page }) => {
    const measure = () => page.evaluate(() => ({
      bar: document.querySelector(".mobile-actionbar")!.getBoundingClientRect().height,
      pad: parseFloat(getComputedStyle(document.querySelector(".app-shell")!).paddingBottom),
      cssVar: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--actionbar-h")),
    }));

    await openSet(page, "CSTS", CSTS_2018);
    const practice = await measure();
    expect(practice.pad, "연습: 여백이 바보다 얕다").toBeGreaterThanOrEqual(practice.bar);
    expect(practice.cssVar, "--actionbar-h가 실제 바 높이를 따라가지 않는다").toBeGreaterThanOrEqual(practice.bar - 1);

    await enterExamViaDrawer(page);
    await answerCurrent(page); // 채점 줄이 붙어 바가 커진다
    await expect(page.getByTestId("grade-button-m")).toBeVisible();
    const exam = await measure();
    expect(exam.bar, "채점 줄이 붙었는데 바 높이가 그대로다(전제 붕괴)").toBeGreaterThan(practice.bar);
    expect(exam.pad, "시험: 바가 커졌는데 여백이 따라가지 않았다").toBeGreaterThanOrEqual(exam.bar);
  });

  test("'문항 목록' 버튼은 현재 위치를 말한다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    await expect(page.getByTestId("question-list-open")).toContainText("1 / 20");
    await nextQuestion(page);
    await expect(page.getByTestId("question-list-open")).toContainText("2 / 20");
  });
});

test.describe("문항 목록 시트", () => {
  test("요약·필터·칸의 읽는 말이 풀이 상태를 말하고, 칸을 누르면 이동하며 닫힌다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    await answerCurrent(page);
    await nextQuestion(page);
    await answerCurrent(page);
    await nextQuestion(page);

    const sheet = await openQuestionList(page);
    await expect(page.locator(".modal-subtitle")).toContainText("2 / 20 풀이");
    await expect(page.getByTestId("qfilter-all")).toContainText("전체 20");
    await expect(page.getByTestId("qfilter-unsolved")).toContainText("안 푼 문제 18");

    // 칸의 읽는 말 — 색에만 기대지 않는다.
    await expect(sheet.locator('button.qcell[aria-current="true"]')).toHaveAttribute("aria-label", "문제 3, 지금 문제");
    await expect(sheet.locator("button.qcell").nth(9)).toHaveAttribute("aria-label", "문제 10, 안 푼 문제");
    expect(await sheet.locator('button.qcell[aria-label$="정답"], button.qcell[aria-label$="오답"]').count()).toBe(2);

    await sheet.locator("button.qcell", { hasText: /^12$/ }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator("#questionTitle")).toContainText("문제 12");
  });

  test("연습에서 푼 문항을 목록으로 다시 열면 카드에도 목록과 같은 정오·해설이 열려 있다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    await answerCurrent(page);
    const feedback = page.locator("#feedback");
    await expect(feedback).toBeVisible();
    const verdict = ((await feedback.getAttribute("class")) ?? "").includes("wrong") ? "wrong" : "correct";
    await nextQuestion(page);
    await expect(feedback, "안 푼 다음 문항으로 피드백이 샜다").toHaveCount(0);

    // 문항을 옮겼다 돌아오면 카드는 새로 만들어진다 — 닫힌 채 열리면 "목록은 ✕인데 정오도 해설도 없다".
    await gotoQuestionMobile(page, 1);
    await expect(feedback, "푼 문항으로 돌아왔는데 정오·해설이 닫혀 있다").toBeVisible();
    await expect(feedback).toHaveClass(new RegExp(verdict));
    await expect(page.locator("#options .option.selected")).toHaveCount(1);

    // 목록이 이 문항에 칠한 상태와 카드가 보여 주는 정오가 같은 말이다.
    const sheet = await openQuestionList(page);
    await expect(sheet.locator("button.qcell", { hasText: /^1$/ })).toHaveAttribute("data-state", verdict);
  });

  test("복수정답에서 선택을 하나 빼면 카드의 정오·해설도 닫히고, 목록은 푼 문제로 돌아간다(둘이 같은 말을 한다)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await gotoQuestionMobile(page, 6); // 6번: 복수정답(a·e)
    await expect(page.locator("#questionTitle")).toContainText("복수정답");
    const options = page.locator("#options .option");
    const feedback = page.locator("#feedback");

    await options.nth(0).click(); // a — 정답 개수(2)를 채우기 전에는 정오가 열리지 않는다
    await expect(feedback, "정답 개수를 다 채우기 전에 정오가 열렸다").toHaveCount(0);
    await options.nth(4).click(); // e — 채웠다
    await expect(feedback).toBeVisible();
    let sheet = await openQuestionList(page);
    await expect(sheet.locator("button.qcell", { hasText: /^6$/ })).toHaveAttribute("data-state", "correct");
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);

    // e를 빼면 선택이 모자란다 — 카드가 정오·해설을 열어 둔 채면 목록과 갈린다.
    await options.nth(4).click();
    await expect(feedback, "선택이 모자란데 카드가 정오·해설을 열어 두었다").toHaveCount(0);
    sheet = await openQuestionList(page);
    await expect(sheet.locator("button.qcell", { hasText: /^6$/ })).toHaveAttribute("data-state", "answered");
    await page.keyboard.press("Escape");

    // 다른 것으로 다시 채우면 다시 열린다.
    await options.nth(2).click(); // a·c
    await expect(feedback).toBeVisible();
    await expect(feedback).toHaveClass(/wrong/); // 정답은 a·e — c를 골랐으니 오답
  });

  test("'안 푼 문제'로 거르면 푼 칸이 빠지고, 누른 칩은 aria-pressed로 알린다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    await answerCurrent(page);
    const sheet = await openQuestionList(page);
    const unsolved = page.getByTestId("qfilter-unsolved");
    await expect(page.getByTestId("qfilter-all")).toHaveAttribute("aria-pressed", "true");
    await unsolved.click();
    await expect(unsolved).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("qfilter-all")).toHaveAttribute("aria-pressed", "false");
    await expect(sheet.locator("button.qcell")).toHaveCount(19);
    await expect(sheet.locator("button.qcell", { hasText: /^1$/ })).toHaveCount(0);
  });

  test("시험 응시 중에는 정오가 새지 않는다 — 오답 칩·정답/오답 범례·기호가 없다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    await enterExamViaDrawer(page);
    await answerCurrent(page);
    await nextQuestion(page);

    const sheet = await openQuestionList(page);
    await expect(page.getByTestId("qfilter-wrong")).toHaveCount(0);
    await expect(sheet.locator('.qlegend em[data-state="correct"], .qlegend em[data-state="wrong"]')).toHaveCount(0);
    expect(await sheet.locator('button.qcell[data-state="correct"], button.qcell[data-state="wrong"]').count()).toBe(0);
    expect(await sheet.locator('button.qcell[aria-label*="정답"], button.qcell[aria-label*="오답"]').count()).toBe(0);
    await expect(page.locator(".modal-subtitle")).toContainText("1 / 20 풀이");
    await expect(page.locator(".modal-subtitle")).not.toContainText("정답");
    // 응시 중에는 오답 다시 풀기도 내놓지 않는다(풀던 시험이 버려진다).
    await expect(page.getByTestId("retry-wrong-cta")).toHaveCount(0);
  });

  test("채점 뒤에는 정오·오답 칩이 열리고, 'N문제 다시 풀기'가 오답 모드로 보낸다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    await enterExamViaDrawer(page);
    await answerCurrent(page);
    await gradeAndClose(page);

    const sheet = await openQuestionList(page);
    const wrongChip = page.getByTestId("qfilter-wrong");
    await expect(wrongChip).toBeVisible();
    const wrongCount = Number(/(\d+)$/.exec((await wrongChip.textContent()) ?? "")?.[1]);
    expect(wrongCount).toBeGreaterThan(0);
    expect(await sheet.locator('button.qcell[data-state="wrong"]').count()).toBe(wrongCount);

    // CTA의 N은 오답 모드가 실제로 내놓을 문항 수다 — 이 세트의 오답 대상과 같아야 한다.
    const cta = page.getByTestId("retry-wrong-cta");
    await expect(cta).toHaveText(`오답 ${wrongCount}문제 다시 풀기`);
    await cta.click();
    await expect(sheet).toHaveCount(0);
    await waitForList(page, { mode: "review" });
    await expect(page.getByTestId("question-list-open")).toContainText(`/ ${wrongCount}`);
  });

  test("뒤로가기로 닫히고 풀이 화면이 그대로 남는다(가드 누수 없음)", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    await nextQuestion(page);
    await openQuestionList(page);
    await page.goBack();
    await expect(page.getByTestId("palette-jump")).toHaveCount(0);
    await expect(page.locator("#questionTitle")).toContainText("문제 2");

    // UI로 닫은 뒤 다시 열어도 뒤로가기는 한 번에 닫는다(가드가 중복으로 쌓이지 않았다).
    await openQuestionList(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("palette-jump")).toHaveCount(0);
    await openQuestionList(page);
    await page.goBack();
    await expect(page.getByTestId("palette-jump")).toHaveCount(0);
    await expect(page.locator("#questionStem")).toBeVisible();
  });

  test("70문항 세트에서도 지금 문제 칸이 첫 화면에 보이고, 번호로 이동한다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await gotoQuestionMobile(page, 9);
    // 시트를 다시 열면 지금 문제(9번)가 화면 안에 있다 — 격자가 화면보다 길어도 스크롤해 보여 준다.
    const sheet = await openQuestionList(page);
    const cell = sheet.locator('button.qcell[aria-current="true"]');
    await expect(cell).toBeInViewport();
    expect(await sheet.locator("button.qcell").count()).toBe(70);
  });

  test("손잡이를 아래로 끌면 닫히고, 조금만 끌면 제자리로 돌아온다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    const sheet = await openQuestionList(page);
    const panel = page.locator(".modal-panel.is-sheet");
    await settle(page); // 시트가 올라오는 동안에는 손잡이 위치가 아직 움직이고 있다 — 자리 잡은 뒤에 잰다
    const grab = (await page.locator(".modal-grab").boundingBox())!;
    const x = grab.x + grab.width / 2;
    const y = grab.y + grab.height / 2;

    // 짧게 끌었다 놓으면 되돌아온다(실수로 스친 것).
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 30, { steps: 4 });
    await page.mouse.up();
    await expect(sheet).toBeVisible();
    await expect.poll(() => panel.evaluate((e) => (e as HTMLElement).style.transform)).toBe("");

    // 충분히 끌어내리면 닫힌다 — 풀이 화면으로 돌아온다.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 80, { steps: 6 });
    await page.mouse.move(x, y + 200, { steps: 6 });
    await page.mouse.up();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator("#questionStem")).toBeVisible();
  });

  test("퀵에는 문항 목록·스트립이 없다(전 세트를 섞어 끝이 없는 모드)", async ({ page }) => {
    await enterQuick(page, "CSTS");
    await expect(page.getByTestId("question-list-open")).toHaveCount(0);
    await expect(page.getByTestId("progress-strip")).toHaveCount(0);
  });
});

test.describe("세트 선택 시트", () => {
  test("제품의 세트를 종류별로 묶어 짧은 이름으로 보여 주고, 현재 세트를 색 말고도 표시한다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    await page.getByTestId("set-sheet-open").click();
    const sheet = page.getByTestId("set-sheet");
    await expect(sheet).toBeVisible();

    await expect(sheet.locator(".sgrp")).toHaveText(["공개답안 · FL", "일반등급 예제"]);
    const names = await sheet.locator(".srow-top b").allTextContents();
    expect(names).toEqual(["2402 FL", "2403 FL", "2404 FL", "2405 FL", "2018 일반등급 예제", "2019 일반등급 예제", "예제문제 (정답 포함)"]);

    const current = sheet.locator('[data-testid="set-row"][aria-current="true"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute("data-set-id", CSTS_2018);
    await expect(current).toContainText("✓ 선택됨");

    // 터치 타깃 — 행은 60px 이상이고 닫기는 44px 이상이다. 시트가 올라오는 동안에는 소수 위치의 변환 때문에
    // 높이가 59.99997·43.99998처럼 어긋나 읽히므로 자리 잡은 뒤에 잰다(올림으로 덮으면 59.5도 통과한다).
    await settle(page);
    for (const row of await sheet.locator('[data-testid="set-row"]').all()) {
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(60);
    }
    expect((await page.getByRole("button", { name: "닫기", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test("ISTQB는 샘플문제 묶음 하나에 다섯 세트가 있다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.getByTestId("set-sheet-open").click();
    const sheet = page.getByTestId("set-sheet");
    await expect(sheet.locator(".sgrp")).toHaveText(["FL v4.0 샘플문제"]);
    await expect(sheet.locator(".srow-top b")).toHaveText(["샘플문제 A", "샘플문제 B", "샘플문제 C", "샘플문제 D", "샘플문제 모음"]);
  });

  test("풀이 진행(k / N 풀이)은 저장된 답안에서 계산한다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    await page.getByTestId("set-sheet-open").click();
    const row2018 = page.locator(`[data-testid="set-row"][data-set-id="${CSTS_2018}"]`);
    await expect(row2018.locator("small")).toHaveText("20문항 · 풀이 전");
    await page.keyboard.press("Escape");

    await answerCurrent(page);
    await nextQuestion(page);
    await answerCurrent(page);
    await page.getByTestId("set-sheet-open").click();
    await expect(row2018.locator("small")).toHaveText("2 / 20 풀이");
    await expect(row2018.locator(".sbar i")).toHaveAttribute("style", /width:\s*10%/);
    // 다른 세트는 영향받지 않는다.
    await expect(page.locator('[data-set-id="CSTS-EL-2019"] small')).toHaveText("70문항 · 풀이 전");
  });

  test("다른 세트를 고르면 시트가 닫히고 제목·문항이 바뀐다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    await page.getByTestId("set-sheet-open").click();
    await page.locator('[data-testid="set-row"][data-set-id="CSTS-EL-2019"]').click();
    await expect(page.getByTestId("set-sheet")).toHaveCount(0);
    await waitForList(page, { setId: "CSTS-EL-2019" });
    await expect(page.locator(".mtb-ttl")).toHaveText("2019 일반등급 예제");
    await expect(page.getByTestId("mtb-pos")).toContainText("1 / 70");
  });

  test("지금 세트를 다시 고르면 위치를 되돌리지 않고 닫기만 한다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    await nextQuestion(page);
    await page.getByTestId("set-sheet-open").click();
    await page.locator(`[data-testid="set-row"][data-set-id="${CSTS_2018}"]`).click();
    await expect(page.getByTestId("set-sheet")).toHaveCount(0);
    await expect(page.getByTestId("mtb-pos")).toContainText("2 / 20");
  });

  test("랜덤(미니 시험) 진행 중 다른 세트를 고르면 시트가 닫히고, 보이는 확인에서 취소·확정이 눌린다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExamViaDrawer(page);
    await answerCurrent(page);
    await gradeAndClose(page); // 챕터 통계가 있어야 미니 시험(랜덤의 유일한 진입로)에 들어간다
    await enterMiniTestViaDrawer(page);
    await answerCurrent(page); // 진행이 있어야 세트를 바꿀 때 묻는다

    const confirm = page.getByTestId("pending-set-change-modal");
    const rowC = page.locator('[data-testid="set-row"][data-set-id="ISTQB-FL-V4-C"]');

    // 취소 — 확인이 시트 뒤에 깔려 있으면 여기서 막힌다(시트 배경이 탭을 삼키고 Esc도 시트를 닫는다).
    await page.getByTestId("set-sheet-open").click();
    await rowC.click();
    await expect(confirm).toBeVisible();
    await expect(page.getByTestId("set-sheet"), "확인을 묻는데 시트가 열린 채다 — 시트가 확인을 덮는다").toHaveCount(0);
    await settle(page);
    await page.getByTestId("pending-set-change-cancel").click();
    await expect(confirm).toHaveCount(0);
    await expect(page.locator(".mtb-ttl"), "취소했는데 세트가 바뀌었다").toHaveText("샘플문제 A");
    await expect(page.locator("#questionStem")).toBeVisible();

    // 확정 — 이번에는 세트가 바뀌고 새 세트의 0번째 문항에서 시작한다.
    await page.getByTestId("set-sheet-open").click();
    await rowC.click();
    await expect(confirm).toBeVisible();
    await settle(page);
    await page.getByTestId("pending-set-change-confirm").click();
    await expect(confirm).toHaveCount(0);
    await waitForList(page, { setId: "ISTQB-FL-V4-C" });
    await expect(page.locator(".mtb-ttl")).toHaveText("샘플문제 C");
  });

  test("시험 응시 중에는 열리지 않고 이유를 알려 준다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    await enterExamViaDrawer(page);
    await answerCurrent(page);
    const opener = page.getByTestId("set-sheet-open");
    await expect(opener).toHaveAttribute("aria-disabled", "true");
    await opener.click({ force: true }); // aria-disabled여도 사용자는 누를 수 있다 — 이유를 알려 주는 것이 이 버튼의 몫이다
    await expect(page.getByTestId("toast")).toContainText("시험 응시 중에는 세트를 바꿀 수 없습니다");
    await expect(page.getByTestId("set-sheet")).toHaveCount(0);
  });

  test("뒤로가기·Esc로 닫힌다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    await page.getByTestId("set-sheet-open").click();
    await expect(page.getByTestId("set-sheet")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("set-sheet")).toHaveCount(0);
    await expect(page.locator("#questionStem")).toBeVisible();

    // UI(Esc)로 닫은 뒤 다시 열어도 뒤로가기는 한 번에 닫는다 — 가드가 중복으로 쌓이거나 새지 않는다.
    await page.getByTestId("set-sheet-open").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("set-sheet")).toHaveCount(0);
    await page.getByTestId("set-sheet-open").click();
    await expect(page.getByTestId("set-sheet")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("set-sheet")).toHaveCount(0);
    await expect(page.locator("#questionStem")).toBeVisible();
  });

  test("닫으면 열었던 버튼으로 포커스가 돌아온다", async ({ page }) => {
    await openSet(page, "CSTS", CSTS_2018);
    const opener = page.getByTestId("set-sheet-open");
    await opener.click();
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
  });
});

test.describe("그림 문항과 확대 화면", () => {
  // CSTS 2402 9번 — 그림이 있는 문항.
  const openFigureQuestion = async (page: Page) => {
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await gotoQuestionMobile(page, 9);
    await expect(page.locator("#questionFigure img, #questionStem img").first()).toBeVisible();
  };

  test("그림 아래에 '눌러서 확대' 칩이 항상 보이고 터치 타깃을 지킨다", async ({ page }) => {
    await openFigureQuestion(page);
    const chip = page.getByRole("button", { name: "그림 확대해서 보기" }).first();
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText("눌러서 확대");
    expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test("그림의 대체 텍스트는 일반 라벨이고, 그림 자체는 탭 정지점이 아니다(칩 하나만)", async ({ page }) => {
    await openFigureQuestion(page);
    const img = page.locator("#questionFigure img, #questionStem img").first();
    await expect(img).toHaveAttribute("alt", "문제 그림 (눌러서 확대)");
    // 같은 동작을 두 번 읽히고 두 번 멈추게 하지 않는다 — 키보드·보조기기의 진입로는 칩이다.
    await expect(img).not.toHaveAttribute("tabindex", /.*/);
    await expect(img).not.toHaveAttribute("role", /.*/);
  });

  test("칩을 누르면 확대 화면이 열리고 제목·조작 안내·배율 안내가 보인다", async ({ page }) => {
    await openFigureQuestion(page);
    await page.getByRole("button", { name: "그림 확대해서 보기" }).first().click();
    const box = page.getByTestId("figure-lightbox");
    await expect(box).toBeVisible();
    await expect(box.locator(".fl-title")).toHaveText("그림 확대");
    await expect(box.locator(".fl-hint-touch")).toBeVisible();
    await expect(box.locator(".fl-scale")).toHaveText("확대 100% · 두 번 누르면 확대");
    await expect(box.getByRole("button", { name: "닫고 문제로 돌아가기" })).toBeVisible();
    // 터치 타깃
    expect((await box.locator(".figure-lightbox-close").boundingBox())!.width).toBeGreaterThanOrEqual(44);
    expect((await box.locator(".fl-close-bottom").boundingBox())!.height).toBeGreaterThanOrEqual(52);
  });

  test("두 번 누르면 확대하고, 다시 두 번 누르면 원래 크기로 돌아간다", async ({ page }) => {
    await openFigureQuestion(page);
    await page.getByRole("button", { name: "그림 확대해서 보기" }).first().click();
    const label = page.locator(".fl-scale");
    const stage = (await page.locator(".fl-stage").boundingBox())!;
    const cx = stage.x + stage.width / 2;
    const cy = stage.y + stage.height / 2;

    await page.touchscreen.tap(cx, cy);
    await page.touchscreen.tap(cx, cy);
    await expect(label).toHaveText("확대 250% · 두 번 누르면 원래 크기로");
    // 확대 전환(0.18초)이 끝나면 그림이 무대보다 넓어진다 — 그림이 무대 밖으로 사라지지 않고 커진다.
    await expect.poll(async () => (await page.locator(".figure-lightbox-img").boundingBox())!.width).toBeGreaterThan(stage.width);

    await page.touchscreen.tap(cx, cy);
    await page.touchscreen.tap(cx, cy);
    await expect(label).toHaveText("확대 100% · 두 번 누르면 확대");
  });

  // 그림 밖 배경의 한 점 — 무대 모서리 안쪽. 그림은 무대 가운데에 앉으므로 모서리는 늘 배경이다.
  const backgroundPoint = async (page: Page) => {
    const stage = (await page.locator(".fl-stage").boundingBox())!;
    const img = (await page.locator(".figure-lightbox-img").boundingBox())!;
    const point = { x: stage.x + 6, y: stage.y + 6 };
    const insideImage = point.x >= img.x && point.x <= img.x + img.width && point.y >= img.y && point.y <= img.y + img.height;
    expect(insideImage, "전제 붕괴: 고른 점이 그림 위다 — 배경 탭이 아니게 된다").toBe(false);
    return point;
  };

  test("그림 밖 배경을 한 번 누르면 닫힌다(두 번째 탭이 없는 것을 확인한 뒤)", async ({ page }) => {
    await openFigureQuestion(page);
    await page.getByRole("button", { name: "그림 확대해서 보기" }).first().click();
    const p = await backgroundPoint(page);
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.getByTestId("figure-lightbox")).toHaveCount(0);
    await expect(page.locator("#questionTitle")).toContainText("문제 9");
  });

  test("그림 밖 배경에서 시작한 두 번 누르기는 닫지 않고 확대한다", async ({ page }) => {
    await openFigureQuestion(page);
    await page.getByRole("button", { name: "그림 확대해서 보기" }).first().click();
    const p = await backgroundPoint(page);
    // 그림이 작으면 배경이 넓어 두 번 누르기를 빗나가기 쉽다 — 첫 탭의 click이 닫아 버리면 두 번째 탭이 닿기 전에
    // 화면이 사라진다. 확대 배율이 바뀌었다는 것은 두 탭이 모두 확대 화면에 닿았다는 뜻이다.
    await page.touchscreen.tap(p.x, p.y);
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.locator(".fl-scale")).toHaveText(/250%/);
    await expect(page.getByTestId("figure-lightbox")).toBeVisible();
  });

  test("두 손가락으로 벌리면 확대되고, 확대 중 그림을 한 번 눌러도 닫히지 않는다", async ({ page }) => {
    await openFigureQuestion(page);
    await page.getByRole("button", { name: "그림 확대해서 보기" }).first().click();
    const stage = (await page.locator(".fl-stage").boundingBox())!;
    const cx = stage.x + stage.width / 2;
    const cy = stage.y + stage.height / 2;

    const cdp = await page.context().newCDPSession(page);
    const touch = (type: TouchType, pts: { x: number; y: number }[]) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, id) => ({ x: p.x, y: p.y, id })) });
    await touch("touchStart", [{ x: cx - 50, y: cy }, { x: cx + 50, y: cy }]);
    await touch("touchMove", [{ x: cx - 100, y: cy }, { x: cx + 100, y: cy }]);
    await touch("touchEnd", []);
    await expect(page.locator(".fl-scale")).toHaveText("확대 200% · 두 번 누르면 원래 크기로");

    // 핀치가 끝난 직후의 탭·그림 탭은 닫기가 아니다(무대 한가운데 = 확대된 그림 위).
    await page.touchscreen.tap(cx, cy);
    await expect(page.getByTestId("figure-lightbox")).toBeVisible();
  });

  test("한 손가락으로 끌면 확대한 그림이 따라 움직인다", async ({ page }) => {
    await openFigureQuestion(page);
    await page.getByRole("button", { name: "그림 확대해서 보기" }).first().click();
    const stage = (await page.locator(".fl-stage").boundingBox())!;
    const cx = stage.x + stage.width / 2;
    const cy = stage.y + stage.height / 2;
    await page.touchscreen.tap(cx, cy);
    await page.touchscreen.tap(cx, cy); // 250%
    await expect(page.locator(".fl-scale")).toHaveText(/250%/);

    const before = (await page.locator(".figure-lightbox-img").boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: TouchType, pts: { x: number; y: number }[]) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, id) => ({ x: p.x, y: p.y, id })) });
    await touch("touchStart", [{ x: cx, y: cy }]);
    await touch("touchMove", [{ x: cx - 80, y: cy }]);
    await touch("touchEnd", []);
    await expect.poll(async () => (await page.locator(".figure-lightbox-img").boundingBox())!.x).toBeLessThan(before.x - 40);
    // 끌기가 끝난 자리가 배경이어도 닫히지 않는다.
    await expect(page.getByTestId("figure-lightbox")).toBeVisible();
  });

  test("아래 '닫고 문제로 돌아가기'로 닫히고, 칩으로 포커스가 돌아오며, 풀던 문항이 그대로다", async ({ page }) => {
    await openFigureQuestion(page);
    const chip = page.getByRole("button", { name: "그림 확대해서 보기" }).first();
    await chip.focus();
    await chip.click();
    await page.getByRole("button", { name: "닫고 문제로 돌아가기" }).click();
    await expect(page.getByTestId("figure-lightbox")).toHaveCount(0);
    await expect(chip).toBeFocused();
    await expect(page.locator("#questionTitle")).toContainText("문제 9");
  });

  test("뒤로가기로 닫힌다", async ({ page }) => {
    await openFigureQuestion(page);
    await page.getByRole("button", { name: "그림 확대해서 보기" }).first().click();
    await expect(page.getByTestId("figure-lightbox")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("figure-lightbox")).toHaveCount(0);
    await expect(page.locator("#questionStem")).toBeVisible();
  });
});
