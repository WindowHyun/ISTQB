import { test, expect, Page } from "@playwright/test";
import { answerCurrent, openProduct, waitForList, goNextQuestion } from "./helpers";

/**
 * 정합성 테스트 — 같은 사실이 화면마다 같은 값으로 보이는가.
 *
 * 이 앱의 결함은 대부분 "계산이 틀렸다"가 아니라 "두 화면이 서로 다른 경로로 같은 것을
 * 계산한다"에서 나왔다: 결과 모달만 가중 %를 쓰고 통계는 단순 정답률을 썼던 일, 오답
 * 재풀이와 오답노트가 다른 자료구조를 봤던 일. 그래서 한 회차를 만든 뒤 여러 화면을
 * 돌며 같은 숫자가 나오는지 대조한다.
 */

const problems: string[] = [];
const bad = (s: string) => { problems.push(s); console.log("  ✗ " + s); };

async function openBar(page: Page) {
  if (!(await page.locator(".segmented").isVisible())) await page.getByTestId("drawer-open").click();
}

async function answerAll(page: Page, max: number) {
  for (let i = 0; i < max; i += 1) {
    await answerCurrent(page);
    if (!(await goNextQuestion(page))) break;
  }
}

async function grade(page: Page) {
  await openBar(page);
  await page.getByTestId("grade-button").click();
  const c = page.getByTestId("confirm-grade");
  if (await c.count()) await c.click();
  await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });
}

const num = (s: string | null, re: RegExp) => {
  const m = (s ?? "").match(re);
  return m ? Number(m[1]) : null;
};

test("정합성: 시험 회차의 점수가 결과 모달·통계·이력에서 일치한다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");

  await openBar(page);
  await page.locator('.segmented button[data-mode="exam"]').click();
  const gate = page.getByTestId("exam-start-btn");
  if (await gate.count()) await gate.click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

  const total = num(await page.locator("#progressText").textContent(), /\/\s*(\d+)/);
  await answerAll(page, total ?? 40);
  await grade(page);

  // 1) 결과 모달
  const resultRate = num(await page.getByTestId("result-rate").textContent(), /(\d+)%/);
  const scoreText = await page.getByTestId("result-score").textContent();
  const correctFromScore = num(scoreText, /(\d+)\s*\//);
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();

  // 2) IndexedDB 이력
  const stored = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("istqb-db", 1);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const all: Record<string, unknown>[] = await new Promise((res) => {
      const tx = db.transaction("history", "readonly");
      const q = tx.objectStore("history").getAll();
      q.onsuccess = () => res(q.result);
    });
    const h = all.find((x) => (x as { mode?: string }).mode === "exam") as
      { correct: number; total: number } | undefined;
    return h ? { correct: h.correct, total: h.total } : null;
  });

  // 3) 통계 요약
  await openBar(page);
  await page.getByTestId("stats-open").click();
  await expect(page.getByTestId("stats-dashboard")).toBeVisible();
  const attempts = num(await page.locator(".stats-summary div:nth-child(1) strong").textContent(), /(\d+)/);
  const best = num(await page.locator(".stats-summary div:nth-child(3) strong").textContent(), /(\d+)/);

  console.log(`· 결과 ${resultRate}% (${correctFromScore}/${total}) | 이력 ${stored?.correct}/${stored?.total} | 요약 응시 ${attempts} 최고 ${best}%`);

  if (stored && correctFromScore !== null && stored.correct !== correctFromScore) {
    bad(`결과 모달 정답 수(${correctFromScore})와 이력(${stored.correct})이 다르다`);
  }
  if (stored && total !== null && stored.total !== total) {
    bad(`진행률 총 문항(${total})과 이력 총 문항(${stored.total})이 다르다`);
  }
  if (attempts !== 1) bad(`실전 1회차인데 응시 횟수가 ${attempts}`);
  if (best !== resultRate) bad(`결과 모달 ${resultRate}%와 통계 최고 정답률 ${best}%가 다르다`);

  expect(problems, problems.join("\n")).toEqual([]);
});

