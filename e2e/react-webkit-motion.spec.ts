import { test, expect } from "@playwright/test";
import { openProduct } from "./helpers";

/**
 * 이 검사는 하나의 질문에 답하려고 있다: 첫 WebKit 실행에서 보기 버튼이 30초 동안
 * Playwright의 "stable" 판정을 통과하지 못한 것이, 판정 기준이 사람보다 엄격해서인가
 * 아니면 Safari에서 무언가 실제로 계속 움직여서인가.
 *
 * 후자라면 제품 결함이다 — 사용자에게는 잔떨림과 불필요한 합성 작업(배터리)으로 나타난다.
 * 그래서 동작 최소화를 끈 상태(= 기본 사용자)에서 실제 경계 상자를 프레임마다 재
 * 언제 멈추는지 측정한다.
 */
test("WebKit: 보기 버튼이 상호작용 뒤 실제로 멈추는가(잔떨림 측정)", async ({ page }) => {
  test.setTimeout(120_000);
  // webkit 프로젝트는 reducedMotion을 켜 두므로, 여기서만 기본 사용자 상태로 되돌린다.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");
  await expect(page.locator("#options .option").first()).toBeVisible({ timeout: 20_000 });

  // 마우스를 보기 위에 올려 호버·누름 전환을 실제로 발동시킨다.
  const box = (await page.locator("#options .option").first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();

  // 이후 2초 동안 프레임마다 상자를 재고, 마지막으로 '변한' 시점을 찾는다.
  const result = await page.evaluate(async () => {
    const el = document.querySelector("#options .option") as HTMLElement;
    const started = performance.now();
    let last = el.getBoundingClientRect();
    let lastChange = 0;
    let samples = 0;
    await new Promise<void>((done) => {
      const tick = () => {
        const r = el.getBoundingClientRect();
        samples += 1;
        if (Math.abs(r.width - last.width) > 0.01 || Math.abs(r.height - last.height) > 0.01
            || Math.abs(r.x - last.x) > 0.01 || Math.abs(r.y - last.y) > 0.01) {
          lastChange = performance.now() - started;
        }
        last = r;
        if (performance.now() - started < 2000) requestAnimationFrame(tick);
        else done();
      };
      requestAnimationFrame(tick);
    });
    return { lastChange: Math.round(lastChange), samples };
  });

  console.log(`· 마지막 변화 ${result.lastChange}ms · 표본 ${result.samples}프레임`);
  // 트랜지션은 0.06~0.12초다. 500ms 안에 멈추지 않으면 무언가 계속 움직이고 있다는 뜻이고,
  // 그건 판정 기준의 문제가 아니라 제품의 문제다.
  expect(result.lastChange, `상호작용 뒤 ${result.lastChange}ms까지 계속 움직였다`).toBeLessThan(500);
});
