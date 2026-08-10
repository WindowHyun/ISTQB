import { test, expect } from "@playwright/test";
import { openProduct } from "./helpers";

// 사용설명서 — 게이트 하단 버튼·설정 모달 두 진입점에서 같은 문서를 연다.
// 핵심 문구를 고정해 기능 설명이 실제 동작과 어긋난 채 방치되는 것을 막는다.

test.describe("사이트 사용법(사용설명서)", () => {
  test("게이트 하단 '사이트 사용법' → 모드·통계·백업 설명이 보이고 Esc로 닫힌다", async ({ page }) => {
    await page.goto("/");
    // 제품을 선택하기 전에도 열 수 있어야 한다(첫 방문자 대상).
    await page.getByTestId("guide-open").click();
    const guide = page.getByTestId("user-guide");
    await expect(guide).toBeVisible();
    // 각 모드와 핵심 규칙이 설명돼 있다.
    await expect(guide).toContainText("연습");
    await expect(guide).toContainText("시험 시작");
    await expect(guide).toContainText("새 문제 뽑기");
    await expect(guide).toContainText("미니 시험");
    await expect(guide).toContainText("퀵");
    // 퀵의 두 가지 약속(기록 없음 · 오답 24시간)은 화면 어디에도 안내가 없으면
    // 사용자가 "왜 통계에 안 잡히지"를 결함으로 신고하게 된다.
    await expect(guide).toContainText("회차 기록을 아예 남기지 않습니다");
    await expect(guide).toContainText("24시간");
    await expect(guide).toContainText("✓ 극복");
    await expect(guide).toContainText("기록 내보내기");
    await page.keyboard.press("Escape");
    await expect(guide).toHaveCount(0);
    // 닫은 뒤 게이트가 그대로다(제품 미선택 상태 유지).
    await expect(page.getByRole("heading", { name: "학습할 자격증을 선택하세요" })).toBeVisible();
  });

  test("설정 모달의 '사이트 사용법'으로도 같은 문서가 열린다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.locator(".settings-open-btn", { hasText: "설정" }).click();
    await page.getByTestId("guide-open-settings").click();
    const guide = page.getByTestId("user-guide");
    await expect(guide).toBeVisible();
    await expect(guide).toContainText("풀이 모드 4가지");
    // 설정 모달은 닫힌 상태여야 한다(모달 겹침 방지).
    await expect(page.getByRole("heading", { name: "설정" })).toHaveCount(0);
  });
});
