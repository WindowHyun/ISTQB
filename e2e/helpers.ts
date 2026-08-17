import { Page, expect } from "@playwright/test";

// React E2E 공용 헬퍼 (스펙 아님 — testMatch /react-*.spec.ts/ 에 안 잡힘).

export const modeBtn = (page: Page, label: string) =>
  page.locator(".segmented button", { hasText: new RegExp(`^${label}$`) }).first();

/**
 * ── 단언 규약 ──────────────────────────────────────────────────────────────
 *
 * **`#questionStem`이 보이는 것을 상태 단언으로 쓰지 않는다.**
 *
 * 지문은 연습·시험·랜덤·오답·퀵 어느 모드에서나 보인다. 그래서 "무언가를 눌렀고
 * 지문이 보인다"는 거의 항상 참이고, 아무것도 증명하지 못한다.
 *
 * 실제로 그렇게 통과한 검사가 있었다. react-userflow의 오답 재풀이 단계는 퀵 모드에서
 * '오답 다시 풀기'를 누른 뒤 지문 가시성만 단언했는데, 당시 그 버튼은 아무 일도 하지
 * 않고 토스트만 띄웠다 — 모드가 바뀌지 않아 퀵 문항이 그대로 떠 있었고, 검사는 초록불이었다.
 * 재풀이에 진입하지 못하는 결함을 13분짜리 스위트가 통과시켰다.
 *
 * 규칙:
 *  - 지문 가시성은 **로딩 완료를 기다리는 용도**로만 쓴다(진입 헬퍼 안에서).
 *  - 상태가 바뀌었다는 주장은 **그 상태를 직접 읽는 단언**으로 한다
 *    (모드 → `expectMode`, 세트 → 셀렉트 값, 채점 → 결과 모달·점수).
 *  - "무엇을 확인하려는가"를 한 문장으로 못 쓰겠으면 그 단언은 빼는 게 낫다.
 */

/** 현재 풀이 모드가 기대와 같은지 — 지문 가시성 대신 aria-pressed를 직접 읽는다. */
export async function expectMode(page: Page, label: "연습" | "시험" | "랜덤" | "오답") {
  await expect(
    modeBtn(page, label),
    `모드가 '${label}'로 전환되지 않았다 — 지문이 보인다는 것만으로는 전환을 증명하지 못한다`,
  ).toHaveAttribute("aria-pressed", "true");
}

/**
 * ── 진입은 '출제 목록이 실린 뒤'가 끝이다 ─────────────────────────────────────
 *
 * 모드·세트·챕터는 클릭하는 즉시 스토어에서 바뀌지만 **문항은 비동기로 온다.** 그 사이
 * 화면은 새 맥락의 머리에 **옛 목록**을 달고 떠 있다 — 퀵으로 들어가면 퀵 점수판이 먼저
 * 뜨고 팔레트에는 방금까지 풀던 연습 세트의 40문항이 그대로 남아 있다(실측: 진입 40회 중
 * 6회에서 이 구간이 관측됐다).
 *
 * 그래서 `#questionStem`도 점수판도 **진입이 끝났다는 증거가 못 된다.** 지문은 이전 모드의
 * 것이어도 보이고, 점수판은 목록과 무관하게 모드만 보고 뜬다. 그 구간에 단언을 걸면 옛
 * 목록을 재는 검사가 되고, 그 구간에 클릭하면 무엇에 답한 것인지 스펙이 통제하지 못한다.
 *
 * 워크스페이스가 지금 실린 목록의 출처를 `data-list-mode|set|chapter`에 적으므로
 * (QuestionWorkspace) 진입 헬퍼는 그 값이 목표 맥락과 같아질 때까지 기다린다.
 *
 * 한계: **같은 맥락으로 다시 뽑는 경우는 구분하지 못한다**(퀵 안의 '다시 섞어 시작',
 * 같은 챕터 미니 시험 재진입). 값이 처음부터 목표와 같아 곧바로 통과한다. 진입 헬퍼는
 * 재추첨을 누르지 않으므로 여기서는 문제가 되지 않지만, 재추첨을 검사하는 스펙은 문항
 * 자체의 변화를 봐야 한다.
 */
