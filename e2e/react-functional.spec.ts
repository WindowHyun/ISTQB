import { test, expect, Page } from "@playwright/test";
import { enterExam, submitGrade } from "./helpers";

// React 앱 기능 전수 회귀 스펙 — 게이트·모드·채점·오답노트·설정·진위/단답 UI.
// (Playwright 전수조사에서 도출: 626문항 렌더/404/예외 0, 기능 플로우 정상)

const modeBtn = (page: Page, label: string) =>
  page.locator(".segmented button", { hasText: new RegExp(`^${label}$`) }).first();

async function openIstqb(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "ISTQB" }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
}

test("게이트 → ISTQB 워크스페이스 렌더", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "ISTQB" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "CSTS" })).toBeVisible();
  await page.getByRole("button", { name: "ISTQB" }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#options .option").first()).toBeVisible();
  expect(errs, errs.join(" | ")).toEqual([]);
});

test("연습: 선택 시 즉시 피드백 + 다음 문항 누수 없음", async ({ page }) => {
  await openIstqb(page);
  await modeBtn(page, "연습").click();
  await page.locator("#options .option").first().click();
  await expect(page.locator("#feedback")).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "다음 문제" }).click();
  await expect(page.locator("#questionStem")).toBeVisible();
  await expect(page.locator("#feedback")).toHaveCount(0);
});

test("네비: 팔레트 + 키보드 화살표 이동", async ({ page }) => {
  await openIstqb(page);
  await modeBtn(page, "연습").click();
  const nav = page.locator("#questionNav button");
  await nav.nth(2).click();
  await expect(nav.nth(2)).toHaveClass(/current/);
  const before = await page.locator("#questionTitle").textContent();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#questionTitle")).not.toHaveText(before || "");
});

test("시험: 채점 전 피드백 없음 → 채점 → 점수/공개 + 오답노트", async ({ page }) => {
  await openIstqb(page);
  await enterExam(page);
  await page.locator("#options .option").first().click();
  await expect(page.locator("#feedback")).toHaveCount(0);
  await submitGrade(page);
  await expect(page.getByTestId("score")).toContainText("점수", { timeout: 8_000 });
  await expect(page.locator("#feedback").first()).toBeVisible();
  // 채점 시 자동으로 뜨는 결과 요약 모달을 닫는다.
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
  await page.getByRole("button", { name: "오답 노트" }).click();
  await expect(page.getByTestId("wrong-note")).toBeVisible({ timeout: 5_000 });
});

test("랜덤: 문항 로드(≤40)", async ({ page }) => {
  await openIstqb(page);
  await modeBtn(page, "랜덤").click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
  const n = await page.locator("#questionNav button").count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(40);
});

test("설정: 모달 + 글자 크기 반영", async ({ page }) => {
  await openIstqb(page);
  await page.getByRole("button", { name: /설정/ }).click();
  await expect(page.getByRole("dialog", { name: "설정" })).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "크게" }).click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.qfont)).toBe("large");
});

test("CSTS: 진위형(O/X)·단답형(입력) UI 존재", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "CSTS" }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await modeBtn(page, "연습").click();
  const sel = page.locator("#examSelect");
  const setVals: string[] = await sel.locator("option").evaluateAll((els) =>
    (els as HTMLOptionElement[]).map((e) => e.value),
  );
  let foundTF = false;
  let foundShort = false;
  for (const v of setVals) {
    await sel.selectOption(v);
    await modeBtn(page, "연습").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 10_000 });
    const total = Math.min(await page.locator("#questionNav button").count(), 70);
    for (let i = 0; i < total; i++) {
      await page.locator("#questionNav button").nth(i).click();
      const keys = (await page.locator("#options .option .option-key").allTextContents())
        .map((k) => k.trim().toUpperCase());
      if (keys.length === 2 && keys.join("") === "OX") foundTF = true;
      if ((await page.locator(".short-answer-input").count()) > 0) {
        foundShort = true;
        // 단답 입력 → 정답 확인 → 피드백
        await page.locator(".short-answer-input").fill("테스트");
        const chk = page.getByRole("button", { name: "정답 확인" });
        if ((await chk.count()) > 0) await chk.click();
        await expect(page.locator("#feedback")).toBeVisible({ timeout: 4_000 });
      }
      if (foundTF && foundShort) break;
    }
    if (foundTF && foundShort) break;
  }
  expect(foundTF, "진위형 O/X UI").toBe(true);
  expect(foundShort, "단답형 입력 UI").toBe(true);
});
