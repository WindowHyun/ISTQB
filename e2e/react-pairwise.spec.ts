import { test, expect, Page } from "@playwright/test";
import { openProduct } from "./helpers";

/**
 * 페어와이즈(all-pairs) 조합 테스트.
 *
 * 요인을 전조합하면 2×5×3×2×2 = 120가지라 E2E로 돌리기엔 비싸다. 결함 대부분은
 * 두 요인의 조합에서 드러난다는 관찰에 기대어, 모든 '요인쌍'이 최소 한 번은 함께
 * 나타나는 최소 집합만 실행한다.
 *
 * 요인:
 *   product   ISTQB / CSTS
 *   mode      practice / exam / random / review / quick
 *   size      10 / 15 / 20        (퀵에서만 의미, 그 외엔 무시)
 *   width     desktop(1280) / mobile(390)
 *   graded    채점함 / 안 함
 */

const FACTORS = {
  product: ["ISTQB", "CSTS"],
  mode: ["practice", "exam", "random", "review", "quick"],
  size: ["10", "15", "20"],
  width: ["desktop", "mobile"],
  graded: ["yes", "no"],
} as const;

type Combo = { product: string; mode: string; size: string; width: string; graded: string };

/**
 * 탐욕적 all-pairs 생성 — 아직 덮이지 않은 요인쌍을 가장 많이 덮는 조합을 반복해서 고른다.
 * 시드 없는 난수를 쓰지 않으므로 실행마다 같은 집합이 나온다(결과 재현성).
 */
function allPairs(): Combo[] {
  const keys = Object.keys(FACTORS) as (keyof typeof FACTORS)[];
  const pending = new Set<string>();
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      for (const a of FACTORS[keys[i]]) for (const b of FACTORS[keys[j]]) {
        pending.add(`${keys[i]}=${a}|${keys[j]}=${b}`);
      }
    }
  }
  const all: Combo[] = [];
  for (const p of FACTORS.product) for (const m of FACTORS.mode) for (const s of FACTORS.size) {
    for (const w of FACTORS.width) for (const g of FACTORS.graded) {
      all.push({ product: p, mode: m, size: s, width: w, graded: g });
    }
  }
  const pairsOf = (c: Combo) => {
    const out: string[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        out.push(`${keys[i]}=${c[keys[i]]}|${keys[j]}=${c[keys[j]]}`);
      }
    }
    return out;
  };
  const chosen: Combo[] = [];
  while (pending.size) {
    let best: Combo | null = null;
    let bestGain = -1;
    for (const c of all) {
      const gain = pairsOf(c).filter((p) => pending.has(p)).length;
      if (gain > bestGain) { bestGain = gain; best = c; }
    }
    if (!best || bestGain <= 0) break;
    chosen.push(best);
    for (const p of pairsOf(best)) pending.delete(p);
  }
  return chosen;
}

const COMBOS = allPairs();

async function openBar(page: Page) {
  const sel = page.locator("#quickSize");
  if (!(await sel.isVisible())) await page.getByTestId("drawer-open").click();
}

async function enter(page: Page, c: Combo) {
  await openProduct(page, c.product as "ISTQB" | "CSTS");
  await openBar(page);
  if (c.mode === "quick") {
    await page.locator("#quickSize").selectOption(c.size);
    await page.getByTestId("quick-start-btn").click();
  } else {
    await page.locator(`.segmented button[data-mode="${c.mode}"]`).click();
    if (c.mode === "exam") {
      const gate = page.getByTestId("exam-start-btn");
      if (await gate.count()) await gate.click();
    }
  }
  await page.waitForTimeout(400);
}

test.describe("페어와이즈 조합", () => {
  test(`전 요인쌍을 덮는 ${COMBOS.length}개 조합에서 진입·조작·채점이 깨지지 않는다`, async ({ page }) => {
    test.setTimeout(600_000);
    const problems: string[] = [];
    console.log(`· all-pairs 조합 수: ${COMBOS.length} (전조합 120 대비 ${Math.round(COMBOS.length / 120 * 100)}%)`);

    for (const c of COMBOS) {
      const label = `${c.product}/${c.mode}/${c.size}/${c.width}/graded=${c.graded}`;
      const errs: string[] = [];
      const onErr = (e: Error) => errs.push(String(e).slice(0, 160));
      page.on("pageerror", onErr);
      try {
        await page.setViewportSize(
          c.width === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 900 },
        );
        await page.goto("/");
        await page.evaluate(() => localStorage.clear());
        await enter(page, c);

        // 오답 모드는 오답이 없으면 진입하지 않는 것이 사양이라 문항이 없을 수 있다.
        const hasStem = await page.locator("#questionStem").count();
        if (c.mode !== "review" && !hasStem) {
          problems.push(`${label}: 문항이 렌더되지 않음`);
          continue;
        }
        if (!hasStem) continue;

        // 답을 하나 고르면 진행률이 오르는가(답안 키가 어긋나면 여기서 드러난다).
        const before = await page.locator("#progressText").textContent();
        const opt = page.locator("#options .option").first();
        if (await opt.count()) {
          await opt.click();
          await page.waitForTimeout(150);
          const after = await page.locator("#progressText").textContent();
          if (before === after && /^0 \//.test(before ?? "")) {
            problems.push(`${label}: 답을 골라도 진행률이 그대로 (${before})`);
          }
        }

        if (c.graded === "yes") {
          await openBar(page);
          const gradeBtn = page.getByTestId("grade-button");
          if (await gradeBtn.count()) {
            await gradeBtn.click();
            const cm = page.getByTestId("confirm-grade");
            if (await cm.count()) await cm.click();
            const res = page.getByTestId("result-summary");
            if (!(await res.count())) problems.push(`${label}: 채점했는데 결과가 뜨지 않음`);
            else {
              // 퀵은 합격 판정을 붙이지 않는다.
              const text = await res.innerText();
              if (c.mode === "quick" && /합격 기준/.test(text)) {
                problems.push(`${label}: 퀵인데 합격 판정이 표시됨`);
              }
              if (c.mode !== "quick" && !/합격 기준/.test(text)) {
                problems.push(`${label}: 실전 회차인데 합격 기준이 없음`);
              }
            }
          }
        }

        // 가로 넘침 — 좁은 화면 조합에서만 실질적이지만 모든 조합에서 본다.
        const of = await page.evaluate(() => ({
          s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth,
        }));
        if (of.s > of.c + 1) problems.push(`${label}: 문서 가로 넘침 ${of.s}>${of.c}`);

        if (errs.length) problems.push(`${label}: JS 오류 ${JSON.stringify(errs)}`);
      } finally {
        page.off("pageerror", onErr);
      }
    }

    if (problems.length) problems.forEach((p) => console.log("  ✗ " + p));
    else console.log("· 전 조합 이상 없음");
    expect(problems, problems.join("\n")).toEqual([]);
  });
});
