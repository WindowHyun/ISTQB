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

test("WebKit 원인 규명: 긴 클릭 루프에서 rAF와 레이아웃이 어떻게 되는가", async ({ page }) => {
  test.setTimeout(180_000);
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
  const starved = probes.filter((p) => p.frames >= 0 && p.frames < 5);
  const unstable = probes.filter((p) => p.changed > 2);
  console.log(`\n=== rAF 기아 ${starved.length}회 · 레이아웃 미수렴 ${unstable.length}회 ===`);

  // (A) rAF가 400ms에 5프레임도 못 돌면 판정은 영원히 대기한다.
  expect(starved.map((p) => p.iter), `rAF가 멈춘 반복: ${JSON.stringify(starved)}`).toEqual([]);
  // (B) 상자가 400ms 내내 계속 변하면 두 프레임 연속 동일이 성립하지 않는다.
  expect(unstable.map((p) => p.iter), `레이아웃이 수렴하지 않은 반복: ${JSON.stringify(unstable)}`).toEqual([]);
});