test("정합성: 챕터 분모 합이 실제로 푼 서로 다른 문항 수를 넘지 않는다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");

  // 같은 세트를 두 번 푼다 — 분모가 두 배가 되면 문항 단위 집계가 깨진 것이다.
  for (let round = 0; round < 2; round += 1) {
    await openBar(page);
    await page.locator('.segmented button[data-mode="exam"]').click();
    const fresh = page.getByTestId("graded-resume-fresh");
    if (await fresh.count()) await fresh.click();
    const gate = page.getByTestId("exam-start-btn");
    if (await gate.count()) await gate.click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await answerAll(page, 45);
    await grade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();
  }

  await openBar(page);
  await page.getByTestId("stats-open").click();
  await expect(page.getByTestId("stats-dashboard")).toBeVisible();
  const denom = await page.locator(".sc-rate").evaluateAll((els) =>
    els.reduce((sum, el) => {
      const m = (el.textContent || "").match(/\d+\s*\/\s*(\d+)/);
      return sum + (m ? Number(m[1]) : 0);
    }, 0));
  console.log(`· 같은 세트 2회 채점 후 챕터 분모 합 = ${denom}`);
  // 세트는 40문항이므로 두 번 풀어도 40을 넘으면 안 된다(챕터 미태깅 문항은 빠질 수 있어 ≤).
  if (denom > 40) bad(`같은 세트를 두 번 풀었더니 분모가 ${denom} (40 이하여야 한다)`);
  if (denom === 0) bad("챕터 분모가 0 — 집계가 아예 안 됨");

  expect(problems, problems.join("\n")).toEqual([]);
});

test("정합성: 오답 수가 결과·오답노트·재풀이에서 어긋나지 않는다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");

  // 세트 단위 회차(시험)로 대조한다 — 퀵은 회차를 남기지 않아 세트 오답노트·재풀이에
  // 들어가지 않으므로, 이 삼자 대조의 재료가 될 수 없다(그 분리는 아래에서 따로 본다).
  // 종전에는 랜덤으로 회차를 만들었는데 그 진입로가 사라졌다(퀵에 흡수) — 세트 전체를
  // 채점하는 회차라는 점은 시험이 같으므로 재료를 시험으로 바꾼다.
  await openBar(page);
  await page.locator('.segmented button[data-mode="exam"]').click();
  const gate = page.getByTestId("exam-start-btn");
  if (await gate.count()) await gate.click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  const roundTotal = num(await page.locator("#progressText").textContent(), /\/\s*(\d+)/);
  await answerAll(page, (roundTotal ?? 40) + 2);
  await grade(page);

  // 1) 결과 모달의 오답 수
  const body = await page.getByTestId("result-summary").innerText();
  const wrongFromResult = num(body, /오답\s*(\d+)개/);

  // 2) 오답노트에 실린 문항 수(전 그룹 합)
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();
  await openBar(page);
  await page.getByRole("button", { name: /오답 노트/ }).first().click();
  await expect(page.getByTestId("wrong-note")).toBeVisible({ timeout: 20_000 });
  const groups = page.getByTestId("wrong-note-set-btn");
  const groupCount = await groups.count();
  let noteTotal = 0;
  for (let i = 0; i < groupCount; i += 1) {
    const t = await groups.nth(i).innerText();
    noteTotal += num(t, /오답\s*(\d+)/) ?? 0;
  }
  console.log(`· 결과 오답 ${wrongFromResult} | 오답노트 그룹 ${groupCount}개 합 ${noteTotal}`);
  if (wrongFromResult !== null && noteTotal !== wrongFromResult) {
    bad(`결과 오답 수(${wrongFromResult})와 오답노트 합(${noteTotal})이 다르다`);
  }

  // 3) 오답 재풀이 대상 수 — 한 세트분만 풀므로 전체보다 작거나 같아야 한다.
  await page.keyboard.press("Escape");
  await openBar(page);
  await page.getByRole("button", { name: "오답 다시 풀기" }).click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  const retryTotal = num(await page.locator("#progressText").textContent(), /\/\s*(\d+)/);
  console.log(`· 재풀이 대상 ${retryTotal}`);
  if (retryTotal === null || retryTotal < 1) bad(`재풀이 대상이 없다 (${retryTotal})`);
  if (wrongFromResult !== null && retryTotal !== null && retryTotal > wrongFromResult) {
    bad(`재풀이 대상(${retryTotal})이 전체 오답(${wrongFromResult})보다 많다`);
  }

  // 4) 퀵을 한 회차 더 풀어도 위 세 숫자는 그대로여야 한다 — 퀵 오답은 임시 목록으로만
  //    간다. 여기서 세트 그룹 합이 늘면 "기록을 남기지 않는다"는 약속이 깨진 것이다.
  await openBar(page);
  await page.locator('.segmented button[data-mode="quick"]').click();
  // 퀵 추첨이 실릴 때까지 기다린다 — 세그먼트를 누르면 헤더는 곧바로 퀵이 되지만 문항은
  // 뒤늦게 온다. 그 사이에 답하면 직전 세트의 문항을 퀵 회차로 착각한 채 세게 된다.
  await waitForList(page, { mode: "quick" });
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await answerAll(page, 12); // 퀵은 문항마다 채점한다(answerAll이 그 흐름을 밟는다)
  // 퀵 오답 수는 저장된 퀵 회차에서 읽는다 — 이 모드에는 결과 요약 모달이 없다.
  // 저장은 500ms 디바운스라 잠깐 기다린 뒤 읽는다.
  await page.waitForTimeout(900);
  const quickWrong = await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (!k.endsWith("-ui-state")) continue;
      const rounds = JSON.parse(localStorage.getItem(k) || "{}").quickRounds ?? [];
      if (rounds.length) {
        return rounds.reduce(
          (n: number, r: { wrongItems?: unknown[] }) => n + (r.wrongItems?.length ?? 0), 0);
      }
    }
    return null;
  });

  await openBar(page);
  await page.getByRole("button", { name: /오답 노트/ }).first().click();
  await expect(page.getByTestId("wrong-note")).toBeVisible({ timeout: 20_000 });
  let noteTotalAfter = 0;
  const groupsAfter = page.getByTestId("wrong-note-set-btn");
  for (let i = 0; i < (await groupsAfter.count()); i += 1) {
    noteTotalAfter += num(await groupsAfter.nth(i).innerText(), /오답\s*(\d+)/) ?? 0;
  }
  const quickItems = await page.getByTestId("quick-wrong-item").count();
  console.log(`· 퀵 오답 ${quickWrong} | 퀵 목록 ${quickItems} | 세트 그룹 합 ${noteTotal}→${noteTotalAfter}`);
  if (noteTotalAfter !== noteTotal) {
    bad(`퀵을 풀었더니 세트 오답노트 합이 ${noteTotal}→${noteTotalAfter}로 변했다`);
  }
  if (quickWrong !== null && quickItems !== quickWrong) {
    bad(`퀵 결과 오답(${quickWrong})과 퀵 오답 목록(${quickItems})이 다르다`);
  }

  expect(problems, problems.join("\n")).toEqual([]);
});

