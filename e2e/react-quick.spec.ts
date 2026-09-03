import { test, expect, Page } from "@playwright/test";
import { openProduct, startQuick, answerQuick, solveQuickOne, modeBtn } from "./helpers";

type DrawItem = { id: string; setId: string };

/**
 * ── 출제 순서를 갈아 끼우는 도구 ──────────────────────────────────────────
 *
 * 퀵은 제품 전 세트(수백 문항)를 담으므로 "끝에 닿았을 때"와 "특정 유형이 나왔을 때"를
 * 실제 뽑기에 맡기면 검사가 성립하지 않는다(끝까지 풀 수 없고, 유형은 운에 달렸다).
 * 그래서 앱이 방금 만든 저장본의 items만 바꿔 끼운다 — 저장 형식도 문항도 앱과 데이터에서
 * 그대로 가져오므로 문항 id를 스펙에 박지 않는다.
 */
async function readQuickDraw(page: Page): Promise<DrawItem[]> {
  return page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.endsWith("-ui-state")) continue;
      try {
        const items = (JSON.parse(localStorage.getItem(key) ?? "{}").quickDraw?.items ?? []) as DrawItem[];
        if (items.length) return items;
      } catch { /* 손상된 값은 건너뛴다 */ }
    }
    return [] as DrawItem[];
  });
}

async function writeQuickDraw(page: Page, items: DrawItem[]) {
  const applied = await page.evaluate((next) => {
    type Ui = { index?: number; quickDraw?: { items: unknown[] } };
    let hits = 0;
    for (const key of Object.keys(localStorage)) {
      // ui-state는 최상위에, 스냅샷은 uiState 아래에 같은 값을 들고 있다.
      // 복원은 스냅샷을 우선해 읽으므로 둘 다 고쳐야 한다.
      const isUi = key.endsWith("-ui-state");
      const isSnapshot = key.endsWith("-history-snapshot");
      if (!isUi && !isSnapshot) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as Ui & { uiState?: Ui };
        const ui = isUi ? parsed : parsed.uiState;
        if (!ui?.quickDraw) continue;
        ui.quickDraw.items = next;
        ui.index = 0;
        localStorage.setItem(key, JSON.stringify(parsed));
        hits += 1;
      } catch { /* 손상된 값은 건너뛴다 */ }
    }
    return hits;
  }, items);
  expect(applied, "저장된 퀵 출제 순서를 찾지 못했다 — 검사 전제가 깨졌다").toBeGreaterThan(0);
}

/** 저장(디바운스 500ms)이 끝나기를 기다렸다가 지금 저장된 출제 순서를 읽는다. */
async function savedQuickDraw(page: Page): Promise<DrawItem[]> {
  await expect
    .poll(() => readQuickDraw(page).then((i) => i.length), { timeout: 10_000 })
    .toBeGreaterThan(0);
  return readQuickDraw(page);
}

/**
 * 출제 순서를 주어진 항목으로 바꾼 뒤 그 제품으로 다시 들어간다.
 *
 * 순서가 중요하다 — **먼저 게이트로 되돌린 다음에 고친다.** 페이지를 떠나는 순간
 * QuestionWorkspace의 정리(flushPersist)가 메모리의 출제 순서를 그대로 다시 쓰므로,
 * 떠나기 전에 고쳐 두면 그 쓰기에 덮인다. 게이트에서는 activeProduct가 없어
 * 저장 경로가 전부 조기 반환하므로 이 사이에 쓴 값이 그대로 복원에 들어간다.
 */
async function reopenQuickWith(page: Page, product: "ISTQB" | "CSTS", items: DrawItem[]) {
  await page.reload();
  const gate = page.getByRole("button", { name: product }).first();
  await expect(gate).toBeVisible({ timeout: 20_000 });
  await writeQuickDraw(page, items);
  await gate.click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
}

