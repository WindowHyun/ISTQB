import { test, expect, Page } from "@playwright/test";
import { enterExamMobile, openSet } from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// APK(WebView) 비기능 테스트 — 모바일 디바이스 프로파일(Pixel 7 + WebView UA)에서
// 성능·스트레스·메모리·복원력을 측정한다. 데스크톱 비기능 스위트(nonfunctional.spec.ts)와
// 같은 예산 철학: 로컬은 엄격, CI는 완화해 "큰 회귀"만 잡는다.
// ─────────────────────────────────────────────────────────────────────────────

const A = "ISTQB-FL-V4-A";
const CI = !!process.env.CI;
const budget = (local: number, ci: number) => (CI ? ci : local);

const SAFE_TOP = 28;
const SAFE_BOTTOM = 24;

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

function note(testInfo: import("@playwright/test").TestInfo, key: string, value: string) {
  testInfo.annotations.push({ type: key, description: value });
  console.log(`[NF-APK] ${testInfo.title.split(" ")[0]} · ${key} = ${value}`);
}

test.beforeEach(async ({ page }) => simulateApkInsets(page));

test.describe("APK 비기능 · 성능", () => {
  test("ANF1 초기 로드(모바일): DCL·FCP·전송량 실측", async ({ page }, testInfo) => {
    await page.goto("/", { waitUntil: "load" });
    await expect(page.getByRole("button", { name: "ISTQB" })).toBeVisible();
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? -1;
      return {
        dcl: Math.round(nav.domContentLoadedEventEnd),
        fcp: Math.round(fcp),
        transferKB: Math.round(performance.getEntriesByType("resource")
          .reduce((s, r) => s + ((r as PerformanceResourceTiming).transferSize || 0), 0) / 1024),
      };
    });
    note(testInfo, "DCL", `${m.dcl}ms`);
    note(testInfo, "FCP", `${m.fcp}ms`);
    note(testInfo, "전송량", `${m.transferKB}KB`);
    expect(m.dcl).toBeLessThan(budget(3000, 6000));
  });

  test("ANF2 제품 선택→첫 문항 렌더(모바일 터치)", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: "ISTQB" }).waitFor();
    const t0 = Date.now();
    await page.getByRole("button", { name: "ISTQB" }).tap();
    await page.locator("#questionStem").waitFor({ state: "visible" });
    const dt = Date.now() - t0;
    note(testInfo, "선택→문항 렌더", `${dt}ms`);
    expect(dt).toBeLessThan(budget(2000, 5000));
  });

  test("ANF3 하단 액션바로 39회 연속 이동 평균 응답", async ({ page }, testInfo) => {
    await openSet(page, "ISTQB", A);
    const next = page.getByRole("button", { name: "다음 문제" });
    const t0 = Date.now();
    for (let i = 0; i < 39; i++) await next.tap();
    await expect(page.locator("#questionTitle")).toContainText("문제 40");
    const avg = Math.round((Date.now() - t0) / 39);
    note(testInfo, "이동 1회 평균", `${avg}ms`);
    expect(avg).toBeLessThan(budget(150, 400));
  });
});

test.describe("APK 비기능 · 스트레스/복원력", () => {
  test("ANF4 드로어 개폐 10회 반복 — JS 오류 0, 상태 정상", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openSet(page, "ISTQB", A);
    const t0 = Date.now();
    for (let i = 0; i < 10; i++) {
      await page.getByTestId("drawer-open").tap();
      await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "open");
      await page.keyboard.press("Escape");
      await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "closed");
    }
    note(testInfo, "개폐 10회", `${Date.now() - t0}ms`);
    await expect(page.locator("#questionStem")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("ANF5 보기 연타 30회(중복 탭 폭주) — 진행/피드백 일관성 유지", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openSet(page, "ISTQB", A);
    const option = page.locator("#options .option").first();
    for (let i = 0; i < 30; i++) await option.tap();
    await expect(page.locator("#feedback")).toBeVisible();
    await expect(page.locator(".mtb-meta").first()).toContainText("1 / 40");
    expect(errors).toEqual([]);
  });

  test("ANF6 시험 40문항 완주 후 채점 응답 시간(모바일)", async ({ page }, testInfo) => {
    await openSet(page, "ISTQB", A);
    await enterExamMobile(page);
    const next = page.getByRole("button", { name: "다음 문제" });
    for (let i = 0; i < 40; i++) {
      await page.locator("#options .option").first().tap();
      if (i < 39) await next.tap();
    }
    // 전 문항 응답 완료 → 미응답 경고 모달 없이 곧장 채점된다(순수 채점 시간 측정).
    const t0 = Date.now();
    await page.getByTestId("grade-button-m").tap();
    await expect(page.getByTestId("result-summary")).toBeVisible();
    const dt = Date.now() - t0;
    note(testInfo, "채점 응답", `${dt}ms`);
    expect(dt).toBeLessThan(budget(1500, 4000));
  });

  test("ANF7 재시작 5회 반복 — 매번 상태 복원(저장 내구성)", async ({ page }, testInfo) => {
    await openSet(page, "ISTQB", A);
    await page.locator("#options .option").first().tap();
    await expect(page.locator("#feedback")).toBeVisible();
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) {
      await page.reload();
      await page.getByRole("button", { name: "ISTQB" }).click();
      await expect(page.locator("#questionStem")).toBeVisible();
      await expect(page.locator(".mtb-meta").first()).toContainText("1 / 40");
    }
    note(testInfo, "재시작 5회", `${Date.now() - t0}ms`);
  });
});

test.describe("APK 비기능 · 메모리/DOM", () => {
  test("ANF8 40문항 순회 후 DOM 노드·JS 힙 예산", async ({ page }, testInfo) => {
    await openSet(page, "ISTQB", A);
    const next = page.getByRole("button", { name: "다음 문제" });
    for (let i = 0; i < 39; i++) await next.tap();
    await expect(page.locator("#questionTitle")).toContainText("문제 40");
    const m = await page.evaluate(() => ({
      nodes: document.getElementsByTagName("*").length,
      heapMB: (performance as unknown as { memory?: { usedJSHeapSize: number } })
        .memory ? Math.round(((performance as unknown as { memory: { usedJSHeapSize: number } })
        .memory.usedJSHeapSize) / 1048576) : -1,
    }));
    note(testInfo, "DOM 노드", String(m.nodes));
    note(testInfo, "JS 힙", m.heapMB >= 0 ? `${m.heapMB}MB` : "미지원");
    // 문항 전환이 노드를 누적(leak)하지 않는지 — 단일 화면 앱 기준 여유 예산.
    expect(m.nodes).toBeLessThan(3000);
    if (m.heapMB >= 0) expect(m.heapMB).toBeLessThan(budget(150, 250));
  });
});