test("정합성: 진행률과 문항 팔레트의 '답함' 개수가 같다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "CSTS");

  // 연습 모드에서 잰다. 종전에는 퀵에서 헤더 점수판과 팔레트를 대조했는데, 퀵은 이동을
  // ‹ › 로 한정하면서 팔레트를 렌더하지 않는다 — 대조할 두 화면 중 한쪽이 사라졌다.
  // 진행률(#progressText)과 팔레트는 연습·시험에 함께 있고, 이 검사가 원래 보던 짝이다.
  await waitForList(page, { mode: "practice" });
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

  // 5문항만 답한다. 단계마다 진행률을 확인하고 넘어간다 — 렌더가 자리를 잡기 전에
  // '다음'을 누르면 이전 문항을 다시 답하게 되고, 그 어긋남이 아래 팔레트 대조를
  // 조용히 틀리게 만든다(경합이라 재현이 들쭉날쭉해 원인을 찾기 어렵다).
  const progress = page.locator("#progressText");
  for (let i = 0; i < 5; i += 1) {
    await answerCurrent(page);
    await expect(progress).toHaveText(new RegExp(`^${i + 1}\\s*/`));
    const n = page.locator("#nextBtn");
    if (await n.count() && !(await n.isDisabled())) await n.click();
  }
  const [answered, listed] = ((await progress.textContent()) || "")
    .split("/")
    .map((s) => Number(s.trim()));

  // 데스크톱에서는 팔레트가 이미 펼쳐져 있고 palette-toggle은 '접기'다 —
  // 무턱대고 누르면 팔레트가 사라져 검사가 0건으로 무력해진다. 없을 때만 연다.
  if ((await page.locator(".question-nav button").count()) === 0) {
    await page.getByTestId("palette-toggle").click();
    await page.waitForTimeout(400);
  }
  // 팔레트는 .question-nav 안의 버튼에 answered/unanswered 클래스를 붙인다.
  // 셀렉터가 어긋나면 0이 나와 검사가 조용히 무력해지므로, 버튼이 실제로 있는지 먼저 본다.
  const palette = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll(".question-nav button"));
    return {
      total: btns.length,
      answered: btns.filter((b) => b.classList.contains("answered")).length,
    };
  });
  const paletteAnswered = palette.answered;
  if (palette.total === 0) bad("팔레트 버튼을 찾지 못했다 — 셀렉터가 어긋나 검사가 무력하다");
  // 분모끼리도 맞춰 본다 — 진행률이 세는 목록과 팔레트가 그리는 목록이 같아야 한다.
  if (palette.total !== listed) bad(`팔레트 버튼 수(${palette.total})가 진행률의 분모(${listed})와 다르다`);
  console.log(`· 진행률 ${answered} / ${listed} | 팔레트 답함 ${paletteAnswered} / ${palette.total}`);
  if (answered !== paletteAnswered) {
    bad(`진행률(${answered})과 팔레트 답함(${paletteAnswered})이 다르다`);
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
