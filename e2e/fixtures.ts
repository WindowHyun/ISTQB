import { test as base, expect } from "@playwright/test";

/**
 * 모든 E2E가 공유하는 `test`.
 *
 * 잡히지 않은 페이지 예외(`pageerror`)가 하나라도 나면 그 테스트를 실패시킨다. 종전에는 스펙
 * 27곳이 같은 수집 코드를 복붙했고, 나머지 스펙에서는 예외가 나도 단언이 통과하면 초록이었다.
 * 스펙에서 "오류가 없다"만 다시 단언하지 않는다 — 이 fixture가 한다. 스펙이 따로 수집하는 것은
 * 그 오류에 진단 맥락(조합 라벨·조작 이력·console.error)을 붙일 때뿐이다.
 *
 * - 앱 코드와 무관한 알려진 잡음은 `test.use({ ignorePageErrors: [/…/] })`로 뺀다. 패턴은 좁게 —
 *   통째로 무시하면 정작 잡아야 할 앱 오류까지 놓친다.
 * - 예외를 일부러 일으키는 테스트만 `test.use({ allowPageErrors: true })`로 끈다.
 */
export const test = base.extend<{
  allowPageErrors: boolean;
  ignorePageErrors: RegExp[];
  pageErrors: string[];
}>({
  allowPageErrors: [false, { option: true }],
  ignorePageErrors: [[], { option: true }],
  pageErrors: [
    async ({ page, allowPageErrors, ignorePageErrors }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => {
        const text = String(e);
        if (ignorePageErrors.some((re) => re.test(text))) return;
        errors.push(text);
      });
      await use(errors);
      if (!allowPageErrors) {
        expect(errors, `페이지 예외가 발생했다: ${errors.join(" | ")}`).toEqual([]);
      }
    },
    { auto: true },
  ],
});

export { expect };
export type { Page, Locator } from "@playwright/test";
