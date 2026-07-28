import { test, expect, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openProduct } from "./helpers";

const note = (s: string) => console.log("· " + s);

// 표준 룰셋(axe-core) 자동 스캔 — 지금까지의 접근성 검사는 손으로 고른 항목
// (aria-pressed, 모달 role, Tab 도달, 특정 색 대비)뿐이었다. 사람이 목록을 만들면
// 목록에 없는 것은 영영 안 본다. 여기서는 WCAG 2.1 A/AA 전 규칙을 기계가 훑는다.

async function scan(page: Page, label: string, results: string[]) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  if (!r.violations.length) { note(`${label}: 위반 없음`); return; }
  for (const v of r.violations) {
    const where = v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ");
    const line = `[${v.impact}] ${v.id} — ${v.help} (${v.nodes.length}곳: ${where})`;
    results.push(`${label} :: ${line}`);
    note(`${label}: ${line}`);
  }
}

test("axe: 주요 화면 WCAG 2.1 AA 스캔", async ({ page }) => {
  test.setTimeout(300_000);
  const found: string[] = [];

  // 1) 제품 선택 게이트
  await page.goto("/");
  await scan(page, "게이트", found);

  // 2) 사용설명서
  await page.getByTestId("guide-open").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await scan(page, "사용설명서", found);
  await page.keyboard.press("Escape");

  // 3) 연습 모드 문항(피드백 전/후)
  await openProduct(page, "ISTQB");
  await scan(page, "연습-문항", found);
  await page.locator("#options .option").first().click();
  await expect(page.locator("#feedback")).toBeVisible();
  await scan(page, "연습-피드백", found);

  // 4) 시험 게이트 → 응시
  await page.locator('.segmented button[data-mode="exam"]').click();
  await scan(page, "시험-게이트", found);
  await page.getByTestId("exam-start-btn").click();
  await scan(page, "시험-응시중", found);

  // 5) 채점 확인 모달 → 결과
  await page.locator("#options .option").first().click();
  await page.getByTestId("grade-button").click();
  const confirm = page.getByTestId("confirm-grade-modal");
  if (await confirm.count()) await scan(page, "채점확인", found);
  await page.getByTestId("confirm-grade").click();
  await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 15_000 });
  await scan(page, "채점결과", found);
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();

  // 6) 통계
  await page.getByTestId("stats-open").click();
  await expect(page.getByTestId("stats-dashboard")).toBeVisible();
  await scan(page, "학습통계", found);
  await page.getByRole("button", { name: "닫기", exact: true }).first().click();

  // 7) 오답 노트 3단계
  await page.getByRole("button", { name: /오답 노트/ }).click();
  await expect(page.getByTestId("wrong-note")).toBeVisible();
  await scan(page, "오답노트-세트", found);
  await page.getByTestId("wrong-note-set-btn").first().click();
  await scan(page, "오답노트-목록", found);
  await page.getByTestId("wrong-note-item-btn").first().click();
  await scan(page, "오답노트-상세", found);
  await page.keyboard.press("Escape");

  // 8) 설정
  await page.getByRole("button", { name: "⚙ 설정" }).click();
  await scan(page, "설정", found);
  await page.keyboard.press("Escape");

  note(`\n=== axe 위반 총 ${found.length}건 ===`);
  expect(found, found.join("\n")).toEqual([]);
});

test("axe: 다크 모드 + 모바일 390px", async ({ page }) => {
  test.setTimeout(300_000);
  const found: string[] = [];

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("istqb-theme", "dark"));
  await page.reload();
  await scan(page, "다크-게이트", found);

  await page.getByRole("button", { name: "CSTS" }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await scan(page, "다크-문항", found);

  await page.getByTestId("drawer-open").click();
  await expect(page.locator(".drawer-backdrop")).toBeVisible();
  await scan(page, "다크-드로어", found);
  await page.keyboard.press("Escape");

  // 서답형 화면(입력 라벨·설명 연결 검사)
  const idx = await (await page.request.get("/data/index.json")).json();
  const setId = await page.locator("#examSelect").inputValue();
  const p = idx.sets.find((s: { id: string }) => s.id === setId).path.replace(/^\.\//, "");
  const data = await (await page.request.get(`/data/${p}`)).json();
  const shortQ = data.questions.find((q: { type: string }) => q.type === "short_answer");
  await page.getByTestId("jump-pin").click();
  await page.getByTestId("palette-jump").getByRole("button", { name: `문제 ${shortQ.number}`, exact: true }).click();
  await expect(page.locator(".short-answer-input").first()).toBeVisible();
  await scan(page, "다크-서답형", found);

  note(`\n=== axe(다크·모바일) 위반 총 ${found.length}건 ===`);
  expect(found, found.join("\n")).toEqual([]);
});
