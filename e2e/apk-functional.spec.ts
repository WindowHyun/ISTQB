import { test, expect, Page } from "@playwright/test";
import { enterExamMobile, openSet, submitGrade, closeResult } from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// APK(WebView) 기능 테스트 — Android 폰 에뮬레이션 + MainActivity의 안전영역
// 변수 주입(--safe-top/--safe-bottom)을 모사해, 모바일웹과 "APK 웹뷰"의 차이
// (edge-to-edge에서 상태바·제스처바가 콘텐츠를 가리는 문제)를 회귀 검증한다.
// 전용 프로젝트(apk)에서 Pixel 7 디바이스 프로파일 + WebView UA로 돈다.
// 배경: 실기기에서 상단 헤더·☰ 버튼이 가려지던 결함(2026-07 수리)의 재발 방지.
// ─────────────────────────────────────────────────────────────────────────────

const SAFE_TOP = 28; // Pixel 계열 상태바 실측치 근사(CSS px)
const SAFE_BOTTOM = 24; // 제스처 내비게이션 바

// MainActivity.injectSafeAreaInsets()와 동일한 효과 — 문서 생성 직후 주입.
async function simulateApkInsets(page: Page) {
  await page.addInitScript(
    ([top, bottom]) => {
      const apply = () => {
        document.documentElement.style.setProperty("--safe-top", `${top}px`);
        document.documentElement.style.setProperty("--safe-bottom", `${bottom}px`);
      };
      if (document.documentElement) apply();
      document.addEventListener("DOMContentLoaded", apply);
    },
    [SAFE_TOP, SAFE_BOTTOM],
  );
}

// 페이지 JS 오류 수집 — 웹뷰에선 콘솔이 안 보여 조용히 깨지기 쉽다.
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}


test.describe("APK 기능 · 상단 안전영역", () => {
  test.beforeEach(async ({ page }) => simulateApkInsets(page));

  test("AF1 상단바가 상태바 아래에서 시작하고 ☰ 버튼이 온전히 보인다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "ISTQB" }).click();
    const topbar = page.locator(".mobile-topbar");
    await expect(topbar).toBeVisible();

    // 상단바 내용(브랜드 행)이 상태바 영역(0~SAFE_TOP)을 피해서 시작해야 한다.
    const brand = page.locator(".mtb-brand");
    const brandBox = (await brand.boundingBox())!;
    expect(brandBox.y).toBeGreaterThanOrEqual(SAFE_TOP);

    // ☰(드로어 열기)가 뷰포트 안에 온전히 있고 실제로 탭 가능해야 한다.
    const menu = page.getByTestId("drawer-open");
    await expect(menu).toBeVisible();
    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.y).toBeGreaterThanOrEqual(SAFE_TOP);
    await menu.tap();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "open");
  });

  test("AF2 드로어 내용도 안전영역을 피하고, 세트 변경이 동작한다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "ISTQB" }).click();
    await page.getByTestId("drawer-open").tap();
    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toBeVisible();
    // 드로어 첫 콘텐츠(브랜드)가 상태바에 가려지지 않아야 한다.
    const first = sidebar.locator(".brand");
    const box = (await first.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(SAFE_TOP);
    // 드로어에서 세트 변경 → 드로어 닫힘 + 새 세트 로드
    await page.locator("#examSelect").selectOption("ISTQB-FL-V4-B");
    await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "closed");
    await expect(page.locator("#questionStem")).toBeVisible();
  });
});

test.describe("APK 기능 · 하단 안전영역", () => {
  test.beforeEach(async ({ page }) => simulateApkInsets(page));

  test("AF3 하단 액션바가 제스처바를 피해 뷰포트 안에 온전히 보인다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    const bar = page.locator(".mobile-actionbar");
    await expect(bar).toBeVisible();
    const next = page.getByRole("button", { name: "다음 문제" });
    const box = (await next.boundingBox())!;
    const viewport = page.viewportSize()!;
    // 버튼 바닥이 제스처바 영역(뷰포트 하단 SAFE_BOTTOM) 위에서 끝나야 한다.
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - SAFE_BOTTOM + 1);
  });

  test("AF4 하단 이전/다음 탭으로 문항이 이동한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.getByRole("button", { name: "다음 문제" }).tap();
    await expect(page.locator("#questionTitle")).toContainText("문제 2");
    await page.getByRole("button", { name: "이전 문제" }).tap();
    await expect(page.locator("#questionTitle")).toContainText("문제 1");
  });
});

