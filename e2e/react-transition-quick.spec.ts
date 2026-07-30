import { test, expect, Page } from "@playwright/test";
import { openProduct } from "./helpers";

/**
 * 전이 매트릭스 — 퀵을 포함한 5모드.
 *
 * react-state-matrix는 퀵이 생기기 전에 쓰여 MODES가 4개다. 퀵은 세그먼트 밖 별도
 * 진입로이고 setId가 센티넬(QUICK)이라, 세트를 전제하는 전이 규칙이 그대로 통하지
 * 않는다 — 실제로 '두 번째 퀵이 잠긴 채 시작', '퀵 직후 오답 재풀이 무동작'이
 * 이 조합에서 나왔다. 5×5 왕복을 기계적으로 밟아 남은 칸을 확인한다.
 */

const SEGMENT_MODES = ["practice", "exam", "random", "review"] as const;
type Seg = typeof SEGMENT_MODES[number];

const problems: string[] = [];
const bad = (s: string) => { problems.push(s); console.log("  ✗ " + s); };

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const seg = document.querySelector('.segmented button[aria-pressed="true"]');
    const sel = document.querySelector<HTMLSelectElement>("#examSelect");
    return {
      mode: seg?.getAttribute("data-mode") ?? null,
      setId: sel?.value ?? null,
      gate: !!document.querySelector('[data-testid="exam-start-gate"]'),
      stem: !!document.querySelector("#questionStem"),
      progress: document.querySelector("#progressText")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      // 퀵 진입 버튼이 살아 있는지(잠금 상태 확인용)
      quickDisabled: (document.querySelector('[data-testid="quick-start-btn"]') as HTMLButtonElement | null)?.disabled ?? null,
      // 채점 잠금이면 보기가 잠긴다 — '이미 채점됨' 상태로 새 세션이 시작되는 결함 감지.
      locked: !!document.querySelector("#options .option[aria-disabled='true'], #options .option.locked"),
    };
  });
}

// UI 상태 영속화는 디바운스라, 클릭 직후 localStorage는 아직 이전 값이다.
// 기대 모드가 반영될 때까지 기다린 뒤 읽는다 — 안 그러면 지연을 결함으로 오인한다.
async function storeState(page: Page, expectMode?: string) {
  if (expectMode) {
    await page.waitForFunction(
      (m) => {
        const raw = localStorage.getItem("istqb-fl-v4-sample-ui-state");
        return raw ? JSON.parse(raw).mode === m : false;
      },
      expectMode,
      { timeout: 6000 },
    ).catch(() => {});
  }
  return page.evaluate(() => {
    const raw = localStorage.getItem("istqb-fl-v4-sample-ui-state");
    const ui = raw ? JSON.parse(raw) : {};
    return { mode: ui.mode ?? null, setId: ui.setId ?? null, quickItems: ui.quickDraw?.items?.length ?? 0 };
  });
}

async function toSegment(page: Page, mode: Seg) {
  await page.locator(`.segmented button[data-mode="${mode}"]`).click({ timeout: 5000 }).catch(() => {});
  // 응시 중 이탈 확인 모달이 뜨면 승인한다.
  for (const id of ["confirm-exit-exam-modal", "pending-set-change-modal"]) {
    const m = page.getByTestId(id);
    if (await m.count()) await m.locator("button").last().click({ timeout: 2000 }).catch(() => {});
  }
  await page.waitForTimeout(150);
}

async function toQuick(page: Page, size = "10") {
  await page.locator("#quickSize").selectOption(size).catch(() => {});
  await page.getByTestId("quick-start-btn").click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200);
}

