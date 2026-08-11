import { test, expect } from "@playwright/test";
import { enterExam, modeBtn, openSet } from "./helpers";

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
    await enterExam(page);
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
    // 가져오기는 적용 전에 정책 확인을 거친다(D2).
    await page.getByTestId("import-confirm").click();
    await expect(page.getByTestId("toast")).toBeVisible({ timeout: 8_000 });
    await page.keyboard.press("Escape");
    const t0 = Date.now();
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard").locator(".stl-rounds li")).toHaveCount(150, { timeout: 8_000 });
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
    // 가져오기는 적용 전에 정책 확인을 거친다(D2).
    await page.getByTestId("import-confirm").click();
    await expect(page.getByTestId("toast")).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    const t0 = Date.now();
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard").locator(".stl-rounds li")).toHaveCount(1000, { timeout: 15_000 });
    const dt = Date.now() - t0;
    note(testInfo, "1,000건 통계 렌더", `${dt}ms`);
    expect(dt).toBeLessThan(budget(4000, 9000));
    // 스크롤이 끊기지 않고 동작(마지막 항목 도달).
    const list = page.getByTestId("stats-dashboard").locator(".stl-rounds li");
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
      for (const m of ["연습", "시험", "오답", "연습"] as const) {
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
    await enterExam(page);
    // 표기는 mm:ss 또는 h:mm:ss(1시간 이상) 두 형태다 — 자리수와 무관하게 초로 환산한다.
    const read = async () => {
      const t = (await page.locator("#timerText").textContent()) || "00:00";
      return t.trim().split(":").map(Number).reduce((acc, v) => acc * 60 + v, 0);
    };
    const s0 = await read();
    await page.waitForTimeout(3000);
    // 시험 모드는 제한시간 카운트다운이므로 3초 '감소'해야 한다(연습 모드의 경과 증가와 대칭).
    const drift = Math.abs((s0 - (await read())) - 3);
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

  // NF10은 "오프라인에서 앱 껍데기가 뜨는가"까지만 본다. 퀵은 이 앱에서 유일하게
  // 제품 전 세트(ISTQB 5개 / CSTS 7개)의 문항 JSON을 한꺼번에 읽는 모드라, 세트 하나만
  // 캐시돼 있으면 나머지를 못 읽고 빈 화면이 된다. 캐시 대상이 precache가 아니라 런타임
  // 캐시로 새면 "온라인에서 한 번 들어가 본 세트만" 나오는 식으로 조용히 반쪽이 된다.
  // 그래서 오프라인 전환 전에 어떤 세트에도 들어가지 않는다 — precache만으로 되는지 본다.
  test("NF13 오프라인 복원력(PWA): 세트를 한 번도 안 열고도 퀵이 출제된다", async ({ page, context }, testInfo) => {
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
    await page.waitForTimeout(1500); // precache 적재 여유

    const failed: string[] = [];
    page.on("requestfailed", (r) => { if (/\.json$/.test(r.url())) failed.push(r.url()); });

    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: "domcontentloaded" });

      // 오프라인이 실제로 걸렸는지 먼저 증명한다. setOffline이 무력화되면 아래 검증이
      // 전부 온라인 통신으로 통과해 버려, 캐시가 비어도 초록으로 남는 테스트가 된다.
      // precache 대상이 아닌 URL은 반드시 실패해야 한다.
      const probe = await page.evaluate(async () => {
        try { await fetch(`/__offline_probe__?t=${Date.now()}`, { cache: "no-store" }); return "reached"; }
        catch { return "blocked"; }
      });
      expect(probe, "setOffline이 걸리지 않았다 — 이 테스트는 무력하다").toBe("blocked");

      await page.getByRole("button", { name: "ISTQB" }).click();
      await page.getByTestId("quick-start-btn").click();
      await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
      // 풀이 자체가 되는지까지 본다 — 지문만 뜨고 답할 자리가 없으면 데이터가 반쪽으로 온 것이다.
      // 퀵은 유형을 가리지 않고 서답형도 그대로 내므로 보기 버튼만 기다리면 뽑기에 따라 헛되이 죽는다.
      await expect(async () => {
        const answerable = await page.locator("#options .option, .short-answer-input").count();
        expect(answerable, "지문은 떴는데 답할 자리가 없다").toBeGreaterThan(0);
      }).toPass({ timeout: 10_000 });
      await expect(page.getByTestId("quick-scoreboard")).toBeVisible();

      // 오프라인에서 만들어진 출제 순서가 실제로 여러 세트에서 왔는지 — 한 세트만 캐시돼도
      // 목록은 채워지므로(같은 세트 문항으로) 개수만으로는 못 잡는다.
      // UI 상태 키는 제품별로 갈리므로 이름을 박지 않고 *-ui-state를 훑는다.
      // 저장은 debounce(500ms)라 poll로 기다린다.
      const sourceSetCount = async () => page.evaluate(() => {
        for (const k of Object.keys(localStorage)) {
          if (!k.endsWith("-ui-state")) continue;
          try {
            const items = (JSON.parse(localStorage.getItem(k) ?? "{}").quickDraw?.items ?? []) as { setId?: string }[];
            if (items.length) return new Set(items.map((i) => i.setId).filter(Boolean)).size;
          } catch { /* 다음 키 */ }
        }
        return 0;
      });
      await expect.poll(sourceSetCount, { timeout: 10_000 }).toBeGreaterThan(1);
      note(testInfo, "출처 세트 수", `${await sourceSetCount()}`);
      note(testInfo, "실패한 JSON 요청", `${failed.length}`);
      expect(failed, `오프라인에서 문항 JSON을 못 읽음:\n${failed.join("\n")}`).toEqual([]);
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