test.describe("APK 기능 · 핵심 플로우(터치)", () => {
  test.beforeEach(async ({ page }) => simulateApkInsets(page));

  test("AF5 연습: 보기 탭 → 즉시 피드백 → 진행 증가", async ({ page }) => {
    const errors = collectErrors(page);
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.locator("#options .option").first().tap();
    await expect(page.locator("#feedback")).toBeVisible();
    await expect(page.locator(".mtb-meta").first()).toContainText("1 / 40");
    expect(errors).toEqual([]);
  });

  test("AF6 시험: 진입→응답→채점→결과 모달이 모바일에서 완결된다", async ({ page }) => {
    const errors = collectErrors(page);
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExamMobile(page);
    await page.locator("#options .option").first().tap();
    // 모바일 채점 버튼(하단 액션바)로 채점
    await submitGrade(page, "grade-button-m");
    await expect(page.getByTestId("result-summary")).toBeVisible();
    await closeResult(page);
    expect(errors).toEqual([]);
  });

  test("AF7 재실행(웹뷰 재시작 모사): 연습 답안이 복원된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.locator("#options .option").first().tap();
    await expect(page.locator("#feedback")).toBeVisible();
    // 앱 프로세스 재시작 = 페이지 전체 리로드
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible();
    await expect(page.locator(".mtb-meta").first()).toContainText("1 / 40");
  });

  test("AF8 가로 스크롤이 생기지 않는다(콘텐츠 넘침 금지)", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

// 퀵은 이 프로젝트에서 한 번도 안 돌았다. 데스크톱 스펙이 뷰포트를 390px로 줄여
// 터치 타깃을 재긴 하지만, WebView UA도 안전영역 변수도 없는 환경이라 여기서
// 검증되는 것(제스처바 회피·드로어 안 컨트롤·웹뷰 재시작 복원)을 대신해 주지 못한다.
test.describe("APK 기능 · 퀵 랜덤(터치)", () => {
  test.beforeEach(async ({ page }) => simulateApkInsets(page));

  const startQuick = async (page: Page, size: string) => {
    await page.goto("/");
    await page.getByRole("button", { name: "ISTQB" }).tap();
    await page.getByTestId("drawer-open").tap();
    await page.locator("#quickSize").selectOption(size);
    await page.getByTestId("quick-start-btn").tap();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  };

  test("AF11 드로어 안 퀵 컨트롤이 제스처바를 피하고 탭으로 출제된다", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await page.getByRole("button", { name: "ISTQB" }).tap();
    await page.getByTestId("drawer-open").tap();

    const viewport = page.viewportSize()!;
    for (const target of [page.locator("#quickSize"), page.getByTestId("quick-start-btn")]) {
      await expect(target).toBeVisible();
      const box = (await target.boundingBox())!;
      // 제스처바에 걸리면 탭이 시스템 제스처로 먹혀 "눌러도 반응 없는" 컨트롤이 된다.
      expect(box.y + box.height, "퀵 컨트롤이 제스처바 영역에 걸린다")
        .toBeLessThanOrEqual(viewport.height - SAFE_BOTTOM + 1);
      // 실기기 터치 최소 크기(44px) — 데스크톱 스펙에서 고쳤지만 여기선 미검증이었다.
      expect(box.height, "터치 타깃이 44px 미만").toBeGreaterThanOrEqual(44);
    }

    await page.locator("#quickSize").selectOption("10");
    await page.getByTestId("quick-start-btn").tap();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".mtb-meta").first()).toContainText("/ 10");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "퀵 화면에서 가로 넘침").toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  // 퀵 회차의 setId는 'QUICK'이라 오답의 출처 세트는 wrongItems[].setId에만 남는다.
  // 이력은 읽을 때마다 정제되므로, 정제가 그 필드를 흘리면 채점 직후에는 멀쩡하다가
  // 웹뷰 재시작 한 번에 오답노트가 '퀵 랜덤' 한 덩어리로 뭉친다(실제로 났던 결함).
  // 재시작이 일상인 APK에서 재라, 이 축은 여기서 잡는 게 맞다.
  test("AF12 퀵 채점 후 오답노트 출처 세트 그룹이 웹뷰 재시작에도 유지된다", async ({ page }) => {
    const errors = collectErrors(page);
    await startQuick(page, "20");

    for (let i = 0; i < 20; i += 1) {
      const opt = page.locator("#options .option").first();
      if (await opt.count()) await opt.tap();
      const next = page.getByRole("button", { name: "다음 문제" });
      if (!(await next.count()) || (await next.isDisabled())) break;
      await next.tap();
    }
    await submitGrade(page, "grade-button-m");
    await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "오답 노트 보기" }).tap();
    await expect(page.getByTestId("wrong-note")).toBeVisible();
    const before = await page.getByTestId("wrong-note-set-btn").count();
    // 전 세트에서 뽑은 20문항 중 오답이 여러 세트에 걸치면 그룹도 여럿이어야 한다.
    expect(before, "오답노트 그룹이 하나도 없다").toBeGreaterThan(0);

    await page.reload(); // 앱 프로세스 재시작 = 이력 재정제 경로
    await page.getByRole("button", { name: "ISTQB" }).tap();
    await page.getByTestId("drawer-open").tap();
    await page.getByRole("button", { name: "오답 노트" }).first().tap();
    await expect(page.getByTestId("wrong-note")).toBeVisible({ timeout: 20_000 });
    const after = await page.getByTestId("wrong-note-set-btn").count();
    expect(after, `재시작 전 ${before}개 그룹이 후 ${after}개로 뭉쳤다`).toBe(before);
    expect(errors).toEqual([]);
  });
});