test("전이: 세그먼트 4모드 ↔ 퀵 왕복 (8방향)", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");

  for (const m of SEGMENT_MODES) {
    // m → quick
    // 시험은 '시작'을 누르지 않은 상태에서만 다른 곳으로 나갈 수 있다 — 응시 중 퀵 잠금은
    // 의도된 동작이고 아래 별도 테스트가 검증한다. 여기서는 미시작 시험에서 전이한다.
    await toSegment(page, m);
    await toQuick(page);
    const inQuick = await snapshot(page);
    const store = await storeState(page, "quick");
    if (store.mode !== "quick") bad(`${m}→quick: 모드가 quick이 아님 (${store.mode})`);
    if (store.setId !== "QUICK") bad(`${m}→quick: setId 센티넬이 아님 (${store.setId})`);
    if (store.quickItems !== 10) bad(`${m}→quick: 추첨 수가 10이 아님 (${store.quickItems})`);
    if (!inQuick.stem) bad(`${m}→quick: 문항이 렌더되지 않음`);
    if (!/0 \/ 10/.test(inQuick.progress)) bad(`${m}→quick: 새 세션인데 진행률이 0이 아님 (${inQuick.progress})`);

    // quick → m
    await toSegment(page, m);
    const back = await snapshot(page);
    // 모드는 먼저 저장되고 setId 정정(사이드바 자동 선택)은 다음 저장 사이클에 실린다 —
    // 센티넬이 빠질 때까지 기다린 뒤 읽어야 지연을 결함으로 오인하지 않는다.
    await page.waitForFunction(() => {
      const raw = localStorage.getItem("istqb-fl-v4-sample-ui-state");
      return raw ? JSON.parse(raw).setId !== "QUICK" : false;
    }, undefined, { timeout: 6000 }).catch(() => {});
    const backStore = await storeState(page, m);
    if (backStore.setId === "QUICK") bad(`quick→${m}: setId가 센티넬로 남음`);
    if (backStore.mode !== m) bad(`quick→${m}: 모드가 ${m}이 아님 (${backStore.mode})`);
    if (m !== "exam" && !back.stem && m !== "review") {
      bad(`quick→${m}: 문항이 렌더되지 않음 (${JSON.stringify(back)})`);
    }
  }
  console.log(`· 4모드 × 왕복 = 8방향 검사 완료`);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("전이: 퀵 → 퀵 (연속 재시작)에서 잠금·진행이 초기화된다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");

  for (let round = 1; round <= 3; round += 1) {
    await toQuick(page, "10");
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    const s = await snapshot(page);
    if (!/0 \/ 10/.test(s.progress)) bad(`퀵 ${round}회차: 진행률이 0이 아님 (${s.progress})`);
    if (s.locked) bad(`퀵 ${round}회차: 시작하자마자 보기가 잠김(이전 채점 잔재)`);

    // 답하고 채점 — 다음 회차가 이 상태를 물려받으면 안 된다.
    await page.locator("#options .option").first().click();
    await page.getByTestId("grade-button").click();
    const c = page.getByTestId("confirm-grade");
    if (await c.count()) await c.click();
    await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();
  }
  console.log("· 퀵 연속 3회차 검사 완료");
  expect(problems, problems.join("\n")).toEqual([]);
});

test("전이: 시험 응시 중에는 퀵 진입이 잠기고, 채점 후 풀린다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");

  await toSegment(page, "exam");
  const gate = page.getByTestId("exam-start-btn");
  if (await gate.count()) await gate.click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  const during = await snapshot(page);
  if (during.quickDisabled !== true) bad(`응시 중인데 퀵 시작이 잠기지 않음 (${during.quickDisabled})`);

  // 채점하면 잠금이 풀려야 한다.
  await page.locator("#options .option").first().click();
  await page.getByTestId("grade-button").click();
  const c = page.getByTestId("confirm-grade");
  if (await c.count()) await c.click();
  await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();
  const after = await snapshot(page);
  if (after.quickDisabled !== false) bad(`채점 후에도 퀵 시작이 잠겨 있음 (${after.quickDisabled})`);

  expect(problems, problems.join("\n")).toEqual([]);
});