export async function waitForList(
  page: Page,
  want: { mode?: string; setId?: string; chapter?: string },
) {
  const ws = page.locator(".workspace");
  const because = "출제 목록이 아직 이전 맥락 그대로다 — 지문이 보인다는 것은 출제가 끝났다는 뜻이 아니다";
  if (want.mode) await expect(ws, because).toHaveAttribute("data-list-mode", want.mode, { timeout: 20_000 });
  if (want.setId) await expect(ws, because).toHaveAttribute("data-list-set", want.setId, { timeout: 20_000 });
  if (want.chapter) await expect(ws, because).toHaveAttribute("data-list-chapter", want.chapter, { timeout: 20_000 });
}

export async function openProduct(page: Page, name: "ISTQB" | "CSTS") {
  await page.goto("/");
  await page.getByRole("button", { name }).click();
  // 여기서는 목록 맥락을 기다리지 않는다 — goto가 앱을 새로 띄우므로 이전 목록이라는 것이
  // 없고(빈 목록에서 시작), 어느 세트가 기본으로 열릴지는 복원 상태가 정한다.
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
}

// 제품 선택 후 특정 세트(연습 모드)로 진입.
// 모바일/태블릿(≤880px)에서는 사이드바가 드로어(닫힘=visibility:hidden)라 세트 셀렉트가
// 숨겨져 있다 — 실사용자와 동일하게 드로어를 열고 선택한다(세트 변경은 드로어를 자동으로 닫음).
export async function openSet(page: Page, product: "ISTQB" | "CSTS", setId: string) {
  await openProduct(page, product);
  const select = page.locator("#examSelect");
  const inDrawer = !(await select.isVisible());
  if (inDrawer) {
    await page.getByTestId("drawer-open").click();
    await expect(select).toBeVisible();
  }
  await select.selectOption(setId);
  if (inDrawer) {
    // 같은 세트 재선택 등 변경 이벤트가 없으면 드로어가 열려 있을 수 있다 — Esc로 확실히 닫는다.
    await page.keyboard.press("Escape");
    await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "closed");
  }
  // 고른 세트의 문항이 실제로 실릴 때까지 기다린다 — 셀렉트 값은 즉시 바뀌지만 문항은
  // 뒤늦게 오므로, 그 사이 화면에는 **직전 세트의 문항**이 그대로 떠 있다.
  await waitForList(page, { setId });
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 15_000 });
}

// 시험 모드 진입 + 시작 게이트 통과(Phase 1). 시험 모드는 "시험 시작"을 눌러야
// 문항이 노출되므로, 대부분의 시나리오는 이 헬퍼로 진입한다(게이트 자체 검증은 전용 스펙).
export async function enterExam(page: Page) {
  await modeBtn(page, "시험").click();
  const start = page.getByTestId("exam-start-btn");
  await start.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  if (await start.count()) await start.click();
  // 시험 목록으로 갈린 뒤에 돌려준다. 같은 세트를 다시 읽는 경로라 화면은 대개 그대로지만,
  // 목록의 주인이 연습에서 시험으로 넘어가야 답안 키·채점 대상이 이 회차의 것이 된다.
  await waitForList(page, { mode: "exam" });
}

// 모바일(≤880px) 시험 진입 — 모드 세그먼트는 드로어 안에 있으므로 열고 탭한다
// (모드 변경은 드로어를 자동으로 닫음). 게이트의 "시험 시작"까지 통과.
export async function enterExamMobile(page: Page) {
  await page.getByTestId("drawer-open").tap();
  await modeBtn(page, "시험").tap();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "closed");
  const start = page.getByTestId("exam-start-btn");
  await start.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  if (await start.count()) await start.tap();
  await waitForList(page, { mode: "exam" });
}

/**
 * 랜덤 진입 — 통계의 챕터 '미니 시험'이 유일한 진입로다.
 *
 * 모드 세그먼트의 '랜덤'은 빠졌다(147a9f0 — "세트 안 무작위와 전 세트 무작위를 둘 다 두면
 * 무엇이 다른지 설명할 수 없는 두 버튼이 나란히 있는 것"이라 퀵에 흡수). 랜덤 **모드**는
 * 그대로 살아 있고, 이제 챕터 필터가 걸린 최대 10문항 회차로만 도달한다.
 *
 * 그래서 이 헬퍼에는 '세트 전체 40문항'이 없다 — 종전 스펙들이 기대하던 그 형태의 랜덤은
 * 제품에서 사라졌다. 챕터 목록은 채점 이력에서 만들어지므로 회차 하나가 선행돼야 한다
 * (completeAttempt 등).
 */
