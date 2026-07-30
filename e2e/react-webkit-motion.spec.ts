import { test, expect } from "@playwright/test";
import { openProduct } from "./helpers";

/**
 * WebKit에서 긴 클릭 루프가 Playwright의 "stable" 판정을 통과하지 못하는 원인을 찾는다.
 *
 * stable 판정은 requestAnimationFrame 두 프레임 연속으로 경계 상자가 같아야 통과한다.
 * 따라서 실패 원인은 물리적으로 둘 중 하나다:
 *   (A) rAF가 돌지 않는다      — 판정이 영원히 대기한다
 *   (B) 상자가 계속 변한다      — 레이아웃이 수렴하지 않는다
 * 어느 쪽인지 재면 원인이 갈린다.
 */

type Probe = { iter: number; frames: number; changed: number; sameNode: boolean };

async function probe(page: import("@playwright/test").Page, iter: number): Promise<Probe> {
  return page.evaluate(async (i) => {
    const el = document.querySelector("#options .option") as HTMLElement | null;
    if (!el) return { iter: i, frames: -1, changed: -1, sameNode: false };
    const first = el;
    let frames = 0;
    let changed = 0;
    let last = el.getBoundingClientRect();
    const t0 = performance.now();
    await new Promise<void>((done) => {
      const tick = () => {
        frames += 1;
        const r = el.getBoundingClientRect();
        if (Math.abs(r.x - last.x) > 0.01 || Math.abs(r.y - last.y) > 0.01
            || Math.abs(r.width - last.width) > 0.01 || Math.abs(r.height - last.height) > 0.01) changed += 1;
        last = r;
        if (performance.now() - t0 < 400) requestAnimationFrame(tick);
        else done();
      };
      requestAnimationFrame(tick);
    });
    return { iter: i, frames, changed, sameNode: document.querySelector("#options .option") === first };
  }, iter);
}

/** 앱이 전혀 없는 페이지에서의 rAF 속도 — 이 브라우저·환경 자체의 기준선. */
async function baselineFps(page: import("@playwright/test").Page): Promise<number> {
  await page.goto("data:text/html,<h1>baseline</h1>");
  return page.evaluate(async () => {
    let frames = 0;
    const t0 = performance.now();
    await new Promise<void>((done) => {
      const tick = () => {
        frames += 1;
        if (performance.now() - t0 < 400) requestAnimationFrame(tick);
        else done();
      };
      requestAnimationFrame(tick);
    });
    return frames;
  });
}

/** 지금 이 화면에서 400ms 동안 도는 rAF 프레임 수와, 프레임 간 최대 간격(ms). */
async function fps(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    let frames = 0;
    let maxGap = 0;
    let prev = performance.now();
    const t0 = prev;
    await new Promise<void>((done) => {
      const tick = () => {
        const now = performance.now();
        maxGap = Math.max(maxGap, now - prev);
        prev = now;
        frames += 1;
        if (now - t0 < 400) requestAnimationFrame(tick);
        else done();
      };
      requestAnimationFrame(tick);
    });
    return { frames, maxGap: Math.round(maxGap), nodes: document.querySelectorAll("*").length };
  });
}

// 앱의 어느 단계에서 프레임이 죽는지 좁힌다. 기준선(앱 없음)과 견줘 단계마다 재면
// 원인이 있는 화면이 드러난다 — 게이트에서 이미 죽으면 앱 셸, 문항 화면에서 죽으면 렌더다.
test("WebKit 원인 규명: 어느 단계에서 프레임이 죽는가", async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("data:text/html,<h1>b</h1>");
  const blank = await fps(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const gate = await fps(page);
  await openProduct(page, "ISTQB");
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  const practice = await fps(page);
  const sel0 = page.locator("#quickSize");
  if (!(await sel0.isVisible())) await page.getByTestId("drawer-open").click();
  await sel0.selectOption("10");
  await page.getByTestId("quick-start-btn").click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  const quick = await fps(page);

  for (const [name, r] of [["빈 페이지", blank], ["게이트", gate], ["연습 문항", practice], ["퀵 진행", quick]] as const) {
    console.log(`· ${name}: ${r.frames}프레임/400ms · 최대 간격 ${r.maxGap}ms · DOM ${r.nodes}개`);
  }
  expect(blank.frames, "빈 페이지조차 느리면 환경 문제다").toBeGreaterThan(10);
});

test("WebKit 원인 규명: 긴 클릭 루프에서 rAF와 레이아웃이 어떻게 되는가", async ({ page }) => {
  test.setTimeout(180_000);
  // 기준선을 먼저 잰다. 앱 없는 페이지도 느리면 원인은 앱이 아니라 환경이다.
  const base = await baselineFps(page);
  console.log(`· 기준선(앱 없음): rAF ${base}프레임/400ms`);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");

  // 퀵 10문항 — 실패한 스펙과 같은 조건.
  const sel = page.locator("#quickSize");
  if (!(await sel.isVisible())) await page.getByTestId("drawer-open").click();
  await sel.selectOption("10");
  await page.getByTestId("quick-start-btn").click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

  const probes: Probe[] = [];
  for (let i = 0; i < 10; i += 1) {
    probes.push(await probe(page, i));
    // Playwright의 actionability를 우회해 루프를 진행시킨다 — 여기서 재려는 것은
    // 클릭 가능 여부가 아니라 클릭 이후 페이지가 어떤 상태가 되는가다.
    await page.evaluate(() => {
      (document.querySelector("#options .option") as HTMLElement | null)?.click();
      (document.querySelector("#nextBtn") as HTMLElement | null)?.click();
    });
    await page.waitForTimeout(120);
  }

  for (const p of probes) {
    console.log(`· iter ${p.iter}: rAF ${p.frames}프레임/400ms · 상자 변화 ${p.changed}회 · 같은 노드 ${p.sameNode}`);
  }
  const worst = Math.min(...probes.map((p) => p.frames));
  const unstable = probes.filter((p) => p.changed > 2);
  console.log(`\n=== 기준선 ${base} · 앱 최저 ${worst} · 레이아웃 미수렴 ${unstable.length}회 ===`);

  // (B) 상자가 400ms 내내 계속 변하면 두 프레임 연속 동일이 성립하지 않는다.
  // 이건 브라우저와 무관하게 앱의 문제이므로 절대 기준으로 본다.
  expect(unstable.map((p) => p.iter), `레이아웃이 수렴하지 않은 반복: ${JSON.stringify(unstable)}`).toEqual([]);

  // (A) rAF 기아 — 절대 프레임 수로 재면 브라우저·환경 차이를 앱 탓으로 돌리게 된다.
  // 앱 없는 페이지의 기준선과 견줘, 앱이 프레임을 굶기는지만 본다.
  // 기준선의 절반 아래로 떨어지면 앱이 메인 스레드를 붙들고 있다는 뜻이다.
  expect(worst, `기준선 ${base}프레임 대비 앱에서 ${worst}프레임 — 앱이 메인 스레드를 붙들고 있다`)
    .toBeGreaterThanOrEqual(Math.floor(base / 2));
});
