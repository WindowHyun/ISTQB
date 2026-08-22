import { test, expect, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openProduct, openSet, gotoQuestion } from "./helpers";

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
  // 문항을 누르면 모달이 닫히고 본문 화면(WrongViewScreen)에 펼쳐진다 — 모달이 아니라
  // 화면이므로 Escape가 아니라 '풀이로 돌아가기'로 빠져나온다.
  await page.getByTestId("wrong-note-item-btn").first().click();
  await scan(page, "오답보기-화면", found);
  await page.getByTestId("wrong-view-close").click();

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

  // 다크 스캔이 390px에만 있어 팔레트가 접힌 채였다 — 데스크톱 폭에서 팔레트가 펼쳐진
  // 상태, 그것도 문항에 답한 뒤(.current.answered)를 보지 않으면 상태 배경과 현재 표시
  // 색이 겹치는 조합이 드러나지 않는다(실제로 3.49:1 위반이 여기 숨어 있었다).
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await page.getByRole("button", { name: "CSTS" }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await page.locator("#options .option").first().click();
  await page.waitForTimeout(300);
  await scan(page, "다크-데스크톱-팔레트(답한 뒤)", found);

  // 뒤따르는 검사들은 모바일 전용 컨트롤(점프 핀 등)을 만지므로 폭을 되돌린다 —
  // 데스크톱으로 둔 채 넘기면 그 컨트롤이 숨어 있어 뒤 테스트가 통째로 멎는다.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: "CSTS" }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

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

// 코드 블록이 실린 문항은 지금까지 어떤 axe 스캔에도 걸리지 않았다 — 위 "주요 화면"
// 스캔은 각 세트의 1번 문항에 머물고, 퀵 스캔은 무작위 추첨이라 뽑히는 날에만 본다.
// 실제로 퀵 스캔이 우연히 밟아 serious 위반(scrollable-region-focusable)을 드러냈다.
// 우연에 맡기지 않도록 코드 블록이 있는 문항을 지정해 스캔한다.
// (28개 문항이 코드 블록을 갖고 있어, 이 결함은 퀵이 아니라 앱 전역의 것이었다.)
test("axe: 코드 블록이 있는 문항 — 스크롤 영역의 키보드 접근", async ({ page }) => {
  test.setTimeout(300_000);
  const found: string[] = [];

  await openSet(page, "CSTS", "CSTS-FL-2404");
  await gotoQuestion(page, 22);
  const block = page.locator(".code-block").first();
  await expect(block, "22번에 코드 블록이 없다 — 데이터가 바뀌었으면 대상 문항을 갱신할 것")
    .toBeVisible();

  // 가로로 잘리는 코드를 키보드만으로 볼 수 있어야 한다(WCAG 2.1.1).
  await expect(block).toHaveAttribute("tabindex", "0");
  await block.focus();
  await expect(block).toBeFocused();

  await scan(page, "코드블록-문항", found);
  note(`\n=== axe 위반 총 ${found.length}건 ===`);
  expect(found, found.join("\n")).toEqual([]);
});
