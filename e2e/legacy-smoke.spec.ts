import { test, expect } from "@playwright/test";

// 실제 배포되는 레거시 앱의 핵심 흐름 스모크.
// ./data 또는 ./public/data 로딩이 깨지면 문항이 렌더되지 않아 이 테스트가 실패한다.
test("레거시 앱: ISTQB 선택 시 문항이 렌더된다", async ({ page }) => {
  await page.goto("/");

  const openIstqb = page.locator("#openIstqbBtn");
  await expect(openIstqb).toBeVisible();
  await openIstqb.click();

  // 문제 본문이 채워질 때까지 대기 (데이터 fetch + 렌더 완료)
  const stem = page.locator("#questionStem");
  await expect(stem).toBeVisible({ timeout: 15_000 });
  await expect(stem).not.toBeEmpty({ timeout: 15_000 });

  // 선택지 버튼이 하나 이상 렌더되는지 확인
  await expect(page.locator("#options button").first()).toBeVisible({ timeout: 15_000 });
});
