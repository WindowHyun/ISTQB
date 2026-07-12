import { Page, expect } from "@playwright/test";

// React E2E 공용 헬퍼 (스펙 아님 — testMatch /react-*.spec.ts/ 에 안 잡힘).

export const modeBtn = (page: Page, label: string) =>
  page.locator(".segmented button", { hasText: new RegExp(`^${label}$`) }).first();

export async function openProduct(page: Page, name: "ISTQB" | "CSTS") {
  await page.goto("/");
  await page.getByRole("button", { name }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
}

// 제품 선택 후 특정 세트(연습 모드)로 진입.
// 모바일/태블릿(≤880px)에서는 사이드바가 드로어(닫힘=visibility:hidden)라 세트 셀렉트가
// 숨겨져 있다 — 실사용자와 동일하게 드로어를 열고 선택한다(세트 변경은 드로어를 자동으로 닫음).
export async function openSet(page: Page, product: "ISTQB" | "CSTS", setId: string) {
  await openProduct(page, product);
  const select = page.locator("#examSelect");
  const inDrawer = !(await select.isVisible());
  if (inDrawer) {
    await page.getByTestId("drawer-open").click();
    await expect(select).toBeVisible();
  }
  await select.selectOption(setId);
  if (inDrawer) {
    // 같은 세트 재선택 등 변경 이벤트가 없으면 드로어가 열려 있을 수 있다 — Esc로 확실히 닫는다.
    await page.keyboard.press("Escape");
    await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "closed");
  }
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 15_000 });
}

// 시험 모드 진입 + 시작 게이트 통과(Phase 1). 시험 모드는 "시험 시작"을 눌러야
// 문항이 노출되므로, 대부분의 시나리오는 이 헬퍼로 진입한다(게이트 자체 검증은 전용 스펙).
export async function enterExam(page: Page) {
  await modeBtn(page, "시험").click();
  const start = page.getByTestId("exam-start-btn");
  await start.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  if (await start.count()) await start.click();
}

// 채점: 채점 버튼 클릭 후 미응답 경고 모달이 뜨면 확인까지 처리한다.
export async function submitGrade(page: Page, testid = "grade-button") {
  await page.getByTestId(testid).click();
  const confirm = page.getByTestId("confirm-grade");
  await confirm.waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
  if (await confirm.count()) await confirm.click();
}

// 채점 결과 요약 모달 닫기 — 스펙마다 반복되던 시퀀스의 공용 헬퍼.
export async function closeResult(page: Page) {
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
}

// "응시 1회 완료"(시험 진입→1문항 응답→채점→결과 닫기) — 회차 누적이 필요한
// 시나리오(통계·오답노트·타임라인)의 공용 준비 시퀀스.
export async function completeAttempt(page: Page) {
  await enterExam(page);
  await page.locator("#options .option").first().click();
  await submitGrade(page);
  await closeResult(page);
}

// 문제 번호 팔레트로 특정 문항 이동.
export async function gotoQuestion(page: Page, num: number) {
  const nav = page.locator("#questionNav button");
  const total = await nav.count();
  for (let i = 0; i < total; i++) {
    if (((await nav.nth(i).textContent()) || "").trim() === String(num)) {
      await nav.nth(i).click();
      await page.waitForTimeout(80);
      return;
    }
  }
  throw new Error("문항 번호를 찾지 못함: " + num);
}
