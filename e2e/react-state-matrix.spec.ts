import { test, expect, Page } from "@playwright/test";
import { openProduct } from "./helpers";

const note = (s: string) => console.log("· " + s);
const problems: string[] = [];
const bad = (s: string) => { problems.push(s); console.log("  ✗ " + s); };

// 상태 전이 매트릭스 — 모드 4개 × 시험 단계 3개의 모든 전이를 기계적으로 밟는다.
//
// 기존 테스트는 "정상 사용자가 밟을 법한" 전이만 확인했다. 결함은 아무도 안 밟는
// 칸에 숨는다: 응시 중에 오답 모드로 갔다 돌아오면 시험이 계속 잠겨 있는가?
// 채점 후 랜덤에서 세트를 바꾸면 채점 상태가 새 세트로 새어 나가는가?
// 모든 칸을 밟아야 정의되지 않은 상태가 드러난다.

const MODES = ["practice", "exam", "random", "review"] as const;
type Mode = typeof MODES[number];

async function state(page: Page) {
  return page.evaluate(() => {
    const seg = document.querySelector('.segmented button[aria-pressed="true"]');
    const sel = document.querySelector<HTMLSelectElement>("#examSelect");
    return {
      mode: seg?.getAttribute("data-mode") ?? null,
      setLocked: sel?.disabled ?? false,
      setId: sel?.value ?? null,
      gate: !!document.querySelector('[data-testid="exam-start-gate"]'),
      stem: !!document.querySelector("#questionStem"),
      graded: !!document.querySelector('[data-testid="result-open"]'),
      timer: document.querySelector("#timerText")?.textContent ?? "",
      progress: document.querySelector("#progressText")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      modals: Array.from(document.querySelectorAll('[role="dialog"]'))
        .filter((d) => (d as HTMLElement).offsetParent !== null).length,
    };
  });
}

// 모드 전환 — 응시 중이면 확인 모달이 뜰 수 있으므로 나오는 대로 처리한다.
async function goMode(page: Page, mode: Mode, accept: boolean) {
  await page.locator(`.segmented button[data-mode="${mode}"]`).click({ timeout: 3000 }).catch(() => {});
  for (const id of ["confirm-exit-exam-modal", "pending-set-change-modal", "confirm-grade-modal"]) {
    const m = page.getByTestId(id);
    if (await m.count()) {
      const btn = accept
        ? m.locator("button").last()
        : m.locator("button").first();
      await btn.click({ timeout: 2000 }).catch(() => {});
    }
  }
  await page.waitForTimeout(120);
}

test("상태 전이: 시험 미시작에서 전 모드로 나갔다 돌아오기", async ({ page }) => {
  test.setTimeout(300_000);
  await openProduct(page, "ISTQB");

  for (const m of MODES) {
    await goMode(page, "exam", true);
    const before = await state(page);
    if (!before.gate) bad(`시험 미시작인데 시작 게이트가 없다 (${JSON.stringify(before)})`);

    await goMode(page, m, true);
    await goMode(page, "exam", true);
    const after = await state(page);
    // 미시작 시험은 어디를 다녀와도 여전히 미시작이어야 한다.
    if (!after.gate) bad(`exam→${m}→exam 후 시작 게이트가 사라짐 (${JSON.stringify(after)})`);
    if (after.setLocked) bad(`exam→${m}→exam 후 응시하지도 않았는데 세트가 잠김`);
  }
  note(`미시작 왕복 ${MODES.length}건 검사 완료`);
});

