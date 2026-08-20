import { test, expect, Page } from "@playwright/test";
import { openProduct, answerCurrent } from "./helpers";

/**
 * 전이 매트릭스 — 퀵을 포함한 4모드(연습·시험·오답·퀵).
 *
 * react-state-matrix는 퀵이 생기기 전에 쓰였다. 퀵은 세그먼트 밖 별도 진입로이고
 * setId가 센티넬(QUICK)이라, 세트를 전제하는 전이 규칙이 그대로 통하지 않는다 —
 * 실제로 '두 번째 퀵이 잠긴 채 시작', '퀵 직후 오답 재풀이 무동작'이 이 조합에서
 * 나왔다. 4×4 = 16칸 왕복을 기계적으로 밟아 남은 칸을 확인한다.
 *
 * 종전에는 랜덤을 넣어 5×5 = 25칸이었다. 랜덤이 세그먼트에서 빠지면서(퀵에 흡수)
 * 이 매트릭스의 대상이 아니게 됐다 — 살아 있는 랜덤(챕터 미니 시험)은 진입로가
 * 통계라 '세그먼트 왕복'으로는 도달하지 않는다.
 */

// 세그먼트에 남은 모드 — random은 빠졌다(퀵에 흡수). 랜덤 모드 자체는 살아 있지만
// 통계의 챕터 미니 시험으로만 들어가므로 '세그먼트 왕복'의 대상이 아니다.
const SEGMENT_MODES = ["practice", "exam", "review"] as const;
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
      // 퀵의 '진행' — 이 모드에는 진행률(분모)이 없어 헤더 점수판의 첫 칸이 그 자리를 맡는다.
      solved: document.querySelector(".quick-scoreboard .qs-item b")?.textContent?.trim() ?? null,
      // 퀵 진입이 잠겼는지 — 진입로가 모드 세그먼트로 옮겨져 그 버튼의 disabled를 본다.
      // (종전에는 퀵 패널의 시작 버튼을 봤는데, 그 패널은 이제 퀵 안에서만 렌더된다.)
      quickDisabled: (document.querySelector('.segmented button[data-mode="quick"]') as HTMLButtonElement | null)?.disabled ?? null,
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

async function toQuick(page: Page) {
  // 퀵 진입로는 모드 세그먼트다 — 문항 수 콤보와 '시작' 버튼을 거치던 두 단계는 없어졌다.
  await page.locator('.segmented button[data-mode="quick"]').click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200);
}

test("전이: 세그먼트 3모드 ↔ 퀵 왕복 (6방향)", async ({ page }) => {
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
    // 문항 수를 고르지 않는다 — 전 세트를 섞어 낸다. 한 세트 분량(ISTQB 최대 70)을
    // 넘는지로 '전 세트 출제'를 본다(정확한 수는 재수록 제거 때문에 데이터에 달렸다).
    if (!(store.quickItems > 70)) bad(`${m}→quick: 전 세트 출제가 아님 (추첨 ${store.quickItems})`);
    if (!inQuick.stem) bad(`${m}→quick: 문항이 렌더되지 않음`);
    if (inQuick.solved !== "0") bad(`${m}→quick: 새 세션인데 진행이 0이 아님 (${inQuick.solved})`);

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
  console.log(`· 3모드 × 왕복 = 6방향 검사 완료`);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("전이: 퀵 → 퀵 (연속 재시작)에서 잠금·진행이 초기화된다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");

  for (let round = 1; round <= 3; round += 1) {
    // 1회차는 세그먼트로 들어가고, 이후는 '다시 섞어 시작'이 재시작 경로다 —
    // 이미 퀵일 때 같은 세그먼트를 다시 누르는 것은 무동작이 사양이다(잠금 우회 방지).
    if (round === 1) await toQuick(page);
    else await page.getByTestId("quick-start-btn").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    const s = await snapshot(page);
    if (s.solved !== "0") bad(`퀵 ${round}회차: 진행이 0이 아님 (${s.solved})`);
    if (s.locked) bad(`퀵 ${round}회차: 시작하자마자 보기가 잠김(이전 채점 잔재)`);

    // 답하고 그 문항을 채점 — 다음 회차가 이 상태(답안·채점 표시·잠금)를 물려받으면 안 된다.
    await answerCurrent(page); // 복수정답도 다 고른 뒤 채점까지 한다
    await expect(page.locator("#feedback")).toBeVisible({ timeout: 20_000 });
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
 * 이제 컨트롤 자체를 없애 구조적으로 막는다(종전에는 남겨 두고 disabled만 걸었는데,
 * 그러면 퀵으로 들어오기 직전 세트 이름이 계속 떠 있어 "이 세트를 풀고 있다"는 잘못된
 * 읽기를 화면이 제공한다). 그래서 검사도 바꾼다 —
 * (1) 퀵 중에 세트 셀렉트가 DOM에서 사라지는가, (2) 그 사이 추첨과 **진행**이 그대로인가.
 */
test("전이: 퀵 진행 중에는 세트 셀렉트가 사라져 추첨도 진행도 오염되지 않는다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");

  await toQuick(page);
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  // 퀵의 진행은 채점이 올린다 — 고르기만 해서는 0 그대로다(한 문항씩 채점하는 모드).
  // answerCurrent가 고르고 채점까지 한다. 보기를 하나만 누르고 채점 버튼을 직접 클릭하면,
  // 복수정답 문항이 뽑힌 회차에서 버튼이 disabled라 click()이 actionability를 기다리며
  // 스펙 예산 300초를 통째로 태운다(F-5 — 단언 실패보다 진단이 어려운 실패 방식이다).
  await answerCurrent(page);
  const solved = page.locator(".quick-scoreboard .qs-item").first().locator("b");
  await expect(solved).toHaveText("1");

  const readDraw = () => page.evaluate(() => {
    const raw = localStorage.getItem("istqb-fl-v4-sample-ui-state");
    return raw ? JSON.parse(raw).quickDraw?.items?.map((i: { id: string }) => i.id) ?? [] : [];
  }) as Promise<string[]>;
  const beforeIds = await readDraw();

  // 사라져 있어야 한다 — 여기가 이번에 세운 계약이다.
  await expect(page.locator("#examSelect"), "퀵 진행 중인데 세트 셀렉트가 남아 있다").toHaveCount(0);

  // 저장된 setId도 센티넬이어야 한다 — 실재 세트로 남으면 답안 키가 그 세트로 갈려
  // 진행이 통째로 사라진다(#172가 정확히 그 경로였다).
  const storedSetId = await page.evaluate(() => {
    const raw = localStorage.getItem("istqb-fl-v4-sample-ui-state");
    return raw ? JSON.parse(raw).setId : null;
  });
  if (storedSetId !== "QUICK") bad(`퀵인데 저장된 setId가 센티넬이 아님 (${storedSetId})`);

  await page.waitForTimeout(300);
  const afterIds = await readDraw();
  const afterSolved = await solved.textContent();
  console.log(`· 추첨 ${beforeIds.length} → ${afterIds.length} · 진행 ${afterSolved}`);
  if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) bad("퀵 추첨이 달라졌다");
  if (afterSolved !== "1") bad(`진행이 1 → ${afterSolved}로 변했다`);
  expect(problems, problems.join("\n")).toEqual([]);
});

