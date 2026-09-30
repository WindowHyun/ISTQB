import { readFileSync } from "fs";
import { expect, test } from "./fixtures";
import { enterExam, modeBtn, openProduct, openSet } from "./helpers";

// 영속성·백업 — 새로고침 복원, 제품 격리, 저장 불가 환경, 내보내기/가져오기.
// 백업 정제 규칙(타입·필드·버전)은 유닛(storage.import·storage.sanitize)이 정본이고,
// 여기서는 그 규칙이 앱에 배선됐는지만 본다.

// ── react-edge-persist.spec.ts에서 합침 ────────────────────────────────────────
// 엣지: 영속성·복원·가져오기/내보내기·테마/콘솔 지속.
test.describe("엣지-영속성", () => {
  test("새로고침하면 항상 제품 선택 게이트로 돌아온다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.reload();
    await expect(page.getByRole("button", { name: "ISTQB" })).toBeVisible({ timeout: 15_000 });
  });

  test("답 선택 후 새로고침→재선택 시 진행 수가 복원된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await page.locator("#options .option").first().click();
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#progressText")).toContainText("1 /");
  });

  test("세트를 바꾼 뒤 새로고침해도 같은 세트가 유지된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-B");
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#examSelect")).toHaveValue("ISTQB-FL-V4-B");
  });
  test("다크 테마는 새로고침 후에도 유지된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("dialog", { name: "설정" }).getByRole("button", { name: "다크" }).click();
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.theme)).toBe("dark");
  });

  test("글자 크기(작게)는 새로고침 후에도 유지된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("button", { name: "작게" }).click();
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.qfont)).toBe("small");
  });

  test("ISTQB와 CSTS 답안은 제품별로 격리된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    await page.locator("#options .option").first().click();
    // 처음 화면으로 → CSTS (게이트로 나가는 순간 대기 중인 저장을 flushPersist가 내보낸다)
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("button", { name: /처음 화면/ }).click();
    await page.getByRole("button", { name: "CSTS" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#progressText")).toContainText("0 /");
  });

  test("잘못된 JSON 가져오기는 실패 토스트를 띄운다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{broken", "utf-8"),
    });
    // 가져오기는 적용 전에 정책 확인을 거친다(D2).
    await page.getByTestId("import-confirm").click();
    // 오류 토스트로 뜨고, 무엇이 문제인지 알려준다 — 종전에는 어떤 실패든 같은 문구라
    // 사용자가 파일을 고쳐야 하는지 앱을 고쳐야 하는지 알 수 없었다.
    const toast = page.getByTestId("toast");
    await expect(toast).toBeVisible({ timeout: 5_000 });
    await expect(toast).toHaveClass(/toast-error/);
    await expect(toast).toContainText("해석하지 못했");
  });

  test("빈 객체 JSON 가져오기는 크래시 없이 처리된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name: "empty.json", mimeType: "application/json", buffer: Buffer.from("{}", "utf-8"),
    });
    // 가져오기는 적용 전에 정책 확인을 거친다(D2).
    await page.getByTestId("import-confirm").click();
    await expect(page.getByTestId("toast")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".workspace")).toBeVisible();
  });
  test("'선택 답안 초기화'가 2단계 확인 후 동작하고 완료 토스트를 띄운다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.locator("#options .option").first().click();
    expect(await page.locator("#questionNav button.answered").count()).toBeGreaterThanOrEqual(1);
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("button", { name: "현재 모드 답안 초기화" }).click();
    await page.getByTestId("confirm-reset-yes").click();
    // 완료 피드백 토스트 — 없으면 삭제가 됐는지 사용자가 알 수 없다(회귀 고정).
    await expect(page.getByTestId("toast")).toContainText("초기화했습니다");
    await expect(page.locator("#questionNav button.answered")).toHaveCount(0);
  });

  test("?debug 플래그는 새로고침 후에도 유지된다", async ({ page }) => {
    await page.goto("/?debug");
    await expect(page.getByTestId("debug-fab")).toBeVisible({ timeout: 8_000 });
    await page.goto("/");
    await expect(page.getByTestId("debug-fab")).toBeVisible({ timeout: 8_000 });
  });

  test("localStorage 저장이 막힌 환경에서도 제품 선택·문항 진입이 된다", async ({ page }) => {
    // 프라이빗 모드·쿼터 초과·저장 비활성 등에서 setItem이 예외를 던지는 상황을 모사.
    await page.addInitScript(() => {
      const proto = Object.getPrototypeOf(window.localStorage);
      proto.setItem = () => { throw new Error("저장 불가(테스트 모사)"); };
    });
    await page.goto("/");
    await page.getByRole("button", { name: "ISTQB" }).click();
    // handleProductSelect의 setItem이 앱 진입을 막지 않아야 한다(안전 래퍼).
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    // 답 선택도 크래시 없이 동작(저장은 조용히 실패).
    await page.locator("#options .option").first().click();
    await expect(page.locator("#questionNav button.answered")).toHaveCount(1);
  });

  test("localStorage 저장이 막혀도 테마·글자 크기 설정이 크래시 없이 동작한다", async ({ page }) => {
    await page.addInitScript(() => {
      const proto = Object.getPrototypeOf(window.localStorage);
      proto.setItem = () => { throw new Error("저장 불가(테스트 모사)"); };
    });
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await page.getByRole("dialog", { name: "설정" }).getByRole("button", { name: "다크" }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.theme)).toBe("dark");
    await page.getByRole("button", { name: "작게" }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.qfont)).toBe("small");
  });

  test("여러 문항 응답 후 새로고침→재선택 시 진행 수가 복원된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await modeBtn(page, "연습").click();
    for (let i = 0; i < 3; i++) {
      await page.locator("#options .option").first().click();
      await page.locator("#nextBtn").click();
    }
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#progressText")).toContainText("3 /");
  });
});

