import { test, expect } from "@playwright/test";
import { openProduct, openSet, modeBtn } from "./helpers";

// 영속성(새로고침 복원) + 기록 내보내기/가져오기.
// 진입 시 항상 제품 선택 게이트가 뜨므로(#5), 재선택 시 저장된 답안이 복원된다.
test.describe("영속성/백업", () => {
  test("답 선택 후 새로고침 → 제품 재선택 시 답안이 복원된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(800); // 디바운스 저장 플러시
    expect(await page.locator("#questionNav button.answered").count()).toBe(1);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(400);
    expect(await page.locator("#questionNav button.answered").count()).toBe(1);
  });

  test("여러 문항 응답 후 새로고침 → 진행 수가 복원된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.locator("#options .option").first().click();
    await page.locator("#nextBtn").click();
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(400);
    expect(await page.locator("#questionNav button.answered").count()).toBeGreaterThanOrEqual(2);
  });

  test("세트를 바꾼 뒤 새로고침해도 같은 세트가 유지된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-C");
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(400);
    await expect(page.locator("#examSelect")).toHaveValue("ISTQB-FL-V4-C");
  });

  test("기록 내보내기 시 JSON 파일이 다운로드된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 8_000 }),
      page.getByRole("button", { name: "기록 내보내기" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });

  test("내보내기→초기화→가져오기 라운드트립으로 답안이 복원된다", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(800);
    // 설정 모달을 한 번만 열고 export → 초기화 → import 를 모달 안에서 처리.
    await page.getByRole("button", { name: /설정/ }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 8_000 }),
      page.getByRole("button", { name: "기록 내보내기" }).click(),
    ]);
    const filePath = await download.path();
    await page.getByRole("button", { name: "현재 모드 답안 초기화" }).click();
    await page.waitForTimeout(300);
    expect(await page.locator("#questionNav button.answered").count()).toBe(0);
    await page.locator('input[type="file"][accept=".json"]').setInputFiles(filePath as string);
    await page.waitForTimeout(800);
    expect(await page.locator("#questionNav button.answered").count()).toBeGreaterThanOrEqual(1);
  });

  test("잘못된 파일 가져오기는 실패 알림을 띄운다", async ({ page }) => {
    const messages: string[] = [];
    page.on("dialog", (d) => { messages.push(d.message()); d.accept(); });
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    const bad = { name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{not valid json", "utf-8") };
    await page.locator('input[type="file"][accept=".json"]').setInputFiles(bad);
    await page.waitForTimeout(800);
    expect(messages.join(" ")).toContain("실패");
  });

  test("시험 모드 답안도 새로고침 후 복원된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "시험").click();
    await page.locator("#options .option").first().click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await modeBtn(page, "시험").click();
    await page.waitForTimeout(400);
    expect(await page.locator("#questionNav button.answered").count()).toBeGreaterThanOrEqual(1);
  });
});