/**
 * 4모드 전이 전수 — 16개 순서쌍을 기계적으로 전부 밟는다.
 *
 * "대부분 덮었다"와 "전수"는 다르므로 목록을 코드가 만들게 해서 빠진 칸이 생기지 않게 한다.
 * (종전에는 random을 포함한 5모드 25칸이었다. random이 세그먼트에서 빠지면서 4모드 16칸이
 *  된다 — 살아 있는 랜덤은 진입 절차가 달라 이 순회의 대상이 아니다.)
 */
// random은 세그먼트에서 빠져(퀵에 흡수) goAny의 진입 방식으로 도달할 수 없다.
const ALL_MODES = ["practice", "exam", "review", "quick"] as const;
type AnyMode = typeof ALL_MODES[number];

/**
 * 모드 진입 시도. 실패를 삼키는 이유는 "전이가 거절될 수 있다"가 사양이기 때문이다
 * (응시 중 잠금, 오답 없음). 다만 거절과 '컨트롤이 아예 없다'는 다르다 — 후자는 제품이
 * 아니라 검사가 깨진 것이므로 여기서 소리를 낸다. 세그먼트 버튼 4개는 어떤 상태에서도
 * 항상 렌더되므로(비활성일 수는 있어도) 부재는 곧 셀렉터 부패다.
 * 퀵도 이제 같은 세그먼트로 들어간다 — 전용 진입로(문항 수 콤보 + 시작 버튼)가 없어져
 * 예외 분기가 필요 없다.
 */
async function goAny(page: Page, m: AnyMode) {
  {
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

test("전이 전수: 4모드 16개 순서쌍을 모두 밟아도 앱이 살아 있다", async ({ page }) => {
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
      // review가 관여하는 칸을 실제로 밟으려면 먼저 오답을 만들어 둔다.
      // (종전에는 랜덤으로 오답을 만들었는데 그 진입로가 사라졌다 — 시험이 같은 역할을 한다.)
      if (from === "review" || to === "review") {
        await goAny(page, "exam");
        const gate = page.getByTestId("exam-start-btn");
        if (await gate.count()) await gate.click();
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
      // "앱이 살아 있다"는 그대로 참이라 16칸 전부가 조용히 초록으로 남는다
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
  console.log(`· 4모드 전이 전수 ${walked}칸 (4×4) · 실제 전이 ${landed}칸`);
  if (refused.length) console.log(`  · 전이하지 않은 칸: ${refused.join(", ")}`);
  if (errs.length) bad(`JS 오류: ${JSON.stringify(errs.slice(0, 5))}`);
  // 순회 자체가 끝까지 돌았는가. 중간에서 새면 아래 검사들이 덜 밟은 상태로 통과한다.
  expect(walked, "순회가 16칸을 다 밟지 못했다").toBe(16);
  // 그리고 그 칸들이 실제로 모드를 옮겼는가. 실측이 16/16이므로 하한(>=12 따위)이 아니라
  // 16을 그대로 요구한다 — 여유를 둔 하한은 "몇 칸이 조용히 무동작이어도 통과"라서
  // 지금 없애려는 결함을 그대로 다시 만든다. 거절이 사양인 칸이 생기면 그때
  // 그 칸을 이름으로 예외 처리하고 숫자를 낮춘다(무엇이 왜 빠지는지 코드에 남게).
  expect(landed, `16칸 중 ${landed}칸만 전이했다 — 진입 경로가 죽었을 수 있다(${refused.join(", ")})`)
    .toBe(16);
  expect(problems, problems.join("\n")).toEqual([]);
});