test.describe("APK 기능 · 가로 모드(넓은 폭, >880px)", () => {
  // Pixel 7 가로(915px)는 데스크톱 브레이크포인트(>880)로 전환된다 — 설계 의도.
  test.use({ viewport: { width: 915, height: 412 } });
  test.beforeEach(async ({ page }) => simulateApkInsets(page));

  test("AF9 가로(915px): 데스크톱 레이아웃(사이드바 상시)이 뜨고 풀이가 가능하다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible();
    // 데스크톱 레이아웃: 모바일 상단바는 숨고 사이드바가 상시 노출된다.
    await expect(page.locator(".mobile-topbar")).toBeHidden();
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator("#examSelect")).toBeVisible();
    // 스크롤로 보기 도달 → 탭 → 피드백
    await page.locator("#options .option").first().scrollIntoViewIfNeeded();
    await page.locator("#options .option").first().tap();
    await expect(page.locator("#feedback")).toBeVisible();
  });
});

test.describe("APK 기능 · 가로 모드(좁은 기기, ≤880px)", () => {
  // 폭 800px 가로(예: 소형 폰) — 모바일 레이아웃이 유지되는 짧은 높이 케이스.
  test.use({ viewport: { width: 800, height: 360 } });
  test.beforeEach(async ({ page }) => simulateApkInsets(page));

  test("AF10 가로(800px): 상단바·하단바가 겹치지 않고 풀이가 가능하다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator(".mobile-topbar")).toBeVisible();
    await expect(page.getByTestId("drawer-open")).toBeVisible();
    // 상단바(문서 흐름)와 하단 액션바(fixed)가 화면을 다 먹지 않고 문항 영역이 남는다.
    const topbarBox = (await page.locator(".mobile-topbar").boundingBox())!;
    const actionbarBox = (await page.locator(".mobile-actionbar").boundingBox())!;
    expect(actionbarBox.y).toBeGreaterThan(topbarBox.y + topbarBox.height);
    // 스크롤로 보기 도달 → 탭 → 피드백
    await page.locator("#options .option").first().scrollIntoViewIfNeeded();
    await page.locator("#options .option").first().tap();
    await expect(page.locator("#feedback")).toBeVisible();
  });
});