/**
 * 지금 화면의 지문 텍스트. **글이 실제로 들어온 뒤에** 읽는다.
 *
 * `#questionStem`은 RichText가 effect에서 DOM을 채우는 컨테이너라, 요소는 먼저 보이고
 * 글은 한 틱 뒤에 온다. 그 사이에 집으면 빈 문자열을 기준으로 삼게 되는데, 그러면
 * "문항이 안 바뀌었다"를 재는 검사는 헛되이 실패하고 "바뀌었다"를 재는 검사는 빈 값과
 * 비교해 그냥 통과한다 — 둘 다 실제 동작을 재지 못한다(전수 실행에서 전자로 실패했다).
 */
async function stemText(page: Page): Promise<string> {
  const el = page.locator("#questionStem");
  await expect(el, "지문 텍스트가 렌더되지 않았다").toHaveText(/\S/, { timeout: 15_000 });
  return el.innerText();
}

/** 서답형(단일 칸) 문항 하나를 데이터에서 찾는다 — CSTS에만 있다. */
async function findShortAnswerItem(page: Page): Promise<DrawItem> {
  const found = await page.evaluate(async () => {
    const idx = await fetch("data/index.json").then((r) => r.json());
    const sets = (idx.sets as { id: string; certification: string; path: string }[])
      .filter((s) => s.certification.toLowerCase() === "csts");
    for (const s of sets) {
      const raw = await fetch(`data/${s.path.replace(/^\.\//, "")}`).then((r) => r.json());
      const questions = (Array.isArray(raw) ? raw : raw.questions ?? []) as
        { id?: string; type?: string; answerParts?: unknown[] }[];
      const q = questions.find((x) => x.type === "short_answer" && !x.answerParts?.length && x.id);
      if (q?.id) return { id: q.id, setId: s.id };
    }
    return null;
  });
  expect(found, "CSTS에 서답형 문항이 없다 — 검사 전제가 깨졌다").not.toBeNull();
  return found as DrawItem;
}

/**
 * 퀵 — 제품의 전 세트를 섞어 한 문항씩 무한으로 푸는 모드(구 '랜덤'을 흡수했다).
 *
 * 사양의 뼈대는 넷이다.
 *  1) 풀면 바로 정답·해설이 보인다(채점 단계 없음).
 *  2) '다음 문제'로만 넘어간다 — 되돌아갈 수 없고 문항 목록도 없다.
 *  3) 진행·정답·오답·연속 정답을 상시 보여준다(진행률·타이머 없음).
 *  4) 아무 기록도 남지 않는다 — 회차 이력·요약·타임라인·오답 노트 어디에도.
 *
 * setId가 센티넬(QUICK)이라 세트를 전제하는 경로가 조용히 어긋날 수 있다 — 그 지점들도 함께 고정한다.
 */

test.describe("퀵 — 진입과 기본 흐름", () => {
  test("시작하면 문항이 뜨고, 답하면 바로 정답·해설이 열린다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    // 채점 전 공개가 없는 시험과 달리, 퀵은 고르는 즉시 피드백이다.
    await expect(page.locator("#feedback")).toHaveCount(0);
    await answerQuick(page);
    await expect(page.locator("#feedback")).toBeVisible();
  });

  test("답을 확인하기 전에는 '다음 문제'가 잠겨 있다", async ({ page }) => {
    // 확인 없이 넘기면 그 문항이 집계에서 빠져 "진행 3인데 정답+오답은 2"가 된다.
    await startQuick(page, "ISTQB");
    const next = page.getByTestId("quick-next-btn");
    await expect(next).toBeDisabled();
    await answerQuick(page);
    await expect(next).toBeEnabled();
  });

  test("확인한 문항은 잠긴다 — 답을 바꿔 집계를 흔들 수 없다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    await answerQuick(page);
    const opts = page.locator("#options .option");
    if (await opts.count()) await expect(opts.first()).toBeDisabled();
  });

  test("'다음 문제'를 누르면 새 문항으로 넘어간다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    // 지문은 글이 들어온 뒤에 읽는다 — 빈 문자열을 기준으로 잡으면 "달라졌다"가
    // 그냥 참이 돼, 넘어가지 못하는 결함도 통과시킨다(stemText 주석 참고).
    const first = await stemText(page);
    await solveQuickOne(page);
    await expect(page.locator("#feedback")).toHaveCount(0); // 새 문항은 미공개 상태
    expect(await stemText(page), "같은 문항이 다시 떴다").not.toBe(first);
  });

  test("채점 버튼과 결과 요약이 없다 — 회차라는 단위가 없는 모드다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    await expect(page.getByTestId("grade-button")).toHaveCount(0);
    await expect(page.getByTestId("grade-button-m")).toHaveCount(0);
    await expect(page.getByTestId("result-open")).toHaveCount(0);
  });
});

