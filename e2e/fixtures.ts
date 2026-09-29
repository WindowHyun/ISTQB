import { test as base, expect } from "@playwright/test";

/**
 * 모든 E2E가 공유하는 `test`.
 *
 * 잡히지 않은 페이지 예외(`pageerror`)가 하나라도 나면 그 테스트를 실패시킨다. 종전에는 스펙
 * 27곳이 같은 수집 코드를 복붙했고, 나머지 스펙에서는 예외가 나도 단언이 통과하면 초록이었다.
 *
 * 예외를 일부러 일으키는 테스트만 `test.use({ allowPageErrors: true })`로 끈다.
 */
export const test = base.extend<{ allowPageErrors: boolean; pageErrors: string[] }>({
  allowPageErrors: [false, { option: true }],
  pageErrors: [
    async ({ page, allowPageErrors }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
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
