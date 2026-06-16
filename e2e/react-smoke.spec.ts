import { test, expect } from "@playwright/test";

// React 앱(#56 수정) 런타임 스모크: 로드 → ISTQB 선택 → 문항/선택지 렌더.
// #56(데이터 스키마) 또는 parser(renderRichText) 회귀 시 크래시 → 이 테스트가 실패.
test("React 앱: ISTQB 선택 시 문항이 렌더된다", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto("/");

  const istqb = page.getByRole("button", { name: "ISTQB" });
  await expect(istqb).toBeVisible({ timeout: 20_000 });
  await istqb.click();

  // 문항 본문과 선택지가 렌더될 때까지 대기 (데이터 로드 + 자동 세트 선택 + 렌더)
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#options .option").first()).toBeVisible({ timeout: 20_000 });

  // 런타임 예외가 없었는지 확인 (renderRichText 미정의 같은 회귀 검출)
  expect(pageErrors, `page errors: ${pageErrors.join(" | ")}`).toEqual([]);
});