test.describe("퀵 — 점수판", () => {
  test("진행·정답·오답·연속을 보여주고 풀 때마다 오른다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    const board = page.getByTestId("quick-scoreboard");
    await expect(board).toBeVisible();
    await expect(page.getByTestId("qs-solved")).toHaveText("0");

    await answerQuick(page);
    await expect(page.getByTestId("qs-solved")).toHaveText("1");
    // 정답이든 오답이든 둘 중 하나는 1이 된다(합이 진행과 같다).
    const correct = Number(await page.getByTestId("qs-correct").innerText());
    const wrong = Number(await page.getByTestId("qs-wrong").innerText());
    expect(correct + wrong).toBe(1);
    // 맞혔으면 연속이 1, 틀렸으면 0으로 끊긴다.
    await expect(page.getByTestId("qs-streak")).toHaveText(correct === 1 ? "1" : "0");
  });

  test("세 문항을 풀면 진행이 3이고 정답+오답과 맞는다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    for (let i = 0; i < 3; i += 1) await solveQuickOne(page);
    await expect(page.getByTestId("qs-solved")).toHaveText("3");
    const correct = Number(await page.getByTestId("qs-correct").innerText());
    const wrong = Number(await page.getByTestId("qs-wrong").innerText());
    expect(correct + wrong, "진행과 정답+오답이 어긋난다").toBe(3);
  });

  test("새로고침해도 이어풀기 배너 없이 점수판만으로 위치를 말한다", async ({ page }) => {
    // 배너는 '현재 N / 총계'라는 분모 있는 문법인데 퀵은 분모를 없앤 모드다. 띄우면
    // 배너의 커서 위치와 바로 아래 점수판의 진행(확정 수)이 서로 다른 숫자라,
    // 같은 화면이 "지금 어디인가"에 두 번 다르게 답한다(실측: 배너 3 / 점수판 2).
    await startQuick(page, "ISTQB");
    for (let i = 0; i < 2; i += 1) await solveQuickOne(page);
    await page.waitForTimeout(900); // 저장 디바운스

    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).first().click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("resume-banner"), "퀵에 분모 있는 배너가 떴다").toHaveCount(0);
    await expect(page.getByTestId("quick-scoreboard")).toBeVisible();
  });

  test("새로고침해도 진행 집계와 위치가 유지된다", async ({ page }) => {
    // 집계는 답안에서 파생하므로 화면 상태가 날아가도 수치가 흔들리면 안 된다.
    await startQuick(page, "ISTQB");
    for (let i = 0; i < 2; i += 1) await solveQuickOne(page);
    const before = await page.getByTestId("qs-solved").innerText();

    // 새로고침하면 앱은 항상 제품 게이트로 돌아간다(resetToGate) — 실사용자와 동일하게
    // 제품을 다시 고르면 저장된 출제 순서·커서·답안이 복원돼야 한다.
    await page.reload();
    await page.getByRole("button", { name: "ISTQB" }).first().click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("qs-solved")).toHaveText(before);
  });
});

