import { test, expect, Page } from "@playwright/test";
import { openProduct, gotoStable, gradeQuickIfNeeded } from "./helpers";

/**
 * 페어와이즈(all-pairs) 조합 테스트.
 *
 * 요인을 전조합하면 2×4×2×2 = 32가지라 E2E로 돌리기엔 비싸다. 결함 대부분은
 * 두 요인의 조합에서 드러난다는 관찰에 기대어, 모든 '요인쌍'이 최소 한 번은 함께
 * 나타나는 최소 집합만 실행한다.
 *
 * 요인:
 *   product   ISTQB / CSTS
 *   mode      practice / exam / review / quick
 *   width     desktop(1280) / mobile(390)
 *   graded    채점함 / 안 함
 *
 * size(10/15/20)는 뺐다 — 퀵이 문항 수를 묻지 않게 되면서 그 요인이 고를 값을 잃었다.
 * 값이 하나뿐인 요인은 조합을 3배로 부풀리기만 하고 아무 상호작용도 더하지 않는다.
 *
 * random도 뺐다 — 모드 세그먼트에서 빠져(퀵에 흡수) 이 스펙의 진입 방식(세그먼트 클릭)으로는
 * 도달할 수 없다. 살아 있는 랜덤(챕터 미니 시험)은 진입 절차가 달라(통계 → 챕터 버튼)
 * 이 조합 매트릭스에 그대로 얹히지 않는다 — 전용 스펙들이 따로 덮는다.
 */

const FACTORS = {
  product: ["ISTQB", "CSTS"],
  mode: ["practice", "exam", "review", "quick"],
  width: ["desktop", "mobile"],
  graded: ["yes", "no"],
} as const;

type Combo = { product: string; mode: string; width: string; graded: string };

/** 요인 k개를 고르는 모든 조합의 인덱스 — t-way 커버링에 쓴다. */
function indexCombos(n: number, t: number): number[][] {
  const out: number[][] = [];
  const walk = (start: number, cur: number[]) => {
    if (cur.length === t) { out.push([...cur]); return; }
    for (let i = start; i < n; i += 1) { cur.push(i); walk(i + 1, cur); cur.pop(); }
  };
  walk(0, []);
  return out;
}

const ALL_COMBOS: Combo[] = (() => {
  const out: Combo[] = [];
  for (const p of FACTORS.product) for (const m of FACTORS.mode) {
    for (const w of FACTORS.width) for (const g of FACTORS.graded) {
      out.push({ product: p, mode: m, width: w, graded: g });
    }
  }
  return out;
})();

/**
 * 탐욕적 t-way 커버링 배열 — 아직 덮이지 않은 요인 조합을 가장 많이 덮는 케이스를
 * 반복해서 고른다. 시드 없는 난수를 쓰지 않으므로 실행마다 같은 집합이 나온다(재현성).
 *
 * 강도를 t=2에서 3으로 올린 근거는 실측이다. 요인이 2×4×2×2 = 32 전조합인 지금:
 *   t=2   8 케이스
 *   t=3  16 케이스   ← 채택
 *   t=4  32 케이스 = 전조합
 * 3-way는 전조합의 절반으로 모든 3요인 상호작용을 덮는다. 그 위는 t=4가 곧 전조합이라
 * 강도를 올리는 의미가 없다 — 여기서 끊는 것이 합리적이다.
 * 더 올리려면 STRENGTH만 바꾸면 된다 — 케이스 목록은 코드가 만든다.
 *
 * (종전 주석은 size·random을 포함하던 시절의 120 전조합 기준 수치를 그대로 달고 있었다.
 *  두 요인이 빠지면서 케이스 수가 절반 이하로 줄었으므로 실측을 다시 적는다.)
 */
const STRENGTH = 3;

function coveringArray(t: number): Combo[] {
  const keys = Object.keys(FACTORS) as (keyof typeof FACTORS)[];
  const sets = indexCombos(keys.length, t);
  const tupleKeys = (c: Combo) =>
    sets.map((set) => set.map((i) => `${keys[i]}=${c[keys[i]]}`).join("|"));

  const pending = new Set<string>();
  for (const c of ALL_COMBOS) for (const k of tupleKeys(c)) pending.add(k);

  const chosen: Combo[] = [];
  while (pending.size) {
    let best: Combo | null = null;
    let bestGain = -1;
    for (const c of ALL_COMBOS) {
      const gain = tupleKeys(c).filter((k) => pending.has(k)).length;
      if (gain > bestGain) { bestGain = gain; best = c; }
    }
    if (!best || bestGain <= 0) break;
    chosen.push(best);
    for (const k of tupleKeys(best)) pending.delete(k);
  }
  return chosen;
}

const COMBOS = coveringArray(STRENGTH);

