import { test, expect } from "@playwright/test";
import { enterExam, modeBtn, openProduct, openSet } from "./helpers";

const SET = "ISTQB-FL-V4-A";

test.describe("확인 가드", () => {
  // D3: 제한시간이 벽시계로 흐르므로(A3) 나가 있는 동안에도 시간이 준다.
  // 실수로 뒤로가기 한 번에 시험 시간을 잃지 않아야 한다.
  test("응시 중 뒤로가기는 확인을 거친다", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    await enterExam(page);
    await page.locator("#options .option").first().click();

    await page.goBack();
    await expect(page.getByTestId("confirm-exit-exam-modal")).toBeVisible();
    // '계속 응시'면 시험 화면에 그대로 남는다.
    await page.getByTestId("confirm-exit-cancel").click();
    await expect(page.getByTestId("confirm-exit-exam-modal")).toHaveCount(0);
    await expect(page.locator("#questionStem")).toBeVisible();

    // 한 번 더 눌러도 다시 묻는다(가드가 재설정된다).
    await page.goBack();
    await expect(page.getByTestId("confirm-exit-exam-modal")).toBeVisible();
    await page.getByTestId("confirm-exit-go").click();
    await expect(page.getByRole("button", { name: "CSTS" })).toBeVisible({ timeout: 8_000 });
  });

  test("응시 중이 아니면 뒤로가기를 가로채지 않는다", async ({ page }) => {
    await openProduct(page, "ISTQB"); // 연습 모드
    await expect(page.locator("#questionStem")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("confirm-exit-exam-modal")).toHaveCount(0);
  });

  // B4: 세트 변경과 같은 손실인데 이 경로만 확인 없이 즉시 실행됐다.
  test("'새 문제 뽑기'는 진행이 있으면 확인을 거친다", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    await modeBtn(page, "연습").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    await page.locator("#options .option").first().click();
    await expect(page.locator("#progressText")).toHaveText("1 / 40");

    await page.getByTestId("random-redraw").click();
    await expect(page.getByTestId("pending-redraw-modal")).toBeVisible();
    await page.getByTestId("pending-redraw-cancel").click();
    await expect(page.locator("#progressText")).toHaveText("1 / 40"); // 취소하면 그대로

    await page.getByTestId("random-redraw").click();
    await page.getByTestId("pending-redraw-confirm").click();
    await expect(page.locator("#progressText")).toHaveText("0 / 40");
  });

  test("'새 문제 뽑기'는 진행이 없으면 묻지 않는다", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    await modeBtn(page, "연습").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("random-redraw").click();
    await expect(page.getByTestId("pending-redraw-modal")).toHaveCount(0);
  });

  // B5: 0문항 채점은 0점 회차가 영구 기록된다 — 무엇이 남는지 알려야 한다.
  test("한 문항도 안 풀고 채점하면 0점 회차로 기록된다고 알린다", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    await enterExam(page);
    await page.getByTestId("grade-button").click();
    const warn = page.getByTestId("grade-zero-warning");
    await expect(warn).toBeVisible();
    await expect(warn).toContainText("0점 회차로 기록");
    await expect(warn).toContainText("응시 포기");
  });

  // D2: 이력은 합쳐지고 답안은 교체된다 — 결과를 예측할 수 있어야 한다.
  test("백업 가져오기는 적용 전에 정책을 알린다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name: "b.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, product: "istqb", answers: {}, histories: {} }), "utf-8"),
    });
    const modal = page.getByTestId("import-confirm-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("답안과 진행 위치는 백업본으로 교체");
    await expect(modal).toContainText("응시 이력은 기존 기록과 합쳐집니다");
    // 취소하면 아무 일도 일어나지 않는다.
    await page.getByTestId("import-cancel").click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId("toast")).toHaveCount(0);
  });
});

// C3: 헤더는 원본 번호, 팔레트는 순번이라 랜덤·오답 모드에서 서로 달랐다.
test.describe("문항 번호 일관성", () => {
  test("랜덤 모드에서 팔레트 번호가 헤더 문항 번호와 일치한다", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    await modeBtn(page, "연습").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    const header = (await page.locator("#questionTitle").textContent()) || "";
    const num = header.match(/문제 (\d+)/)?.[1];
    expect(num).toBeTruthy();
    // 현재 문항의 팔레트 버튼이 같은 번호를 보여줘야 한다.
    await expect(page.locator("#questionNav button.current")).toHaveText(num!);
  });
});
