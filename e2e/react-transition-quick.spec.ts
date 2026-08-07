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

/**
 * 종전 이 검사는 quickDraw.items(추첨 목록)만 비교했다. 그런데 그건 세트를 바꿔도 원래
 * 바뀌지 않는다 — 퀵은 추첨한 문항을 그대로 들고 있기 때문이다. 즉 "안 바뀌는 것"만 보고
 * "오염되지 않았다"고 판정했고, 실제 피해는 놓쳤다: 답안 키가 `${setId}-${mode}-${qid}`라
 * 센티넬(QUICK-quick-*)로 저장한 답을 바뀐 세트 기준으로 찾게 돼 진행률이 0으로 떨어졌다
 * (실측 2/10 → 0/10, 새로고침해도 복구 안 됨 · #172).
 *
 * 이제 컨트롤 자체를 잠가 구조적으로 막는다. 그래서 검사도 바꾼다 —
 * (1) 퀵 중에는 세트 셀렉트가 잠겨 있는가, (2) 조작을 시도해도 추첨과 **진행률**이
 * 그대로인가. (2)의 진행률이 종전에 빠져 있던 부분이다.
 */
test("전이: 퀵 진행 중에는 세트 셀렉트가 잠겨 추첨도 진행도 오염되지 않는다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");

  await toQuick(page, "10");
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await page.locator("#options .option").first().click();
  await expect(page.locator("#progressText")).toContainText("1 / 10");

  const readDraw = () => page.evaluate(() => {
    const raw = localStorage.getItem("istqb-fl-v4-sample-ui-state");
    return raw ? JSON.parse(raw).quickDraw?.items?.map((i: { id: string }) => i.id) ?? [] : [];
  }) as Promise<string[]>;
  const beforeIds = await readDraw();
  const beforeProgress = await page.locator("#progressText").textContent();

  // 잠겨 있어야 한다 — 여기가 이번에 세운 계약이다.
  const select = page.locator("#examSelect");
  await expect(select, "퀵 진행 중인데 세트 셀렉트가 열려 있다").toBeDisabled();

  // 그래도 조작을 시도해 본다(잠금이 표시만이고 실제로는 먹히는 경우를 잡는다).
  // 비활성 컨트롤이라 대기가 길어지므로 짧은 타임아웃으로 끊는다.
  const options = await select.locator("option").all();
  if (options.length > 1) {
    const other = await options[1].getAttribute("value");
    if (other) await select.selectOption(other, { timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(300);
  }

  const afterIds = await readDraw();
  const afterProgress = await page.locator("#progressText").textContent();
  console.log(`· 추첨 ${beforeIds.length} → ${afterIds.length} · 진행 ${beforeProgress} → ${afterProgress}`);
  if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) bad("퀵 추첨이 달라졌다");
  // 종전 검사에 없던 축 — 답안 키가 갈리면 여기가 0으로 떨어진다.
  if (beforeProgress !== afterProgress) bad(`진행률이 ${beforeProgress} → ${afterProgress}로 변했다`);
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

/**
 * 모드 진입 시도. 실패를 삼키는 이유는 "전이가 거절될 수 있다"가 사양이기 때문이다
 * (응시 중 잠금, 오답 없음). 다만 거절과 '컨트롤이 아예 없다'는 다르다 — 후자는 제품이
 * 아니라 검사가 깨진 것이므로 여기서 소리를 낸다. 세그먼트 버튼 4개는 어떤 상태에서도
 * 항상 렌더되므로(비활성일 수는 있어도) 부재는 곧 셀렉터 부패다.
 * 퀵 시작 버튼만은 예외로 사라진다: 퀵 진행 중 같은 문항 수면 감춰 둔다(Sidebar 주석).
 */
async function goAny(page: Page, m: AnyMode) {
  if (m === "quick") {
    await page.locator("#quickSize").selectOption("10").catch(() => {});
    await page.getByTestId("quick-start-btn").click({ timeout: 5000 }).catch(() => {});
  } else {
    const btn = page.locator(`.segmented button[data-mode="${m}"]`);
    if (!(await btn.count())) bad(`${m}: 세그먼트 버튼이 DOM에 없다 — 셀렉터가 썩었다`);
    await btn.click({ timeout: 5000 }).catch(() => {});
    for (const id of ["confirm-exit-exam-modal", "pending-set-change-modal"]) {
      const md = page.getByTestId(id);
      if (await md.count()) await md.locator("button").last().click({ timeout: 2000 }).catch(() => {});
    }
  }
  await page.waitForTimeout(180);
}

test("전이 전수: 5모드 25개 순서쌍을 모두 밟아도 앱이 살아 있다", async ({ page }) => {
  // 예산 5분(실측 46초 단독). 잡 타임아웃보다 작게 두는 이유는 react-fullsweep 주석 참고.
  test.setTimeout(300_000);
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

  let walked = 0;
  let landed = 0;
  const refused: string[] = [];
  for (const from of ALL_MODES) {
    for (const to of ALL_MODES) {
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await openProduct(page, "ISTQB");

      // 오답 모드로 가려면 오답이 있어야 한다 — 없으면 사양상 진입하지 않는다.
      // random/review가 관여하는 칸을 실제로 밟으려면 먼저 오답을 만들어 둔다.
      if (from === "review" || to === "review") {
        await goAny(page, "random");
        await page.locator("#options .option").first().click();
        await page.getByTestId("grade-button").click();
        const c = page.getByTestId("confirm-grade");
        if (await c.count()) await c.click();
        await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });
        await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();
      }

      await goAny(page, from);
      await goAny(page, to);
      walked += 1;

      // 전이가 실제로 일어났는지 센다. 이 확인이 없으면 진입 경로가 무동작이어도
      // "앱이 살아 있다"는 그대로 참이라 25칸 전부가 조용히 초록으로 남는다
      // (react-quick에서 같은 결함을 겪었다: 없는 셀렉터로 20문항을 한 번도 밟지 않았다).
      // 칸별로 to와 일치할 것을 요구하지는 않는다 — 거절이 사양인 칸이 있다.
      if ((await storeState(page, to)).mode === to) landed += 1;
      else refused.push(`${from}→${to}`);

      // 어느 칸에서도 앱이 죽거나 화면이 비면 안 된다.
      const alive = await page.evaluate(() => ({
        shell: !!document.querySelector(".app-shell"),
        gate: !!document.querySelector('[data-testid="exam-start-gate"]'),
        stem: !!document.querySelector("#questionStem"),
        empty: !!document.querySelector(".nav-summary"),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      }));
      if (!alive.shell) bad(`${from}→${to}: 앱 셸이 사라짐`);
      // 지문·게이트·빈 안내(오답 없음 등) 중 하나는 있어야 한다 — 셋 다 없으면 흰 화면이다.
      if (!alive.stem && !alive.gate && !alive.empty) bad(`${from}→${to}: 화면이 비었다`);
      if (alive.overflow) bad(`${from}→${to}: 문서 가로 넘침`);
    }
  }
  console.log(`· 5모드 전이 전수 ${walked}칸 (5×5) · 실제 전이 ${landed}칸`);
  if (refused.length) console.log(`  · 전이하지 않은 칸: ${refused.join(", ")}`);
  if (errs.length) bad(`JS 오류: ${JSON.stringify(errs.slice(0, 5))}`);
  // 순회 자체가 끝까지 돌았는가. 중간에서 새면 아래 검사들이 덜 밟은 상태로 통과한다.
  expect(walked, "순회가 25칸을 다 밟지 못했다").toBe(25);
  // 그리고 그 칸들이 실제로 모드를 옮겼는가. 실측이 25/25이므로 하한(>=20 따위)이 아니라
  // 25를 그대로 요구한다 — 여유를 둔 하한은 "몇 칸이 조용히 무동작이어도 통과"라서
  // 지금 없애려는 결함을 그대로 다시 만든다. 거절이 사양인 칸이 생기면 그때
  // 그 칸을 이름으로 예외 처리하고 숫자를 낮춘다(무엇이 왜 빠지는지 코드에 남게).
  expect(landed, `25칸 중 ${landed}칸만 전이했다 — 진입 경로가 죽었을 수 있다(${refused.join(", ")})`)
    .toBe(25);
  expect(problems, problems.join("\n")).toEqual([]);
});