export async function enterMiniTest(page: Page) {
  await page.getByTestId("stats-open").click();
  const btn = page.getByTestId("chapter-minitest-btn").first();
  // 어느 챕터를 누르는지 먼저 읽어 둔다(버튼 이름이 "<챕터> 미니 시험") — 출제 목록이
  // 그 챕터로 갈렸는지까지 확인하려면 이름이 필요하다. 배너는 필터 상태만 보고 뜨므로
  // 배너가 보인다고 해서 10문항 추첨이 끝난 것은 아니다(그 전까지는 세트 40문항 그대로다).
  const chapter = ((await btn.getAttribute("aria-label")) || "").replace(/\s*미니 시험$/, "");
  await btn.click();
  await expect(page.getByTestId("chapter-filter-banner")).toBeVisible({ timeout: 20_000 });
  await waitForList(page, { mode: "random", chapter: chapter || undefined });
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
}

/**
 * 퀵 진입 — 모드 세그먼트가 유일한 진입로다.
 *
 * 종전에는 문항 수 콤보(#quickSize)에서 10·15·20을 고르고 '시작'을 누르는 두 단계였다.
 * 그 콤보는 사라졌다 — 끝을 정해 놓지 않은 모드에 문항 수를 고르게 하는 것이 거짓말이라,
 * 이제 세그먼트를 누르는 순간 제품의 전 세트를 섞어 첫 문항을 낸다. 그래서 이 헬퍼에는
 * size 인자가 없다(있던 자리에 무엇을 넣어야 할지 답할 수 없으면 그 인자는 없는 것이다).
 *
 * 퀵 안의 '다시 섞어 시작'(quick-start-btn)은 진입이 아니라 재추첨이므로 여기서 누르지
 * 않는다 — 누르면 방금 들어와 뽑힌 회차를 버리고 다시 뽑는 셈이라 의도가 흐려진다.
 */
export async function enterQuick(page: Page, product?: "ISTQB" | "CSTS") {
  if (product) await openProduct(page, product);
  const btn = page.locator('.segmented button[data-mode="quick"]');
  // 모바일/태블릿(≤880px)에서는 세그먼트가 드로어 안이라 숨어 있다 — 실사용자와 같이 연다.
  if (!(await btn.isVisible())) await page.getByTestId("drawer-open").click();
  await btn.click();
  // 퀵 추첨이 실제로 실릴 때까지 기다린다. 세그먼트를 누르는 순간 점수판과 헤더는 퀵의
  // 것으로 바뀌지만 문항은 전 세트를 다 연 뒤에야 온다 — 그 사이에 답을 누르면 스펙이
  // 무엇에 답했는지 통제하지 못한다.
  await waitForList(page, { mode: "quick" });
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
}

/**
 * 퀵 점수판의 한 칸 값. 퀵에는 진행률(#progressText)이 없다 — 끝이 정해지지 않아 분모가
 * 없기 때문이다. 그 자리를 문제 헤더의 점수판이 대신하므로, 퀵의 '얼마나 풀었나'는
 * 여기서 읽는다.
 */
export function quickStat(page: Page, cell: "solved" | "correct" | "wrong" | "streak") {
  const index = { solved: 0, correct: 1, wrong: 2, streak: 3 }[cell];
  return page.locator(".quick-scoreboard .qs-item").nth(index).locator("b");
}

