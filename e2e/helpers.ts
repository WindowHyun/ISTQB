import { Page, expect } from "@playwright/test";

// React E2E 공용 헬퍼 (스펙 아님 — testMatch /react-*.spec.ts/ 에 안 잡힘).

export const modeBtn = (page: Page, label: string) =>
  page.locator(".segmented button", { hasText: new RegExp(`^${label}$`) }).first();

export async function openProduct(page: Page, name: "ISTQB" | "CSTS") {
  await page.goto("/");
  await page.getByRole("button", { name }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
}

// 제품 선택 후 특정 세트(연습 모드)로 진입.
export async function openSet(page: Page, product: "ISTQB" | "CSTS", setId: string) {
  await openProduct(page, product);
  await page.locator("#examSelect").selectOption(setId);
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 15_000 });
}

// 문제 번호 팔레트로 특정 문항 이동.
export async function gotoQuestion(page: Page, num: number) {
  const nav = page.locator("#questionNav button");
  const total = await nav.count();
  for (let i = 0; i < total; i++) {
    if (((await nav.nth(i).textContent()) || "").trim() === String(num)) {
      await nav.nth(i).click();
      await page.waitForTimeout(80);
      return;
    }
  }
  throw new Error("문항 번호를 찾지 못함: " + num);
}
