import { test, expect } from "@playwright/test";
import { enterExam, openProduct, openSet, submitGrade } from "./helpers";

// 엣지: 모달 상호작용(Esc·백드롭·전환·설정 토글·통계 빈/비우기).
test.describe("엣지-모달", () => {
  test("설정 모달은 Esc로 닫힌다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    const dialog = page.getByRole("dialog", { name: "설정" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("설정 모달은 백드롭 클릭으로 닫힌다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await expect(page.getByRole("dialog", { name: "설정" })).toBeVisible();
    await page.locator(".modal-backdrop").click({ position: { x: 8, y: 8 } });
    await expect(page.getByRole("dialog", { name: "설정" })).toHaveCount(0);
  });

  test("오답 노트 모달은 Esc로 닫힌다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.getByRole("button", { name: "오답 노트" }).click();
    await expect(page.getByTestId("wrong-note")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("wrong-note")).toHaveCount(0);
  });

  test("학습 통계는 기록이 없으면 빈 안내를 보여준다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard")).toContainText("아직 채점한 기록이 없습니다");
  });

  test("채점 후 학습 통계에 이력 1건이 쌓인다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard").locator(".stl-rounds li")).toHaveCount(1);
  });

  test("학습 통계 모달은 Esc로 닫힌다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("stats-dashboard")).toHaveCount(0);
  });

  test("학습 통계 '이력 비우기'는 2단계 확인 후 비워진다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await page.getByTestId("stats-open").click();
    await page.getByRole("button", { name: "이력 비우기" }).click();
    await page.getByTestId("stats-clear-confirm").click();
    await page.waitForTimeout(300);
    await expect(page.getByTestId("stats-dashboard")).toContainText("아직 채점한 기록이 없습니다");
  });

  test("결과 요약→오답 노트로 전환된다(스택되지 않음)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByRole("button", { name: "오답 노트 보기" }).click();
    await expect(page.getByTestId("result-summary")).toHaveCount(0);
    await expect(page.getByTestId("wrong-note")).toBeVisible();
  });

  test("테마 3종(시스템/라이트/다크)이 body[data-theme]에 반영된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    const d = page.getByRole("dialog", { name: "설정" });
    await d.getByRole("button", { name: "다크" }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.theme)).toBe("dark");
    await d.getByRole("button", { name: "라이트" }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.theme)).toBe("light");
    await d.getByRole("button", { name: "시스템" }).click();
    await expect.poll(() => page.evaluate(() => ["light", "dark"].includes(document.body.dataset.theme || ""))).toBe(true);
  });

  test("글자 크기 크게→기본 전환이 body[data-qfont]에 반영된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("button", { name: "크게" }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.qfont)).toBe("large");
    await page.getByRole("button", { name: "기본" }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.qfont)).toBe("normal");
  });

  test("설정 '처음 화면으로'는 제품 선택 게이트로 이동한다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("button", { name: /처음 화면/ }).click();
    await expect(page.getByRole("button", { name: "ISTQB" })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("button", { name: "CSTS" })).toBeVisible();
  });

  test("'문항 이동' 모달은 백드롭 클릭으로 닫힌다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.getByTestId("palette-jump-btn").click();
    await expect(page.getByTestId("palette-jump")).toBeVisible();
    await page.locator(".modal-backdrop").click({ position: { x: 8, y: 8 } });
    await expect(page.getByTestId("palette-jump")).toHaveCount(0);
  });
  test("설정에는 화면 콘솔을 켜는 토글이 없다(개발자용 — ?debug 로만 켠다)", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await expect(page.getByTestId("debug-toggle")).toHaveCount(0);
    // 꺼져 있으면 관련 안내도 나오지 않는다.
    await expect(page.getByTestId("settings-debug-off")).toHaveCount(0);
  });

  test("?debug 로 켜 둔 사용자는 설정에서 화면 콘솔을 끌 수 있다", async ({ page }) => {
    await page.goto("/?debug");
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("debug-fab")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByTestId("settings-debug-off").click();
    await expect(page.getByTestId("debug-fab")).toHaveCount(0);
    // 안내 자체도 사라진다(꺼진 상태에서는 노출하지 않음).
    await expect(page.getByTestId("settings-debug-off")).toHaveCount(0);
  });

  test("오답 노트에서 문항 클릭 → 팝업 안에서 문제·내 답·정답을 본다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByRole("button", { name: "오답 노트 보기" }).click();
    await page.getByTestId("wrong-note-set-btn").first().click();
    // 2단계: 오답 목록의 문항 버튼 클릭 → 3단계 문항 보기
    await page.getByTestId("wrong-note-item-btn").first().click();
    const view = page.getByTestId("wrong-note-question");
    await expect(view).toBeVisible();
    // 지문이 실제로 렌더된다.
    await expect(view.locator(".question-stem .rich-text-container")).not.toBeEmpty();
    // 정답 보기가 하이라이트되고 태그가 붙는다.
    await expect(view.locator(".option.correct")).toHaveCount(1);
    await expect(view.locator(".option.correct .wn-tag")).toContainText("정답");
    // 뒤로가기 → 오답 목록으로 복귀.
    await page.getByTestId("wrong-note-question-back").click();
    await expect(page.getByTestId("wrong-note-detail")).toBeVisible();
  });

  test("오답 문항 보기에서 내가 고른 오답이 표시된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    // 40문항 전부 첫 보기로 응답 → 오답 다수 확보, 내 답이 항상 존재.
    for (let i = 0; i < 40; i++) {
      await page.locator("#options .option").first().click();
      if (i < 39) await page.locator("#nextBtn").click();
    }
    await submitGrade(page);
    await page.getByRole("button", { name: "오답 노트 보기" }).click();
    await page.getByTestId("wrong-note-set-btn").first().click();
    await page.getByTestId("wrong-note-item-btn").first().click();
    const view = page.getByTestId("wrong-note-question");
    // 내 답(오답)이 danger 스타일로 표시된다(정답과 다른 보기를 골랐던 문항).
    await expect(view.locator(".option.wrong .wn-tag")).toContainText("내 답");
    await expect(view.locator(".option.correct")).toHaveCount(1);
  });

  test("오답 문항 보기에서 ‹ ›로 이전/다음 오답으로 이동한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    // 전 문항 첫 보기 응답 → 오답 2개 이상 확보(정답이 전부 a일 수는 없음).
    for (let i = 0; i < 40; i++) {
      await page.locator("#options .option").first().click();
      if (i < 39) await page.locator("#nextBtn").click();
    }
    await submitGrade(page);
    await page.getByRole("button", { name: "오답 노트 보기" }).click();
    await page.getByTestId("wrong-note-set-btn").first().click();
    await page.getByTestId("wrong-note-item-btn").first().click();
    const view = page.getByTestId("wrong-note-question");
    const title = view.locator(".wrong-note-set");
    const first = (await title.textContent()) || "";
    // 첫 오답: ‹ 비활성, 위치 "1 / N".
    await expect(page.getByTestId("wrong-note-prev")).toBeDisabled();
    await expect(page.getByTestId("wrong-note-pos")).toContainText("1 /");
    // › 다음 오답으로 이동 → 문제 번호가 바뀌고 위치 갱신, ‹ 활성화.
    await page.getByTestId("wrong-note-next").click();
    await expect(title).not.toHaveText(first);
    await expect(page.getByTestId("wrong-note-pos")).toContainText("2 /");
    await expect(page.getByTestId("wrong-note-prev")).toBeEnabled();
    // ‹ 로 처음 오답으로 복귀.
    await page.getByTestId("wrong-note-prev").click();
    await expect(title).toHaveText(first);
    // 마지막 오답에서는 › 비활성.
    const total = Number(((await page.getByTestId("wrong-note-pos").textContent()) || "").split("/")[1].trim());
    for (let i = 1; i < total; i++) await page.getByTestId("wrong-note-next").click();
    await expect(page.getByTestId("wrong-note-next")).toBeDisabled();
  });

  test("모달이 열려 있으면 화살표 키가 뒤 문항을 바꾸지 않는다(#P3-1)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    const title = page.locator("#questionTitle");
    const before = (await title.textContent()) || "";
    // '문항 이동' 팔레트 모달을 연다.
    await page.getByTestId("palette-jump-btn").click();
    await expect(page.getByTestId("palette-jump")).toBeVisible();
    // 모달이 떠 있는 동안 화살표는 무시되어야 한다(모달 뒤 문항 불변).
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(title).toHaveText(before);
    // 모달을 닫으면 화살표가 다시 정상 동작한다.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("palette-jump")).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await expect(title).not.toHaveText(before);
  });
});