/**
 * 유형을 가리지 않고 현재 문항에 답한다.
 *
 * 퀵에는 서답형이 최대 30%까지 섞이므로(B5) `#options .option` 클릭만 쓰면 뽑기 결과에
 * 따라 그 셀렉터가 아예 없어 타임아웃한다 — '가끔 깨지는 테스트'로 보이지만 원인은
 * 타이밍이 아니라 문항 유형이다.
 *
 * **복수정답은 정답 개수만큼 다 골라야 '답함'으로 확정된다**(`isQuickCommitted` — 하나만
 * 누르면 3개짜리 문항이 첫 클릭에 오답으로 굳어 버리므로 일부러 그렇게 뒀다). 종전 이
 * 헬퍼는 주석으로만 그 사실을 적어 두고 첫 보기 하나만 눌렀다. 그래서 뽑기가 복수정답
 * 문항을 앞쪽에 놓는 회차에서만 퀵 점수판이 늘지 않아 `react-quick-ux`가 3회 중 1회꼴로
 * 실패했다 — 타이밍처럼 보이지만 원인은 문항 유형이었다.
 *
 * 정답이 몇 개인지는 화면에 없다. 그래서 '보기를 순서대로 전부 누른다'로는 안 된다 —
 * 확정되는 순간 나머지 보기가 `disabled`가 되어 그 다음 클릭이 30초를 기다리다 죽는다
 * (연습 모드는 확정 후에도 눌리므로 cap 검사만 보고 짐작하면 이 차이를 놓친다).
 * **잠김을 종료 신호로 삼아** 하나씩 늘려 가며 누른다.
 *
 * ── 이 헬퍼를 복사하지 말 것 ──────────────────────────────────────────────
 * 종전에는 같은 이름의 사본이 `react-quick-resilience`·`react-consistency`에 하나씩 더
 * 있었고, 셋이 서로 다른 교훈만 배운 채 갈라졌다. 사본 하나는 '유형이 뜰 때까지 기다린다'를,
 * 원본은 '서답형은 확인 버튼을 눌러야 확정된다'를 배웠지만 **복수정답은 아무도 몰랐다.**
 * 그래서 원본을 고쳐도 사본을 쓰는 스펙은 그대로 깨졌다(퀵 첫 문항이 복수정답으로 뽑히는
 * 약 5%의 회차에서만 — ISTQB 복수정답은 186문항 중 9개다). 답하는 방법이 바뀌면 여기만
 * 고치면 되도록 한 곳에 둔다.
 */
export async function answerCurrent(page: Page) {
  const short = page.locator(".short-answer-input");
  // 유형이 확정될 때까지 기다린다 — 퀵 진입 직후에는 이전 모드의 화면이 잠깐 남아 있고,
  // 보기와 서답형 입력 중 무엇이 뜰지도 뽑기가 정한다. 한쪽만 기다리면 반대 유형이 뽑힌
  // 회차에서 타임아웃한다(전수 실행에서 이 자리가 300초로 죽은 적이 있다).
  await expect(page.locator("#options .option").first().or(short.first())).toBeVisible({ timeout: 15_000 });
  const blanks = await short.count();
  if (blanks) {
    for (let i = 0; i < blanks; i += 1) await short.nth(i).fill("테스트");
    // 연습·오답의 서답형은 '정답 확인'으로 공개 시점을 사용자가 정한다. 버튼이 입력에
    // 반응해 나타나므로 fill 직후에는 아직 없을 수 있다 — `count()`는 재시도하지 않아
    // 그 한 순간을 '이 모드엔 버튼이 없다'로 읽고 지나간다. 잠깐 기다린 뒤 판단한다.
    const check = page.locator(".short-answer-check");
    await check.first().waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
    if (await check.count()) await check.first().click();
    await gradeQuickIfNeeded(page);
    return;
  }
  const options = page.locator("#options .option");
  await options.first().click();
  // 복수정답 표기는 문제 제목이 단다("문제 4 · 복수정답" — QuestionWorkspace).
  const title = (await page.locator("#questionTitle").textContent()) || "";
  if (!title.includes("복수정답")) { await gradeQuickIfNeeded(page); return; }
  const total = await options.count();
  for (let i = 1; i < total; i += 1) {
    const opt = options.nth(i);
    if (await opt.isDisabled()) break; // 확정돼 잠겼다 — 더 고를 것이 없다
    await opt.click();
  }
  await gradeQuickIfNeeded(page);
}

/**
 * 퀵의 주 액션 버튼을 **지금 화면에 보이는 쪽으로** 집는다.
 *
 * 같은 버튼이 두 벌 렌더된다 — 데스크톱은 문항 아래(.quick-actionbar), 모바일은 하단
 * 고정 바(.mobile-actionbar). 둘 중 하나는 CSS로 감춰져 있고 DOM에는 남아 있으므로,
 * testid만으로 집으면 뷰포트에 따라 '보이지 않는 버튼'을 눌러 타임아웃한다.
 */
async function quickButton(page: Page, name: "grade" | "next") {
  const desktop = page.getByTestId(`quick-${name}-btn`);
  if ((await desktop.count()) && (await desktop.isVisible())) return desktop;
  const mobile = page.getByTestId(`quick-${name}-btn-m`);
  if ((await mobile.count()) && (await mobile.isVisible())) return mobile;
  return null;
}