/** 선택한 집합이 실제로 전 t-조합을 덮는지 — 생성기가 조용히 덜 덮으면 검사가 약해진다. */
function uncoveredTuples(t: number, chosen: Combo[]): number {
  const keys = Object.keys(FACTORS) as (keyof typeof FACTORS)[];
  const sets = indexCombos(keys.length, t);
  const need = new Set<string>();
  for (const c of ALL_COMBOS) {
    for (const set of sets) need.add(set.map((i) => `${keys[i]}=${c[keys[i]]}`).join("|"));
  }
  for (const c of chosen) {
    for (const set of sets) need.delete(set.map((i) => `${keys[i]}=${c[keys[i]]}`).join("|"));
  }
  return need.size;
}

async function openBar(page: Page) {
  if (!(await page.locator(".segmented").isVisible())) await page.getByTestId("drawer-open").click();
}

async function enter(page: Page, c: Combo) {
  await openProduct(page, c.product as "ISTQB" | "CSTS");
  await openBar(page);
  // 퀵도 이제 다른 모드와 같은 진입로다(세그먼트) — 전용 분기가 필요 없다.
  await page.locator(`.segmented button[data-mode="${c.mode}"]`).click();
  if (c.mode === "exam") {
    const gate = page.getByTestId("exam-start-btn");
    if (await gate.count()) await gate.click();
  }
  await page.waitForTimeout(400);
}

test.describe("페어와이즈 조합", () => {
  test(`전 ${STRENGTH}요인 조합을 덮는 ${COMBOS.length}개 케이스에서 진입·조작·채점이 깨지지 않는다`, async ({ page }) => {
    // 예산 5분(실측 1.1분 단독). 잡 타임아웃보다 작게 두는 이유는 react-fullsweep 주석 참고.
    test.setTimeout(300_000);
    const problems: string[] = [];
    // 덮지 못한 조합이 하나라도 있으면 "t-way 전수"라는 이름이 거짓이 된다.
    const missed = uncoveredTuples(STRENGTH, COMBOS);
    expect(missed, `${STRENGTH}요인 조합 ${missed}개가 덮이지 않았다`).toBe(0);
    console.log(`· ${STRENGTH}-way 커버링: ${COMBOS.length}케이스 (전조합 ${ALL_COMBOS.length} 대비 ${Math.round(COMBOS.length / ALL_COMBOS.length * 100)}%) · 미커버 0`);

    for (const c of COMBOS) {
      const label = `${c.product}/${c.mode}/${c.width}/graded=${c.graded}`;
      const errs: string[] = [];
      const onErr = (e: Error) => errs.push(String(e).slice(0, 160));
      page.on("pageerror", onErr);
      try {
        await page.setViewportSize(
          c.width === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 900 },
        );
        await gotoStable(page);
        await page.evaluate(() => localStorage.clear());
        await enter(page, c);

        // 오답 모드는 오답이 없으면 진입하지 않는 것이 사양이라 문항이 없을 수 있다.
        const hasStem = await page.locator("#questionStem").count();
        if (c.mode !== "review" && !hasStem) {
          problems.push(`${label}: 문항이 렌더되지 않음`);
          continue;
        }
        if (!hasStem) continue;

        // 답을 하나 고르면 집계가 오르는가(답안 키가 어긋나면 여기서 드러난다).
        // 퀵에는 진행률(#progressText)이 없다 — 끝이 정해지지 않아 분모가 없기 때문이다.
        // 그 모드에서는 헤더 점수판의 '진행'이 같은 역할을 하므로 읽는 곳만 바꾼다.
        const counter = c.mode === "quick"
          ? page.locator(".quick-scoreboard .qs-item").first().locator("b")
          : page.locator("#progressText");
        const before = await counter.textContent();
        const opt = page.locator("#options .option").first();
        if (await opt.count()) {
          await opt.click();
          // 퀵은 한 문항씩 채점하고 넘어간다 — 고르는 것만으로는 진행이 오르지 않는다.
          // (다른 모드에는 이 버튼이 없어 아무 일도 하지 않는다.)
          await gradeQuickIfNeeded(page);
          await page.waitForTimeout(150);
          const after = await counter.textContent();
          if (before === after && /^0(\s|$)/.test((before ?? "").trim())) {
            problems.push(`${label}: 답을 골라도 진행이 그대로 (${before})`);
          }
        }

        // 퀵에는 세션 채점이 없다 — 채점은 위에서 문항 단위로 이미 끝났고, 결과 모달도
        // 합격 판정도 이 모드에는 존재하지 않는다(그 계약은 react-quick-ux가 고정한다).
        if (c.graded === "yes" && c.mode !== "quick") {
          await openBar(page);
          const gradeBtn = page.getByTestId("grade-button");
          if (await gradeBtn.count()) {
            await gradeBtn.click();
            const cm = page.getByTestId("confirm-grade");
            if (await cm.count()) await cm.click();
            const res = page.getByTestId("result-summary");
            if (!(await res.count())) problems.push(`${label}: 채점했는데 결과가 뜨지 않음`);
            else {
              // 여기 오는 것은 실전 회차뿐이다(퀵은 위에서 걸러진다) — 합격 기준이 있어야 한다.
              const text = await res.innerText();
              if (!/합격 기준/.test(text)) {
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
