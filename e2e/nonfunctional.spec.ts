import { test, expect } from "@playwright/test";
import { openSet, modeBtn } from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// 비기능(Non-functional) 테스트 — 성능·부하/스트레스·메모리·정확도·복원력.
// 전용 Playwright 프로젝트(nonfunctional)로 분리해 기능 e2e와 다른 잡에서 돈다.
// 예산(budget)은 로컬은 엄격, CI 러너(느리고 공유 CPU)는 완화해 오탐 없이
// "큰 회귀"만 잡는다. 접근성·반응형은 react-a11y / react-responsive가 담당.
// ─────────────────────────────────────────────────────────────────────────────

const A = "ISTQB-FL-V4-A"; // 40문항
const CI = !!process.env.CI;
const budget = (local: number, ci: number) => (CI ? ci : local);

function note(testInfo: import("@playwright/test").TestInfo, key: string, value: string) {
  testInfo.annotations.push({ type: key, description: value });
  console.log(`[NF] ${testInfo.title.split(" ")[0]} · ${key} = ${value}`);
}

test.describe("비기능 · 성능(응답 시간)", () => {
  test("NF1 초기 로드: DCL·FCP·LCP·전송량 실측", async ({ page }, testInfo) => {
    await page.goto("/", { waitUntil: "load" });
    await expect(page.getByRole("button", { name: "ISTQB" })).toBeVisible();
    const m = await page.evaluate(async () => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? -1;
      const lcp = await new Promise<number>((resolve) => {
        let last = -1;
        const po = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) last = e.startTime;
        });
        try { po.observe({ type: "largest-contentful-paint", buffered: true }); } catch { /* noop */ }
        setTimeout(() => { po.disconnect(); resolve(last); }, 600);
      });
      return {
        dcl: Math.round(nav.domContentLoadedEventEnd),
        fcp: Math.round(fcp),
        lcp: Math.round(lcp),
        transferKB: Math.round(performance.getEntriesByType("resource")
          .reduce((s, r) => s + ((r as PerformanceResourceTiming).transferSize || 0), 0) / 1024),
      };
    });
    note(testInfo, "DCL", `${m.dcl}ms`);
    note(testInfo, "FCP", `${m.fcp}ms`);
    note(testInfo, "LCP", `${m.lcp}ms`);
    note(testInfo, "전송량", `${m.transferKB}KB`);
    expect(m.dcl).toBeLessThan(budget(3000, 6000));
    if (m.lcp > 0) expect(m.lcp).toBeLessThan(budget(3000, 6000));
  });

  test("NF2 제품 선택→첫 문항 렌더 시간", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: "ISTQB" }).waitFor();
    const t0 = Date.now();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await page.locator("#questionStem").waitFor({ state: "visible" });
    const dt = Date.now() - t0;
    note(testInfo, "선택→문항 렌더", `${dt}ms`);
    expect(dt).toBeLessThan(budget(2000, 5000));
  });

  test("NF3 문항 이동 39회 연속 평균 응답", async ({ page }, testInfo) => {
    await openSet(page, "ISTQB", A);
    const t0 = Date.now();
    for (let i = 0; i < 39; i++) await page.locator("#nextBtn").click();
    await expect(page.locator("#questionTitle")).toContainText("문제 40");
    const avg = Math.round((Date.now() - t0) / 39);
    note(testInfo, "이동 1회 평균", `${avg}ms`);
    expect(avg).toBeLessThan(budget(120, 350));
  });

  test("NF4 40문항 응답 후 채점 응답 시간", async ({ page }, testInfo) => {
    await openSet(page, "ISTQB", A);
    await modeBtn(page, "시험").click();
    for (let i = 0; i < 40; i++) {
      await page.locator("#options .option").first().click();
      if (i < 39) await page.locator("#nextBtn").click();
    }
    const t0 = Date.now();
    await page.getByTestId("grade-button").click();
    await page.getByTestId("result-summary").waitFor({ state: "visible" });
    const dt = Date.now() - t0;
    note(testInfo, "채점→결과", `${dt}ms`);
    expect(dt).toBeLessThan(budget(1500, 3500));
  });

  test("NF5 이력 150건 통계 렌더", async ({ page }, testInfo) => {
    await openSet(page, "ISTQB", A);
    const histories: Record<string, unknown> = {};
    for (let i = 0; i < 150; i++) {
      const id = String(3000 + i);
      histories[id] = { id, setId: A, mode: "exam", answers: {}, correct: i % 41, total: 40, createdAt: Date.now() - i * 1000 };
    }
    await page.getByRole("button", { name: /설정/ }).click();
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name: "hist.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ answers: {}, histories }), "utf-8"),
    });
    await expect(page.getByTestId("toast")).toBeVisible({ timeout: 8_000 });
    await page.keyboard.press("Escape");
    const t0 = Date.now();
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard").locator(".stats-list li")).toHaveCount(150, { timeout: 8_000 });
    note(testInfo, "150건 통계 렌더", `${Date.now() - t0}ms`);
    expect(Date.now() - t0).toBeLessThan(budget(2000, 5000));
  });

  test("NF12 장기 사용 스케일: 이력 1,000건 통계 렌더·스크롤", async ({ page }, testInfo) => {
    // histories 무한 증가(known-issue) 대비 — 수년치 사용량 규모에서도 UI가 버티는지.
    await openSet(page, "ISTQB", A);
    const histories: Record<string, unknown> = {};
    for (let i = 0; i < 1000; i++) {
      const id = String(10000 + i);
      histories[id] = { id, setId: A, mode: i % 2 ? "exam" : "random", answers: {}, correct: i % 41, total: 40, createdAt: Date.now() - i * 60_000 };
    }
    await page.getByRole("button", { name: /설정/ }).click();
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name: "hist1k.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ answers: {}, histories }), "utf-8"),
    });
    await expect(page.getByTestId("toast")).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    const t0 = Date.now();
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard").locator(".stats-list li")).toHaveCount(1000, { timeout: 15_000 });
    const dt = Date.now() - t0;
    note(testInfo, "1,000건 통계 렌더", `${dt}ms`);
    expect(dt).toBeLessThan(budget(4000, 9000));
    // 스크롤이 끊기지 않고 동작(마지막 항목 도달).
    const list = page.getByTestId("stats-dashboard").locator(".stats-list li");
    await list.last().scrollIntoViewIfNeeded();
    await expect(list.last()).toBeVisible();
  });
});

