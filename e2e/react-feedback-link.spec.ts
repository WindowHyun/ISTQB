import { test, expect } from "@playwright/test";
import { openProduct } from "./helpers";

// 이슈·보완점 제보 링크 — 게이트 하단·사이드바 두 진입점 모두 구글시트를
// 새 탭으로 연다(풀이 세션을 끊지 않기 위해 target=_blank 필수).

const SHEET_HOST = "docs.google.com/spreadsheets/d/1AQWMyvg0oV0sCvfep-kO0K5DKzqoJ5dUQ0CNpBm8glA";

test.describe("이슈·보완점 제보 링크", () => {
  test("게이트 하단 — 사용법 버튼 옆에 있고 새 탭으로 시트를 연다", async ({ page }) => {
    await page.goto("/");
    const link = page.getByTestId("feedback-link-gate");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", new RegExp(SHEET_HOST));
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    // 사용법 버튼도 같은 줄에 그대로 남아 있다(기존 진입점 회귀 방지).
    await expect(page.getByTestId("guide-open")).toBeVisible();
  });

  test("사이드바 하단 — 학습 통계·설정 버튼 묶음에 있고 새 탭으로 시트를 연다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    const link = page.getByTestId("feedback-link");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", new RegExp(SHEET_HOST));
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  });
});