test.describe("퀵 — 없어진 것들", () => {
  test("타이머가 없다", async ({ page }) => {
    // 기록을 남기지 않는 모드라 시간을 잴 이유가 없다.
    await startQuick(page, "ISTQB");
    await expect(page.locator("#timerText")).toHaveCount(0);
  });

  test("문항 목록·점프 진입로가 없다", async ({ page }) => {
    // 목록은 "정해진 N문항 중 어디쯤인가"를 위한 장치인데 퀵에는 그 N이 없다.
    await startQuick(page, "ISTQB");
    await expect(page.locator(".palette-block")).toHaveCount(0);
    await expect(page.getByTestId("palette-jump-btn")).toHaveCount(0);
    await expect(page.getByTestId("jump-pin")).toHaveCount(0);
  });

  test("이전 문제로 돌아가는 버튼이 없다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    await expect(page.locator("#prevBtn")).toHaveCount(0);
    await expect(page.locator("#nextBtn")).toHaveCount(0);
  });

  test("사이드바 진행/시간 줄이 숨는다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    await expect(page.locator("#progressText")).toHaveCount(0);
  });

  test("문항 수 선택이 없다 — 끝이 정해지지 않은 모드다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await expect(page.locator("#quickSize")).toHaveCount(0);
  });

  test("모드 세그먼트에 '랜덤'이 없다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await expect(page.locator('.segmented button[data-mode="random"]')).toHaveCount(0);
    for (const label of ["연습", "시험", "오답"]) {
      await expect(modeBtn(page, label)).toBeVisible();
    }
  });

  test("첫 화면(제품 게이트)도 폐지된 사양을 광고하지 않는다", async ({ page }) => {
    // 세그먼트만 보던 위 검사는 게이트를 지나쳤다 — 랜덤 폐지 뒤에도 게이트 카드가
    // "연습·시험·랜덤·오답·퀵 5가지 모드"와 "퀵 모드 오답은 24시간 임시 목록"을
    // 계속 광고했다. 앱을 여는 사람이 가장 먼저 읽는 문장이라 여기서 고정한다.
    await page.goto("/");
    const card = page.locator(".gate-content-list");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card, "게이트가 폐지된 '랜덤' 모드를 안내한다").not.toContainText("랜덤");
    await expect(card, "게이트가 없어진 퀵 임시 목록(24시간)을 안내한다").not.toContainText("24시간");
    // 모드 개수를 박아 둔다 — 모드가 늘거나 줄 때 이 검사가 먼저 실패해 게이트를 함께
    // 고치게 만든다(랜덤 폐지 때 게이트만 남았던 것이 정확히 이 신호가 없어서였다).
    await expect(card).toContainText("5가지 모드");
    await expect(card).toContainText("4지선다");
  });
});

test.describe("퀵 — 기록을 남기지 않는다", () => {
  test("여러 문항을 풀어도 학습 통계에 회차가 쌓이지 않는다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    for (let i = 0; i < 3; i += 1) await solveQuickOne(page);

    await page.getByTestId("stats-open").click();
    // 회차가 하나도 없을 때의 빈 안내가 그대로여야 한다.
    await expect(page.getByTestId("stats-dashboard")).toContainText("아직 채점한 기록이 없습니다");
  });

  test("퀵 오답은 오답 노트에 들어가지 않는다", async ({ page }) => {
    // 세트를 다 푼 것이 아니므로 세트 오답 버킷에 섞이면 안 된다.
    await startQuick(page, "ISTQB");
    for (let i = 0; i < 3; i += 1) await solveQuickOne(page);

    await page.getByRole("button", { name: /오답 노트/ }).first().click();
    await expect(page.getByTestId("wrong-note")).toContainText("표시할 오답이 없습니다");
  });

  test("퀵에서는 '오답 다시 풀기' 버튼을 내린다", async ({ page }) => {
    // 퀵 오답은 세트 버킷에 담기지 않아 다시 풀 대상이 구조적으로 없다.
    await startQuick(page, "ISTQB");
    await expect(page.getByRole("button", { name: "오답 다시 풀기" })).toHaveCount(0);
  });
});