/**
 * 퀵에서 '한 문항 풀기'는 **채점까지**다.
 *
 * 퀵은 한 문항씩 채점하고 넘어가는 모드다 — 보기를 고르는 것만으로는 정답도 열리지 않고
 * 점수판도 오르지 않는다(그 둘은 채점이 연다). 답만 고르고 다음 단언으로 넘어가면
 * "답했는데 아무 일도 안 일어난다"는 형태로 검사가 조용히 어긋나므로, 답하기 헬퍼가
 * 채점까지 맡는다. 다른 모드에는 이 버튼이 없어 아무 일도 하지 않는다.
 */
export async function gradeQuickIfNeeded(page: Page) {
  const grade = await quickButton(page, "grade");
  if (!grade) return;
  if (await grade.isDisabled()) return; // 답이 덜 찼다(복수정답을 다 고르지 못한 경우)
  await grade.click();
}

/**
 * 퀵에서 다음 문항으로. 채점을 마쳐야 이 버튼이 생기므로, 없으면 **아직 채점 전이거나
 * 마지막 문항**이라는 뜻이다 — 그 구분은 부르는 쪽이 정한다(false를 돌려준다).
 */
export async function quickNext(page: Page): Promise<boolean> {
  const next = await quickButton(page, "next");
  if (!next) return false;
  await next.click();
  return true;
}

/**
 * 모드를 가리지 않고 '다음 문항으로'. 갈 곳이 없으면 false.
 *
 * 퀵에는 앞으로 가는 화살표(#nextBtn)가 없다 — 채점하지 않은 문항을 미리 넘겨보지
 * 못하게 뺐다. 그 모드에서는 채점 뒤에 나타나는 '다음 문제'가 유일한 통로다.
 * 두 통로를 부르는 쪽마다 분기하면 사본이 갈리므로(이 저장소가 반복해서 겪은 결함
 * 클래스다) 여기 하나로 모은다.
 */
export async function goNextQuestion(page: Page): Promise<boolean> {
  if (await quickNext(page)) return true;
  const arrow = page.locator("#nextBtn");
  if (!(await arrow.count()) || (await arrow.isDisabled())) return false;
  await arrow.click();
  return true;
}

// 채점: 채점 버튼 클릭 후 미응답 경고 모달이 뜨면 확인까지 처리한다.
export async function submitGrade(page: Page, testid = "grade-button") {
  await page.getByTestId(testid).click();
  const confirm = page.getByTestId("confirm-grade");
  await confirm.waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
  if (await confirm.count()) await confirm.click();
}

// 채점 결과 요약 모달 닫기 — 스펙마다 반복되던 시퀀스의 공용 헬퍼.
export async function closeResult(page: Page) {
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
}

// "응시 1회 완료"(시험 진입→1문항 응답→채점→결과 닫기) — 회차 누적이 필요한
// 시나리오(통계·오답노트·타임라인)의 공용 준비 시퀀스.
export async function completeAttempt(page: Page) {
  await enterExam(page);
  await page.locator("#options .option").first().click();
  await submitGrade(page);
  await closeResult(page);
}

// 문제 번호 팔레트로 특정 문항 이동.
export async function gotoQuestion(page: Page, num: number) {
  const nav = page.locator("#questionNav button");
  const total = await nav.count();
  for (let i = 0; i < total; i++) {
    if (((await nav.nth(i).textContent()) || "").trim() === String(num)) {
      await nav.nth(i).click();
      await page.waitForTimeout(80);
      return;
    }
  }
  throw new Error("문항 번호를 찾지 못함: " + num);
}

// 가져오기는 적용 전에 정책 확인 모달을 거친다(D2) — 파일만 넣으면 아무 일도 일어나지 않는다.
export async function confirmImport(page: Page) {
  await page.getByTestId("import-confirm").click();
}

/**
 * 한 테스트가 화면을 수십 번 갈아 끼우며 이동할 때 쓴다.
 *
 * vite preview는 스위트가 붐비거나 연속 이동이 잦으면 간헐적으로 net::ERR_ABORTED로
 * 끊는다. 조합·테마 순회처럼 "이동 자체가 검사 대상이 아닌" 테스트에서는 그 한 번의
 * 끊김이 조합 전체를 날려 버린다. 그 오류에 한해서만 한 번 다시 시도하고, 다른 실패는
 * 그대로 터뜨린다 — 무턱대고 재시도하면 진짜 로드 실패를 가려 버린다.
 */
export async function gotoStable(page: Page, url = "/") {
  try {
    await page.goto(url);
  } catch (e) {
    if (!String(e).includes("ERR_ABORTED")) throw e;
    await page.waitForTimeout(1000);
    await page.goto(url);
  }
}