// ── react-persistence.spec.ts에서 합침 ────────────────────────────────────────
// 영속성(새로고침 복원) + 기록 내보내기/가져오기.
// 진입 시 항상 제품 선택 게이트가 뜨므로(#5), 재선택 시 저장된 답안이 복원된다.
test.describe("영속성/백업", () => {

  test("기록 내보내기 시 JSON 파일이 다운로드된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 8_000 }),
      page.getByRole("button", { name: "기록 내보내기" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });

  test("내보내기→초기화→가져오기 라운드트립으로 답안이 복원된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await page.locator("#options .option").first().click();
    // 내보내기는 저장소가 아니라 메모리 상태를 읽는다 — 저장을 기다릴 필요가 없다.
    // 설정 모달을 한 번만 열고 export → 초기화 → import 를 모달 안에서 처리.
    await page.getByRole("button", { name: /설정/ }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 8_000 }),
      page.getByRole("button", { name: "기록 내보내기" }).click(),
    ]);
    const filePath = await download.path();
    await page.getByRole("button", { name: "현재 모드 답안 초기화" }).click();
    await page.getByTestId("confirm-reset-yes").click();
    await expect(page.locator("#questionNav button.answered")).toHaveCount(0);
    await page.locator('input[type="file"][accept=".json"]').setInputFiles(filePath as string);
    // 가져오기는 적용 전에 정책 확인을 거친다(D2).
    await page.getByTestId("import-confirm").click();
    await expect.poll(() => page.locator("#questionNav button.answered").count()).toBeGreaterThanOrEqual(1);
  });

  test("시험 모드 답안도 새로고침 후 복원된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("resume-keep").click(); // 이어풀기 선택(답안 유지)
    await expect.poll(() => page.locator("#questionNav button.answered").count()).toBeGreaterThanOrEqual(1);
  });
});

// ── react-edge-import.spec.ts에서 합침 ────────────────────────────────────────
const SET = "ISTQB-FL-V4-A";
const qids: string[] = JSON.parse(
  readFileSync("public/data/istqb/sample-a.json", "utf8"),
).questions.map((q: { id: string }) => q.id);
const key = (qid: string) => `${SET}-practice-${qid}`;
const baseState = { mode: "practice", setId: SET, index: 0, elapsedSeconds: 0, reviewIds: {}, navCollapsed: false };

async function importBackup(page: import("@playwright/test").Page, backup: unknown) {
  await page.getByRole("button", { name: /설정/ }).click();
  await page.locator('input[type="file"][accept=".json"]').setInputFiles({
    name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup), "utf-8"),
  });
  // 가져오기는 적용 전에 정책 확인을 거친다(D2).
  await page.getByTestId("import-confirm").click();
  await expect(page.getByTestId("toast")).toBeVisible({ timeout: 8_000 });
  await page.keyboard.press("Escape"); // 설정 모달 닫기
}

// 엣지: 대용량/비정상 import 견고성.
test.describe("엣지-대용량 import", () => {
  test("40문항 유효 + 600개 junk 답안 import 후 진행이 복원된다", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    const answers: Record<string, string[]> = {};
    for (const id of qids) answers[key(id)] = ["a"];
    for (let i = 0; i < 600; i++) answers[`junk-key-${i}`] = ["x"];
    await importBackup(page, { state: baseState, answers, histories: {} });
    await expect.poll(() => page.locator("#questionNav button.answered").count(), { timeout: 8_000 }).toBe(40);
  });

  test("대용량 이력(150건) import 후 학습 통계에 누적된다", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    const histories: Record<string, unknown> = {};
    for (let i = 0; i < 150; i++) {
      const id = String(2000 + i);
      histories[id] = { id, setId: SET, mode: "exam", answers: {}, correct: i % 41, total: 40, createdAt: Date.now() - i * 1000 };
    }
    await importBackup(page, { state: baseState, answers: {}, histories });
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard").locator(".stl-rounds li")).toHaveCount(150, { timeout: 8_000 });
  });

  test("매우 긴 문자열(5만 자) 답안도 크래시 없이 처리된다", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    const answers: Record<string, string[]> = { [key(qids[0])]: ["z".repeat(50000)] };
    await importBackup(page, { state: baseState, answers, histories: {} });
    await expect(page.locator(".workspace")).toBeVisible();
    await expect.poll(() => page.locator("#questionNav button.answered").count(), { timeout: 8_000 }).toBeGreaterThanOrEqual(1);
  });
});
