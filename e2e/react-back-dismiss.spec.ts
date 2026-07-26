import { test, expect } from "@playwright/test";
import { gotoQuestion, modeBtn, openProduct, openSet } from "./helpers";

// 뒤로가기로 오버레이 닫기.
// 안드로이드 하드웨어 뒤로가기는 @capacitor/app이 history.back()으로 넘겨주므로,
// 여기서 검증하는 브라우저 뒤로가기 경로가 앱에서도 그대로 동작한다.
test.describe("뒤로가기-오버레이", () => {
  test("설정 모달은 뒤로가기로 닫히고 앱을 벗어나지 않는다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await expect(page.getByRole("dialog", { name: "설정" })).toBeVisible();

    await page.goBack();

    await expect(page.getByRole("dialog", { name: "설정" })).toHaveCount(0);
    // 모달만 닫혔을 뿐 풀이 화면은 그대로다 — 종전에는 페이지를 벗어났다.
    await expect(page.locator("#questionStem")).toBeVisible();
  });

  test("모달을 UI로 닫으면 가드가 정리돼 뒤로가기가 새지 않는다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await expect(page.getByRole("dialog", { name: "설정" })).toBeVisible();
    // Esc로 닫으면 쌓아둔 history 항목도 함께 되돌아가야 한다.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "설정" })).toHaveCount(0);

    // 다시 열고 뒤로가기 → 여전히 한 번에 닫힌다(가드가 중복으로 남지 않았다).
    await page.getByRole("button", { name: /설정/ }).click();
    await expect(page.getByRole("dialog", { name: "설정" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog", { name: "설정" })).toHaveCount(0);
    await expect(page.locator("#questionStem")).toBeVisible();
  });

  test("오답 노트는 뒤로가기로 단계별로 되돌아간다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.getByRole("button", { name: "오답 노트" }).click();
    await expect(page.getByTestId("wrong-note")).toBeVisible();

    // 기록이 없는 상태에서도 노트 자체는 뒤로가기 한 번으로 닫힌다.
    await page.goBack();
    await expect(page.getByTestId("wrong-note")).toHaveCount(0);
    await expect(page.locator("#questionStem")).toBeVisible();
  });

  test("문항 이동 팔레트도 뒤로가기로 닫힌다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.getByTestId("palette-jump-btn").click();
    await expect(page.getByTestId("palette-jump")).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId("palette-jump")).toHaveCount(0);
    await expect(page.locator("#questionStem")).toBeVisible();
  });

  test("모달이 없을 때의 뒤로가기는 가로채지 않는다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await expect(page.locator("#questionStem")).toBeVisible();
    // 오버레이가 없으면 우리 가드가 없으므로 평소대로 이전 페이지로 나간다.
    // (앱에서는 이 경우에만 종료된다.)
    await page.goBack();
    await expect(page.locator("#questionStem")).toHaveCount(0);
  });
});

// 서답형 정답 표기 — 대문자로 강제하면 "회귀(Regression) 테스트"가
// "회귀(REGRESSION) 테스트"가 돼 정답 표기가 왜곡된다(선택형 키만 대문자).
test.describe("정답 표기", () => {
  test("서답형 정답은 원문 대소문자를 유지한다", async ({ page }) => {
    await openSet(page, "CSTS", "CSTS-FL-2402");
    await modeBtn(page, "연습").click();
    await gotoQuestion(page, 61); // 단답형 — 정답 "구조기반 / Structure-based Test"
    await page.locator(".short-answer-input").fill("아무거나");
    await page.getByRole("button", { name: "정답 확인" }).click();
    const feedback = page.locator("#feedback");
    await expect(feedback).toBeVisible({ timeout: 4_000 });
    await expect(feedback).toContainText("Structure-based Test");
    await expect(feedback).not.toContainText("STRUCTURE-BASED TEST");
  });

  test("선택형 보기 키는 그대로 대문자로 보여준다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.locator("#options .option").first().click();
    await expect(page.locator("#feedback")).toContainText(/정답 [A-E]/);
  });
});
