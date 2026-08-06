import { test, expect } from "@playwright/test";
import { enterExam, openProduct, openSet, submitGrade } from "./helpers";

// 엣지: 반응형(모바일 드로어·하단바·점프핀·소형 뷰포트).
test.describe("엣지-반응형", () => {
  test.describe("모바일(375x812)", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("모바일 상단바가 보인다", async ({ page }) => {
      await openProduct(page, "ISTQB");
      await expect(page.locator(".mobile-topbar")).toBeVisible();
    });

    test("인라인 팔레트는 모바일에서 숨겨진다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await expect(page.locator(".palette-block")).toBeHidden();
    });

    test("☰로 드로어가 열리고 백드롭으로 닫힌다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      const shell = page.locator(".app-shell");
      await page.getByTestId("drawer-open").click();
      await expect(shell).toHaveAttribute("data-drawer", "open");
      await page.locator(".drawer-backdrop").click({ position: { x: 360, y: 400 } });
      await expect(shell).toHaveAttribute("data-drawer", "closed");
    });

    test("드로어는 Esc로 닫힌다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("drawer-open").click();
      await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "open");
      await page.keyboard.press("Escape");
      await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "closed");
    });
    test("점프핀→문항 이동 시트로 문항을 옮긴다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("jump-pin").click();
      const sheet = page.getByTestId("palette-jump");
      await expect(sheet).toBeVisible();
      await sheet.locator("button", { hasText: /^4$/ }).click();
      await expect(page.getByTestId("jump-pin")).toContainText("4 /");
    });
    test("드로어에서 학습 통계가 열린다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("drawer-open").click();
      await page.getByTestId("stats-open").click();
      await expect(page.getByTestId("stats-dashboard")).toBeVisible({ timeout: 5_000 });
    });

    test("제품 선택 게이트가 모바일에서 표시된다", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "ISTQB" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "CSTS" })).toBeVisible();
    });

    test("드로어의 채점하기는 드로어를 닫고 확인 팝업을 맨 위로 띄운다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("drawer-open").click();
      await enterExam(page); // 모드 변경으로 드로어가 닫힘
      await page.getByTestId("drawer-open").click();
      await page.getByTestId("grade-button").click();
      // 드로어가 닫혀 뒤의 모드/세트 컨트롤을 더 조작할 수 없다.
      await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "closed");
      const modal = page.getByTestId("confirm-grade-modal");
      await expect(modal).toBeVisible();
      // 팝업이 최상단이라 버튼 조작이 가능하다(z-index 회귀 방지).
      await page.getByRole("button", { name: "계속 풀기" }).click();
      await expect(modal).toHaveCount(0);
    });

    test("라이트박스 이미지가 화면 폭 안에 온전히 들어온다(오른쪽 잘림 방지)", async ({ page }) => {
      await openSet(page, "CSTS", "CSTS-FL-2402");
      // 그림 문항(9번)으로 이동 — 모바일은 점프핀 시트 사용.
      await page.getByTestId("jump-pin").click();
      await page.getByTestId("palette-jump").locator("button", { hasText: /^9$/ }).click();
      await page.locator("#questionFigure img, #questionStem img").first().click();
      const img = page.locator(".figure-lightbox-img");
      await expect(img).toBeVisible();
      const box = await img.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375 + 1); // 뷰포트 폭(375) 안(±1px 반올림 여유)
    });

    test("통계 챕터 행의 연습·미니 시험 버튼이 한 줄로 렌더된다(세로 꺾임 회귀)", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      // 채점 1회로 챕터 통계를 만든다 — 모바일에선 모드 버튼이 드로어 안에 있다.
      await page.getByTestId("drawer-open").click();
      await enterExam(page);
      await page.locator("#options .option").first().click();
      await submitGrade(page, "grade-button-m"); // 모바일: 하단 액션바 채점 버튼
      await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
      await page.getByTestId("drawer-open").click();
      await page.getByTestId("stats-open").click();
      const mini = page.getByTestId("chapter-minitest-btn").first();
      await expect(mini).toBeVisible();
      // 세로로 꺾이면('미/니/시/험') 높이가 4줄(≥60px)이 된다 — 한 줄이면 ~30px.
      const box = await mini.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeLessThan(45);
      const prac = await page.getByTestId("chapter-practice-btn").first().boundingBox();
      expect(prac!.height).toBeLessThan(45);
    });
  });

  test.describe("초소형(320x640)", () => {
    test.use({ viewport: { width: 320, height: 640 } });

    test("320px에서도 문항과 보기가 렌더된다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await expect(page.locator("#questionStem")).toBeVisible();
      await expect(page.locator("#options .option").first()).toBeVisible();
    });
  });

  test.describe("태블릿(768x1024)", () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test("태블릿에서 CSTS 문항이 렌더된다", async ({ page }) => {
      await openSet(page, "CSTS", "CSTS-FL-2402");
      await expect(page.locator("#questionStem")).toBeVisible();
      await expect(page.locator("#options .option").first()).toBeVisible();
    });

    test("태블릿에서도 채점 결과 모달이 표시된다", async ({ page }) => {
      // 768px은 ≤880(모바일 레이아웃) → 모드는 드로어에서, 채점은 하단바로.
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("drawer-open").click();
      await enterExam(page);
      await page.locator("#options .option").first().click();
      await submitGrade(page, "grade-button-m");
      await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 8_000 });
    });
  });
});