// 오답 노트 목록 레이아웃 — 서답형처럼 정답이 길면 한국어가 글자 단위로 끊겨
// "문제 66"이 세로로 쪼개지고 화살표가 다음 줄로 떨어지던 회귀를 막는다.
test.describe("엣지-오답노트 레이아웃", () => {
  test("긴 서답형 정답이 있어도 문항 번호가 한 줄로 유지되고 화살표가 같은 줄에 남는다", async ({ page }) => {
    // CSTS 2405는 서답형 정답이 길다(예: "동등 분할, Equivalence partitioning").
    await openSet(page, "CSTS", "CSTS-FL-2405");
    await enterExam(page);
    await submitGrade(page); // 전부 미응답 → 전 문항 오답
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    await page.getByRole("button", { name: "오답 노트" }).click();
    await page.getByTestId("wrong-note-set-btn").first().click();
    const items = page.getByTestId("wrong-note-item-btn");
    await expect(items.first()).toBeVisible();

    // 회귀가 나던 폭 구간(구 grid 3열이 살아 있던 561px 이상 포함).
    for (const width of [600, 560, 430, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(120);

      const worst = await items.evaluateAll((els) => {
        let numLines = 1;
        let arrowOffRow = 0;
        let overflow = 0;
        for (const el of els.slice(0, 12)) {
          const num = el.querySelector<HTMLElement>(".wn-num");
          const arrow = el.querySelector<HTMLElement>(".wn-arrow");
          if (!num || !arrow) continue;
          const lh = parseFloat(getComputedStyle(num).lineHeight) || 16;
          numLines = Math.max(numLines, Math.round(num.getBoundingClientRect().height / lh));
          // 화살표 중심이 번호 줄 범위를 벗어나면 다른 줄로 떨어진 것.
          const n = num.getBoundingClientRect();
          const a = arrow.getBoundingClientRect();
          const aMid = a.top + a.height / 2;
          if (aMid < n.top - 2 || aMid > n.bottom + 2) arrowOffRow += 1;
          if (el.scrollWidth > el.clientWidth + 1) overflow += 1;
        }
        return { numLines, arrowOffRow, overflow };
      });

      expect(worst.numLines, `${width}px에서 문항 번호가 ${worst.numLines}줄로 쪼개짐`).toBe(1);
      expect(worst.arrowOffRow, `${width}px에서 화살표가 번호와 다른 줄로 떨어짐`).toBe(0);
      expect(worst.overflow, `${width}px에서 항목이 가로로 넘침`).toBe(0);
    }
  });
});
