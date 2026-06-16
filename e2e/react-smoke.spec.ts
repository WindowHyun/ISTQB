import { test, expect } from "@playwright/test";

// React 앱(#56 수정) 런타임 스모크: 로드 → ISTQB 선택 → 문항/선택지 렌더.
// (진단 로그 포함 — 실패 원인 파악 후 정리 예정)
test("React 앱: ISTQB 선택 시 문항이 렌더된다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console.error: " + m.text());
  });

  await page.goto("/index.vite.html");

  const istqb = page.getByRole("button", { name: "ISTQB" });
  await expect(istqb).toBeVisible({ timeout: 20_000 });
  await istqb.click();

  await page.waitForTimeout(6000);
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 700);
  console.log("DIAG_BODY >>> " + body);
  console.log("DIAG_ERRORS >>> " + (errors.slice(0, 12).join(" || ") || "(none)"));
  console.log("DIAG_HAS_STEM >>> " + (await page.locator("#questionStem").count()));
  console.log("DIAG_HAS_GATE >>> " + (await page.getByRole("button", { name: "ISTQB" }).count()));

  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#options .option").first()).toBeVisible({ timeout: 15_000 });
});