test("상태 전이: 응시 중에 전 모드로 이탈 시도", async ({ page }) => {
  test.setTimeout(300_000);
  for (const m of MODES.filter((x) => x !== "exam")) {
    // 이전 반복의 시험 상태가 저장소에 남아 있으면 게이트가 안 뜬다 — 매번 비우고 시작한다.
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await openProduct(page, "ISTQB");
    await goMode(page, "exam", true);
    const gate = page.getByTestId("exam-start-btn");
    if (await gate.count()) await gate.click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await page.locator("#options .option").first().click();
    const during = await state(page);
    if (!during.setLocked) bad(`응시 중인데 세트 선택이 잠기지 않음`);

    // 취소를 누르면 시험에 남아 있어야 한다.
    await goMode(page, m, false);
    const stayed = await state(page);
    if (stayed.mode !== "exam") bad(`응시 중 ${m} 전환을 취소했는데 모드가 ${stayed.mode}로 바뀜`);
    if (!stayed.setLocked) bad(`응시 중 ${m} 전환 취소 후 세트 잠금이 풀림`);

    // 확인을 누르면 그 모드로 가야 하고, 시험으로 돌아오면 응시가 이어지거나
    // 명확히 끝나 있어야 한다(중간 상태 = 잠겼는데 게이트도 있는 상태는 안 된다).
    await goMode(page, m, true);
    const moved = await state(page);
    if (moved.mode !== m) note(`  (${m} 전환이 막힘 — 모드 ${moved.mode})`);
    if (moved.setLocked && moved.mode !== "exam") bad(`${m} 모드인데 세트가 잠겨 있음`);

    await goMode(page, "exam", true);
    const back = await state(page);
    if (back.gate && back.setLocked) bad(`시험 복귀 후 게이트와 잠금이 동시에 참(정의되지 않은 상태)`);
    note(`exam(응시중) → ${m} → exam : mode=${back.mode} gate=${back.gate} locked=${back.setLocked}`);
  }
});

test("상태 전이: 채점 완료 후 전 모드 왕복과 세트 변경", async ({ page }) => {
  test.setTimeout(300_000);
  await openProduct(page, "ISTQB");
  await goMode(page, "exam", true);
  await page.getByTestId("exam-start-btn").click();
  await page.locator("#options .option").first().click();
  await page.getByTestId("grade-button").click();
  const c = page.getByTestId("confirm-grade");
  if (await c.count()) await c.click();
  await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();

  const gradedState = await state(page);
  if (gradedState.setLocked) bad(`채점이 끝났는데 세트가 여전히 잠겨 있음`);
  note(`채점 직후: ${JSON.stringify(gradedState)}`);

  for (const m of MODES.filter((x) => x !== "exam")) {
    await goMode(page, m, true);
    const s1 = await state(page);
    if (s1.setLocked) bad(`채점 후 ${m} 모드인데 세트가 잠김`);
    await goMode(page, "exam", true);
  }

  // 채점된 시험에서 세트를 바꾸면 새 세트는 '미채점'이어야 한다 —
  // 채점 상태가 새어 나가면 풀지도 않은 세트가 완료로 보인다.
  await page.locator("#examSelect").selectOption("ISTQB-FL-V4-B");
  await page.waitForTimeout(400);
  for (const id of ["pending-set-change-modal", "graded-resume-modal"]) {
    const m = page.getByTestId(id);
    if (await m.count()) await m.locator("button").last().click().catch(() => {});
  }
  await page.waitForTimeout(400);
  const newSet = await state(page);
  note(`세트 변경 후: ${JSON.stringify(newSet)}`);
  if (newSet.setId === "ISTQB-FL-V4-B" && newSet.graded) {
    bad(`새 세트(B)로 바꿨는데 채점 완료 상태가 따라옴`);
  }
});

test("상태 전이: 전 모드에서 진행률 표기가 모드별로 독립인가", async ({ page }) => {
  test.setTimeout(300_000);
  await openProduct(page, "ISTQB");

  // 연습에서 3문항 답하고, 다른 모드로 갔다가 돌아오면 그대로여야 한다.
  await goMode(page, "practice", true);
  for (let i = 0; i < 3; i++) {
    await page.locator("#options .option").first().click();
    await page.locator("#nextBtn").click();
  }
  const practice = (await state(page)).progress;
  note(`연습 진행률: ${practice}`);

  for (const m of MODES.filter((x) => x !== "practice")) {
    await goMode(page, m, true);
    const other = (await state(page)).progress;
    // 모드마다 답안 네임스페이스가 다르므로 연습의 답이 새어 나가면 안 된다.
    if (other === practice) {
      note(`  (${m} 진행률이 연습과 동일: ${other} — 문항 수가 같으면 우연일 수 있음)`);
    }
    await goMode(page, "practice", true);
    const back = (await state(page)).progress;
    if (back !== practice) bad(`practice→${m}→practice 후 진행률이 ${practice} → ${back}로 변함`);
  }
});

test.afterAll(() => {
  console.log(`\n=== 상태 전이 이상 ${problems.length}건 ===`);
  for (const p of problems) console.log("  " + p);
});
