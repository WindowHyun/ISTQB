import { test, expect } from "@playwright/test";
import { openProduct, openSet } from "./helpers";

// 접근성(ARIA/키보드/포커스) — 레거시 대비 회귀 방지(#66).
test.describe("접근성", () => {
  test("모드 버튼에 aria-pressed가 반영된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    const practice = page.locator('.segmented button[data-mode="practice"]');
    await expect(practice).toHaveAttribute("aria-pressed", "true");
    const exam = page.locator('.segmented button[data-mode="exam"]');
    await expect(exam).toHaveAttribute("aria-pressed", "false");
  });

  test("풀이 모드 그룹에 role=group과 라벨이 있다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await expect(page.getByRole("group", { name: "풀이 모드" })).toBeVisible();
  });

  test("현재 문항 팔레트 버튼에 aria-current가 설정된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await expect(page.locator('#questionNav button[aria-current="true"]')).toHaveText("1");
  });

  test("보기 버튼에 aria-pressed가 반영된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    const opt = page.locator("#options .option").first();
    await expect(opt).toHaveAttribute("aria-pressed", "false");
    await opt.click();
    await expect(opt).toHaveAttribute("aria-pressed", "true");
  });

  test("이전/다음 버튼에 aria-label이 있다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await expect(page.locator("#prevBtn")).toHaveAttribute("aria-label", "이전 문제");
    await expect(page.locator("#nextBtn")).toHaveAttribute("aria-label", "다음 문제");
  });

  test("백업 파일 입력에 aria-label이 있다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await expect(page.locator('input[type="file"][accept=".json"]')).toHaveAttribute("aria-label", /백업/);
  });

  test("설정 모달은 role=dialog + aria-modal을 갖는다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    const dialog = page.getByRole("dialog", { name: "설정" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  test("키보드(Tab/Enter)만으로 보기를 선택할 수 있다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    const opt = page.locator("#options .option").first();
    await opt.focus();
    await page.keyboard.press("Enter");
    await expect(opt).toHaveClass(/selected/);
  });

  test("진행률에 aria-live가 있고, 타이머는 라이브 영역 밖이다(매초 낭독 방지)", async ({ page }) => {
    await openProduct(page, "ISTQB");
    // 진행률(답한/총) 갱신만 스크린리더가 알린다.
    await expect(page.locator("#progressText")).toHaveAttribute("aria-live", "polite");
    // .stats 섹션 전체를 라이브로 두면 타이머가 매초 낭독되므로, 섹션엔 aria-live가 없어야 한다.
    await expect(page.locator(".stats")).not.toHaveAttribute("aria-live", "polite");
  });

  // 다크 모드의 --success/--danger는 '어두운 배경 위 글자색'으로 고른 밝은 색이라,
  // 그걸 뱃지 배경으로 깔고 흰 글자를 얹으면 대비가 무너진다(정답 1.74:1, 오답 2.77:1).
  // 채점 직후 정·오답을 확인하는 화면이라 여기서 글자가 안 읽히면 기능이 무의미해진다.
  test("다크 모드에서 채점된 보기 뱃지의 글자 대비가 3:1 이상이다", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("istqb-theme", "dark"));
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");

    // 채점 상태의 정답/오답 뱃지를 만든다(연습은 즉시 피드백으로 색이 붙는다).
    await page.locator("#options .option").first().click();
    await expect(page.locator("#options .option.correct, #options .option.wrong")).not.toHaveCount(0);

    const worst = await page.locator("#options .option-key").evaluateAll((els) => {
      const rgb = (c: string) => (c.match(/\d+/g) || []).slice(0, 3).map(Number);
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      let min = Infinity;
      for (const el of els) {
        const s = getComputedStyle(el);
        const a = lum(rgb(s.color)) + 0.05;
        const b = lum(rgb(s.backgroundColor)) + 0.05;
        min = Math.min(min, Math.max(a, b) / Math.min(a, b));
      }
      return min;
    });
    expect(worst).toBeGreaterThanOrEqual(3);
  });
});
