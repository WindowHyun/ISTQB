import { test, expect } from "@playwright/test";
import { enterExam, modeBtn, openProduct, openSet } from "./helpers";

// 엣지: 영속성·복원·가져오기/내보내기·테마/콘솔 지속.
test.describe("엣지-영속성", () => {
  test("새로고침하면 항상 제품 선택 게이트로 돌아온다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.reload();
    await expect(page.getByRole("button", { name: "ISTQB" })).toBeVisible({ timeout: 15_000 });
  });

  test("답 선택 후 새로고침→재선택 시 진행 수가 복원된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#progressText")).toContainText("1 /");
  });

  test("세트를 바꾼 뒤 새로고침해도 같은 세트가 유지된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-B");
    await page.waitForTimeout(700);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#examSelect")).toHaveValue("ISTQB-FL-V4-B");
  });
  test("다크 테마는 새로고침 후에도 유지된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("dialog", { name: "설정" }).getByRole("button", { name: "다크" }).click();
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.theme)).toBe("dark");
  });

  test("글자 크기(작게)는 새로고침 후에도 유지된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("button", { name: "작게" }).click();
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.qfont)).toBe("small");
  });

  test("ISTQB와 CSTS 답안은 제품별로 격리된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(700);
    // 처음 화면으로 → CSTS
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("button", { name: /처음 화면/ }).click();
    await page.getByRole("button", { name: "CSTS" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#progressText")).toContainText("0 /");
  });

  test("잘못된 JSON 가져오기는 실패 토스트를 띄운다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{broken", "utf-8"),
    });
    // 가져오기는 적용 전에 정책 확인을 거친다(D2).
    await page.getByTestId("import-confirm").click();
    // 오류 토스트로 뜨고, 무엇이 문제인지 알려준다 — 종전에는 어떤 실패든 같은 문구라
    // 사용자가 파일을 고쳐야 하는지 앱을 고쳐야 하는지 알 수 없었다.
    const toast = page.getByTestId("toast");
    await expect(toast).toBeVisible({ timeout: 5_000 });
    await expect(toast).toHaveClass(/toast-error/);
    await expect(toast).toContainText("해석하지 못했");
  });

  test("빈 객체 JSON 가져오기는 크래시 없이 처리된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name: "empty.json", mimeType: "application/json", buffer: Buffer.from("{}", "utf-8"),
    });
    // 가져오기는 적용 전에 정책 확인을 거친다(D2).
    await page.getByTestId("import-confirm").click();
    await expect(page.getByTestId("toast")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".workspace")).toBeVisible();
  });
  test("현재 모드 답안 초기화는 2단계 확인 후 동작한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.locator("#options .option").first().click();
    expect(await page.locator("#questionNav button.answered").count()).toBeGreaterThanOrEqual(1);
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("button", { name: "현재 모드 답안 초기화" }).click();
    await page.getByTestId("confirm-reset-yes").click();
    await page.waitForTimeout(300);
    expect(await page.locator("#questionNav button.answered").count()).toBe(0);
  });

  test("?debug 플래그는 새로고침 후에도 유지된다", async ({ page }) => {
    await page.goto("/?debug");
    await expect(page.getByTestId("debug-fab")).toBeVisible({ timeout: 8_000 });
    await page.goto("/");
    await expect(page.getByTestId("debug-fab")).toBeVisible({ timeout: 8_000 });
  });

  test("localStorage 저장이 막힌 환경에서도 제품 선택·문항 진입이 된다", async ({ page }) => {
    // 프라이빗 모드·쿼터 초과·저장 비활성 등에서 setItem이 예외를 던지는 상황을 모사.
    await page.addInitScript(() => {
      const proto = Object.getPrototypeOf(window.localStorage);
      proto.setItem = () => { throw new Error("저장 불가(테스트 모사)"); };
    });
    await page.goto("/");
    await page.getByRole("button", { name: "ISTQB" }).click();
    // handleProductSelect의 setItem이 앱 진입을 막지 않아야 한다(안전 래퍼).
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    // 답 선택도 크래시 없이 동작(저장은 조용히 실패).
    await page.locator("#options .option").first().click();
    await expect(page.locator("#questionNav button.answered")).toHaveCount(1);
  });

  test("localStorage 저장이 막혀도 테마·글자 크기 설정이 크래시 없이 동작한다", async ({ page }) => {
    await page.addInitScript(() => {
      const proto = Object.getPrototypeOf(window.localStorage);
      proto.setItem = () => { throw new Error("저장 불가(테스트 모사)"); };
    });
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("dialog", { name: "설정" }).getByRole("button", { name: "다크" }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.theme)).toBe("dark");
    await page.getByRole("button", { name: "작게" }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.qfont)).toBe("small");
  });

  test("여러 문항 응답 후 새로고침→재선택 시 진행 수가 복원된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    for (let i = 0; i < 3; i++) {
      await page.locator("#options .option").first().click();
      await page.locator("#nextBtn").click();
    }
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#progressText")).toContainText("3 /");
  });
});