test.describe("퀵 — 세트 센티넬의 파급", () => {
  test("퀵 중에는 세트를 바꿀 수 없고 이유를 밝힌다", async ({ page }) => {
    // 바꿔도 출제는 그대로인데 답안 키가 어긋나 진행이 통째로 사라진다.
    await startQuick(page, "ISTQB");
    await expect(page.getByTestId("set-select")).toBeDisabled();
    await expect(page.getByTestId("quick-set-lock-hint")).toBeVisible();
  });

  test("모드 세그먼트가 비어 있는 이유와 돌아오는 길을 밝힌다", async ({ page }) => {
    // 퀵은 세그먼트 밖의 별도 진입로라 퀵을 푸는 동안 세 버튼이 모두 선택 해제된다 —
    // 그 상태를 설명 없이 두면 그룹이 "아무것도 안 골랐다"로만 보인다.
    await startQuick(page, "ISTQB");
    const segment = page.locator('.segmented[aria-label="풀이 모드"]');
    await expect(segment.locator('button[aria-pressed="true"]')).toHaveCount(0);

    const caption = page.getByTestId("mode-caption");
    await expect(caption).toContainText("퀵");
    await expect(caption, "세트 풀이로 돌아가는 길을 말하지 않는다").toContainText("돌아갑니다");
    // 보조기기에도 전달돼야 한다 — 캡션을 읽지 않으면 선택 없는 그룹으로만 들린다.
    await expect(segment).toHaveAttribute("aria-describedby", "modeCaption");
    await expect(caption).toHaveAttribute("id", "modeCaption");
  });

  test("다른 모드로 나가면 세트 선택이 다시 열린다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    await modeBtn(page, "연습").click();
    await expect(page.getByTestId("set-select")).toBeEnabled();
  });

  test("'다시 섞어 시작'은 진행을 처음부터 되돌린다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    for (let i = 0; i < 2; i += 1) await solveQuickOne(page);
    await expect(page.getByTestId("qs-solved")).toHaveText("2");

    const restart = page.getByTestId("quick-start-btn");
    if (!(await restart.isVisible())) await page.getByTestId("drawer-open").click();
    await restart.click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("qs-solved")).toHaveText("0");
    // 새 세션의 첫 문항은 미공개 상태여야 한다(옛 답이 남아 정답이 미리 보이면 안 된다).
    await expect(page.locator("#feedback")).toHaveCount(0);
  });

  test("제품을 바꾸면 그 제품 문항으로 새로 시작한다", async ({ page }) => {
    await startQuick(page, "ISTQB");
    await solveQuickOne(page);
    await startQuick(page, "CSTS");
    await expect(page.getByTestId("qs-solved")).toHaveText("0");
  });
});

/**
 * 커서 규칙 — "앞으로만, 확정한 만큼만".
 *
 * 세 경로가 각자 커서를 만지면서 이 규칙 밖으로 나가 있었다(전부 실측으로 확인한 결함이다).
 * 규칙을 아는 코드(quickReady·isQuickCommitted·advanceQuick)가 아니라, 그 규칙을 모르는
 * 주변 코드가 뚫는 유형이라 화면에서 직접 고정한다.
 */
