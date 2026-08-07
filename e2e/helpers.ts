import { Page, expect } from "@playwright/test";

// React E2E 공용 헬퍼 (스펙 아님 — testMatch /react-*.spec.ts/ 에 안 잡힘).

export const modeBtn = (page: Page, label: string) =>
  page.locator(".segmented button", { hasText: new RegExp(`^${label}$`) }).first();

/**
 * ── 단언 규약 ──────────────────────────────────────────────────────────────
 *
 * **`#questionStem`이 보이는 것을 상태 단언으로 쓰지 않는다.**
 *
 * 지문은 연습·시험·랜덤·오답·퀵 어느 모드에서나 보인다. 그래서 "무언가를 눌렀고
 * 지문이 보인다"는 거의 항상 참이고, 아무것도 증명하지 못한다.
 *
 * 실제로 그렇게 통과한 검사가 있었다. react-userflow의 오답 재풀이 단계는 퀵 모드에서
 * '오답 다시 풀기'를 누른 뒤 지문 가시성만 단언했는데, 당시 그 버튼은 아무 일도 하지
 * 않고 토스트만 띄웠다 — 모드가 바뀌지 않아 퀵 문항이 그대로 떠 있었고, 검사는 초록불이었다.
 * 재풀이에 진입하지 못하는 결함을 13분짜리 스위트가 통과시켰다.
 *
 * 규칙:
 *  - 지문 가시성은 **로딩 완료를 기다리는 용도**로만 쓴다(진입 헬퍼 안에서).
 *  - 상태가 바뀌었다는 주장은 **그 상태를 직접 읽는 단언**으로 한다
 *    (모드 → `expectMode`, 세트 → 셀렉트 값, 채점 → 결과 모달·점수).
 *  - "무엇을 확인하려는가"를 한 문장으로 못 쓰겠으면 그 단언은 빼는 게 낫다.
 */

/** 현재 풀이 모드가 기대와 같은지 — 지문 가시성 대신 aria-pressed를 직접 읽는다. */
export async function expectMode(page: Page, label: "연습" | "시험" | "랜덤" | "오답") {
  await expect(
    modeBtn(page, label),
    `모드가 '${label}'로 전환되지 않았다 — 지문이 보인다는 것만으로는 전환을 증명하지 못한다`,
  ).toHaveAttribute("aria-pressed", "true");
}

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

// 모바일(≤880px) 시험 진입 — 모드 세그먼트는 드로어 안에 있으므로 열고 탭한다
// (모드 변경은 드로어를 자동으로 닫음). 게이트의 "시험 시작"까지 통과.
export async function enterExamMobile(page: Page) {
  await page.getByTestId("drawer-open").tap();
  await modeBtn(page, "시험").tap();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "closed");
  const start = page.getByTestId("exam-start-btn");
  await start.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  if (await start.count()) await start.tap();
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

// 가져오기는 적용 전에 정책 확인 모달을 거친다(D2) — 파일만 넣으면 아무 일도 일어나지 않는다.
export async function confirmImport(page: Page) {
  await page.getByTestId("import-confirm").click();
}

/**
 * 한 테스트가 화면을 수십 번 갈아 끼우며 이동할 때 쓴다.
 *
 * vite preview는 스위트가 붐비거나 연속 이동이 잦으면 간헐적으로 net::ERR_ABORTED로
 * 끊는다. 조합·테마 순회처럼 "이동 자체가 검사 대상이 아닌" 테스트에서는 그 한 번의
 * 끊김이 조합 전체를 날려 버린다. 그 오류에 한해서만 한 번 다시 시도하고, 다른 실패는
 * 그대로 터뜨린다 — 무턱대고 재시도하면 진짜 로드 실패를 가려 버린다.
 */
export async function gotoStable(page: Page, url = "/") {
  try {
    await page.goto(url);
  } catch (e) {
    if (!String(e).includes("ERR_ABORTED")) throw e;
    await page.waitForTimeout(1000);
    await page.goto(url);
  }
}