test("전이: 퀵 진행 중 세트 셀렉트를 바꿔도 퀵이 오염되지 않는다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");

  await toQuick(page, "10");
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await page.locator("#options .option").first().click();
  const beforeIds = (await page.evaluate(() => {
    const raw = localStorage.getItem("istqb-fl-v4-sample-ui-state");
    return raw ? JSON.parse(raw).quickDraw.items.map((i: { id: string }) => i.id) : [];
  })) as string[];

  // 세트 셀렉트는 퀵과 무관한 컨트롤이다 — 조작해도 퀵 추첨이 바뀌면 안 된다.
  const select = page.locator("#examSelect");
  const options = await select.locator("option").all();
  if (options.length > 1) {
    const other = await options[1].getAttribute("value");
    if (other) await select.selectOption(other).catch(() => {});
    await page.waitForTimeout(300);
  }
  const afterIds = (await page.evaluate(() => {
    const raw = localStorage.getItem("istqb-fl-v4-sample-ui-state");
    return raw ? JSON.parse(raw).quickDraw?.items?.map((i: { id: string }) => i.id) ?? [] : [];
  })) as string[];
  console.log(`· 세트 변경 전후 퀵 추첨: ${beforeIds.length} → ${afterIds.length}`);
  if (afterIds.length && JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
    bad("퀵 진행 중 세트를 바꿨더니 추첨이 달라짐");
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

/**
 * 5모드 전이 전수 — 25개 순서쌍을 기계적으로 전부 밟는다.
 *
 * 기존 커버리지를 세어 보니 exam·practice·quick은 모든 상대와 왕복하지만
 * random↔review는 어느 스펙도 밟지 않았다. "대부분 덮었다"와 "전수"는 다르므로
 * 목록을 코드가 만들게 해서 빠진 칸이 생기지 않게 한다.
 */
const ALL_MODES = ["practice", "exam", "random", "review", "quick"] as const;
type AnyMode = typeof ALL_MODES[number];

async function goAny(page: Page, m: AnyMode) {
  if (m === "quick") {
    await page.locator("#quickSize").selectOption("10").catch(() => {});
    await page.getByTestId("quick-start-btn").click({ timeout: 5000 }).catch(() => {});
  } else {
    await page.locator(`.segmented button[data-mode="${m}"]`).click({ timeout: 5000 }).catch(() => {});
    for (const id of ["confirm-exit-exam-modal", "pending-set-change-modal"]) {
      const md = page.getByTestId(id);
      if (await md.count()) await md.locator("button").last().click({ timeout: 2000 }).catch(() => {});
    }
  }
  await page.waitForTimeout(180);
}

/**
 * 진행 상태 — 같은 칸이라도 출발 모드가 어떤 상태냐에 따라 전이 경로가 갈린다.
 * 종전에는 25칸을 전부 '갓 진입' 상태로만 밟아, 응시 중 잠금이나 채점 완료 상태에서
 * 빠져나오는 경로는 이 스윕에 걸리지 않았다.
 *
 * 상태를 모드마다 정직하게 정의한다 — 연습·오답은 채점 개념이 없으므로 graded를 만들지
 * 않는다(없는 상태를 만든 척하면 칸 수만 늘고 검사는 무력해진다).
 */
type Progress = "fresh" | "inProgress" | "graded";
const STATES: Record<AnyMode, Progress[]> = {
  practice: ["fresh", "inProgress"],
  review: ["fresh", "inProgress"],
  exam: ["fresh", "inProgress", "graded"],
  random: ["fresh", "inProgress", "graded"],
  quick: ["fresh", "inProgress", "graded"],
};

/** from 모드를 주어진 상태까지 끌고 간다. */
async function reach(page: Page, m: AnyMode, st: Progress) {
  await goAny(page, m);
  if (st === "fresh") return;
  // 시험은 시작 게이트를 통과해야 문항이 나온다.
  const gate = page.getByTestId("exam-start-btn");
  if (await gate.count()) await gate.click({ timeout: 5000 }).catch(() => {});
  for (let i = 0; i < 2; i += 1) {
    const o = page.locator("#options .option").first();
    if (await o.count()) await o.click({ timeout: 3000 }).catch(() => {});
    const n = page.locator("#nextBtn");
    if ((await n.count()) && !(await n.isDisabled())) await n.click({ timeout: 3000 }).catch(() => {});
  }
  if (st !== "graded") return;
  await page.getByTestId("grade-button").click({ timeout: 5000 }).catch(() => {});
  const c = page.getByTestId("confirm-grade");
  if (await c.count()) await c.click({ timeout: 3000 }).catch(() => {});
  const res = page.getByTestId("result-summary");
  if (await res.count()) {
    await res.getByRole("button", { name: "닫기", exact: true }).click({ timeout: 5000 }).catch(() => {});
  }
}

/**
 * from 모드마다 별도 테스트로 낸다 — 65칸을 한 테스트에 몰면 직렬로 돌아 벽시계가
 * 그만큼 길어진다. 쪼개 두면 워커가 나눠 가져 스위트 전체 시간에 주는 영향이 작다.
 */
for (const from of ALL_MODES) {
  const states = STATES[from];
  test(`전이 전수: ${from}(${states.length}상태) → 5모드 어디로 가도 앱이 살아 있다`, async ({ page }) => {
    test.setTimeout(900_000);
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    const local: string[] = [];
    let walked = 0;

    for (const st of states) {
      for (const to of ALL_MODES) {
        await page.goto("/");
        await page.evaluate(() => localStorage.clear());
        await openProduct(page, "ISTQB");

        // 오답 모드로 가려면 오답이 있어야 한다 — 없으면 사양상 진입하지 않는다.
        if (from === "review" || to === "review") {
          await goAny(page, "random");
          await page.locator("#options .option").first().click();
          await page.getByTestId("grade-button").click();
          const c = page.getByTestId("confirm-grade");
          if (await c.count()) await c.click();
          await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });
          await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();
        }

        await reach(page, from, st);
        await goAny(page, to);
        walked += 1;

        const where = `${from}[${st}]→${to}`;
        const alive = await page.evaluate(() => ({
          shell: !!document.querySelector(".app-shell"),
          gate: !!document.querySelector('[data-testid="exam-start-gate"]'),
          stem: !!document.querySelector("#questionStem"),
          empty: !!document.querySelector(".nav-summary"),
          result: !!document.querySelector('[data-testid="result-summary"]'),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        }));
        if (!alive.shell) local.push(`${where}: 앱 셸이 사라짐`);
        // 지문·게이트·빈 안내·결과 중 하나는 있어야 한다 — 넷 다 없으면 흰 화면이다.
        if (!alive.stem && !alive.gate && !alive.empty && !alive.result) local.push(`${where}: 화면이 비었다`);
        if (alive.overflow) local.push(`${where}: 문서 가로 넘침`);
      }
    }
    console.log(`· 전이 ${from}: ${walked}칸(${states.length}상태 × 5모드) 검사 완료`);
    if (errs.length) local.push(`JS 오류: ${JSON.stringify(errs.slice(0, 5))}`);
    for (const l of local) console.log("  ✗ " + l);
    expect(local, local.join("\n")).toEqual([]);
  });
}