test.describe("퀵 — 커서 규칙", () => {
  test("목록 끝에 닿으면 '한 바퀴 완료'가 뜨고 거기서 다시 시작할 수 있다", async ({ page }) => {
    // 종전에는 범위 보정 effect가 완료 화면이 렌더된 직후 커서를 마지막 문항으로
    // 되돌렸다 — 완료 화면과 '다시 섞어 시작'이 통째로 도달 불가였고, 사용자에게는
    // 마지막 문항에서 '다음 문제'가 먹통인 것으로 보였다.
    await startQuick(page, "ISTQB");
    const items = await savedQuickDraw(page);
    expect(items.length, "출제 순서가 전 세트를 담지 않았다 — 검사 전제가 깨졌다").toBeGreaterThan(2);
    await reopenQuickWith(page, "ISTQB", items.slice(0, 2));

    await solveQuickOne(page);
    await solveQuickOne(page);

    const done = page.getByTestId("quick-exhausted");
    await expect(done, "목록을 다 풀었는데 완료 화면이 뜨지 않는다").toBeVisible();
    // 세션 결과를 함께 보여준다 — 기록이 남지 않는 모드라 이 화면이 유일한 결산이다.
    await expect(done).toContainText("정답");

    await page.getByTestId("quick-restart-btn").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("qs-solved")).toHaveText("0");
  });

  test("확정할 수 없는 입력으로는 '정답 확인'을 누를 수 없다", async ({ page }) => {
    // 빈 입력으로 확인이 눌리면 해설만 열리고 확정은 되지 않아, '다음 문제'가 잠긴 채
    // 확인 버튼마저 사라졌다 — 그 뒤로는 답을 입력해도 확정할 수단이 없어 그 문항에서
    // 영영 빠져나올 수 없었다(탈출로는 '다시 섞어 시작'뿐, 진행은 전부 소실).
    await startQuick(page, "CSTS");
    const short = await findShortAnswerItem(page);
    await reopenQuickWith(page, "CSTS", [short]);

    const input = page.locator(".short-answer-input").first();
    await expect(input, "서답형이 출제되지 않았다 — 검사 전제가 깨졌다").toBeVisible();
    const check = page.getByTestId("short-answer-check");

    // 비어 있으면 잠기고, 왜 잠겼는지 버튼 문구가 말한다(비활성만 두면 "왜 안 눌리지"가 된다).
    await expect(check).toBeDisabled();
    await expect(check).toContainText("입력");
    await expect(page.locator("#feedback"), "확정 전에 해설이 열렸다").toHaveCount(0);
    await expect(page.getByTestId("quick-next-btn")).toBeDisabled();

    // 채우면 확인이 열리고, 확인은 곧 확정이다 — 잠금·해설·'다음 문제'가 함께 성립한다.
    await input.fill("아무 답");
    await expect(check).toBeEnabled();
    await check.click();
    await expect(page.locator("#feedback")).toBeVisible();
    await expect(input, "확정했는데 입력칸이 잠기지 않았다").toBeDisabled();
    await expect(page.getByTestId("quick-next-btn")).toBeEnabled();
    await expect(page.getByTestId("qs-solved")).toHaveText("1");
  });

  test("키보드 화살표로는 커서가 움직이지 않는다", async ({ page }) => {
    // 퀵에는 순차 이동이 없는데 화살표 핸들러에는 모드 가드가 없어, 키보드로만 규칙이
    // 뚫렸다. →는 확정하지 않은 문항을 건너뛰어(커서가 앞으로만 가므로 영영 다시 안
    // 나온다) '진행'과 '정답+오답'을 어긋나게 했고, ←는 진행 수치를 되감았다(실측 2→1).
    await startQuick(page, "ISTQB");

    // 지문에 포커스를 두고 누른다 — 입력칸에 포커스가 남아 있으면 핸들러가 원래
    // 건너뛰므로, 그 상태로 통과하면 아무것도 증명하지 못한다.
    //
    // 클릭이 아니라 focus()로 옮긴다. 지문 안에는 그림이 들어올 수 있고 그 그림은
    // 누르면 라이트박스를 여는 것이 사양이다 — 클릭하면 그림 문항이 뽑힌 실행에서만
    // 오버레이가 떠 다음 조작을 가로챈다(전수 실행에서 실제로 그렇게 실패했다).
    // 지문은 스킵 링크 대상이라 tabIndex=-1을 갖고 있어 포커스만 옮길 수 있다.
    const first = await stemText(page);
    await page.locator("#questionStem").focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
    expect(await stemText(page), "→로 확정하지 않은 문항을 건너뛰었다").toBe(first);
    await expect(page.getByTestId("qs-solved")).toHaveText("0");

    await solveQuickOne(page);
    await answerQuick(page);
    await expect(page.getByTestId("qs-solved")).toHaveText("2");
    const second = await stemText(page);

    await page.locator("#questionStem").focus();
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(200);
    expect(await stemText(page), "←로 이전 문항으로 되돌아갔다").toBe(second);
    await expect(page.getByTestId("qs-solved"), "←로 되돌아가 진행 집계가 줄었다").toHaveText("2");
  });
});