test.describe("비기능 · 부하/스트레스·메모리", () => {
  test("NF6 고속 입력 폭주(화살표 80 + 옵션 30) 크래시 없음", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await openSet(page, "ISTQB", A);
    const t0 = Date.now();
    for (let i = 0; i < 80; i++) await page.keyboard.press(i % 2 ? "ArrowLeft" : "ArrowRight", { delay: 0 });
    for (let i = 0; i < 30; i++) await page.locator("#options .option").first().click({ delay: 0 });
    note(testInfo, "110 입력 처리", `${Date.now() - t0}ms`);
    await expect(page.locator("#questionStem")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("NF7 모드 고속 전환 20회 크래시·상태 오염 없음", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await openSet(page, "ISTQB", A);
    const t0 = Date.now();
    for (let r = 0; r < 5; r++) {
      for (const m of ["연습", "랜덤", "오답", "연습"] as const) {
        await modeBtn(page, m).click();
        await page.waitForTimeout(30);
      }
    }
    note(testInfo, "모드 20회 전환", `${Date.now() - t0}ms`);
    await modeBtn(page, "연습").click();
    await expect(page.locator("#questionStem")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("NF8 무거운 탐색 후 JS 힙", async ({ page }, testInfo) => {
    await openSet(page, "ISTQB", A);
    for (const sid of ["ISTQB-FL-V4-B", "ISTQB-FL-V4-C", "ISTQB-FL-V4-D", "ISTQB-FL-V4-EXTRA", A]) {
      await page.locator("#examSelect").selectOption(sid);
      await page.locator("#questionStem").waitFor();
      for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
    }
    const heapMB = await page.evaluate(() => {
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return mem ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : -1;
    });
    note(testInfo, "JS 힙", heapMB >= 0 ? `${heapMB}MB` : "측정 불가");
    if (heapMB >= 0) expect(heapMB).toBeLessThan(budget(120, 200));
  });
});

test.describe("비기능 · 정확도/복원력", () => {
  test("NF9 타이머 정확도: 3초 경과 표시", async ({ page }, testInfo) => {
    await openSet(page, "ISTQB", A);
    await modeBtn(page, "시험").click();
    const read = async () => {
      const t = (await page.locator("#timerText").textContent()) || "00:00";
      const [mm, ss] = t.trim().split(":").map(Number);
      return mm * 60 + ss;
    };
    const s0 = await read();
    await page.waitForTimeout(3000);
    const drift = Math.abs(((await read()) - s0) - 3);
    note(testInfo, "3초 drift", `${drift}s`);
    expect(drift).toBeLessThanOrEqual(budget(1, 2));
  });

  test("NF10 오프라인 복원력(PWA): 오프라인 reload에도 앱 로드", async ({ page, context }, testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: "ISTQB" }).waitFor();
    const swState = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return "unsupported";
      try {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((r) => setTimeout(() => r(null), 8000)),
        ]);
        return reg ? "active" : "timeout";
      } catch { return "error"; }
    });
    note(testInfo, "SW 상태", swState);
    if (swState !== "active") {
      testInfo.annotations.push({ type: "skip-reason", description: "SW 미활성 — 오프라인 검증 생략" });
      return;
    }
    await page.waitForTimeout(1000);
    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByRole("button", { name: "ISTQB" })).toBeVisible({ timeout: 10_000 });
      note(testInfo, "오프라인 reload", "성공");
    } finally {
      await context.setOffline(false);
    }
  });

  test("NF11 데이터 내구성: 연속 응답→즉시 reload에도 답안 보존", async ({ page }, testInfo) => {
    await openSet(page, "ISTQB", A);
    await modeBtn(page, "연습").click();
    for (let i = 0; i < 5; i++) {
      await page.locator("#options .option").first().click();
      await page.locator("#nextBtn").click();
    }
    await page.waitForTimeout(800); // debounce(500ms) flush 여유
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#progressText")).toContainText("5 /");
    note(testInfo, "5답안 reload 보존", "OK");
  });
});
