import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { openSet } from "./helpers";

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

  test("비정상 타입이 섞인 답안은 정제되어 유효한 것만 복원된다(크래시 없음)", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    const answers: Record<string, unknown> = {
      [key(qids[0])]: ["a"],          // 유효
      [key(qids[1])]: 123,            // 숫자 → 무시
      [key(qids[2])]: [42, "b"],      // 숫자 섞임 → "b"만 유지
      [key(qids[3])]: { x: 1 },       // 객체 → 무시
      [key(qids[4])]: [],             // 빈 배열 → 무시
    };
    await importBackup(page, { state: baseState, answers, histories: {} });
    await expect(page.locator(".workspace")).toBeVisible();
    await expect.poll(() => page.locator("#questionNav button.answered").count(), { timeout: 8_000 }).toBe(2);
  });

  test("알 수 없는 필드가 섞인 백업도 정상 복원된다", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    const backup = {
      state: { ...baseState, bogus: "ignored", nested: { a: 1 } },
      answers: { [key(qids[0])]: ["a"] },
      histories: {},
      version: 999, extraTopLevel: "x",
    };
    await importBackup(page, backup);
    await expect.poll(() => page.locator("#questionNav button.answered").count(), { timeout: 8_000 }).toBeGreaterThanOrEqual(1);
  });

  test("매우 긴 문자열(5만 자) 답안도 크래시 없이 처리된다", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    const answers: Record<string, string[]> = { [key(qids[0])]: ["z".repeat(50000)] };
    await importBackup(page, { state: baseState, answers, histories: {} });
    await expect(page.locator(".workspace")).toBeVisible();
    await expect.poll(() => page.locator("#questionNav button.answered").count(), { timeout: 8_000 }).toBeGreaterThanOrEqual(1);
  });

  test("answers가 배열(잘못된 타입)이어도 크래시 없이 처리된다", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    await importBackup(page, { state: baseState, answers: ["not", "object"], histories: {} });
    await expect(page.locator(".workspace")).toBeVisible();
    await expect(page.locator("#questionStem")).toBeVisible();
  });

  test("histories 필드가 없는 백업도 정상 복원된다", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    await importBackup(page, { state: baseState, answers: { [key(qids[0])]: ["a"] } });
    await expect.poll(() => page.locator("#questionNav button.answered").count(), { timeout: 8_000 }).toBeGreaterThanOrEqual(1);
  });

  test("대용량 import 후에도 문항 이동이 정상 동작한다", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    const answers: Record<string, string[]> = {};
    for (const id of qids) answers[key(id)] = ["a"];
    await importBackup(page, { state: baseState, answers, histories: {} });
    await expect.poll(() => page.locator("#questionNav button.answered").count(), { timeout: 8_000 }).toBe(40);
    await page.locator("#nextBtn").click();
    await expect(page.locator("#questionTitle")).toContainText("문제 2");
  });

  test("id 없는 이력이 섞여도 유효한 이력만 복원되고 성공 처리된다(#P2-3)", async ({ page }) => {
    await openSet(page, "ISTQB", SET);
    const histories = {
      good: {
        id: "good-1", setId: SET, mode: "exam", answers: {}, correct: 2, total: 3,
        createdAt: Date.now(), setTitle: "샘플문제 A",
        wrongItems: [{ number: 1, myAnswer: ["a"], correctAnswer: ["b"] }],
      },
      bad: { setId: SET, mode: "exam", answers: {}, correct: 1, total: 3 }, // id(keyPath) 없음
    };
    await page.getByRole("button", { name: /설정/ }).click();
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name: "backup.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ state: baseState, answers: {}, histories }), "utf-8"),
    });
    // 가져오기는 적용 전에 정책 확인을 거친다(D2).
    await page.getByTestId("import-confirm").click();
    // 부분 실패로 '실패' 토스트가 뜨지 않고 성공 처리되어야 한다(수정 전엔 실패 토스트).
    await expect(page.getByTestId("toast")).toContainText("복원했습니다", { timeout: 8_000 });
    await page.keyboard.press("Escape");
    // 유효한 good 이력이 통계에 1건 남는다.
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard").locator(".stl-rounds li")).toHaveCount(1, { timeout: 8_000 });
  });
});
