import { test, expect, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openProduct, gotoStable, enterQuick, quickStat, answerCurrent } from "./helpers";

/**
 * 퀵 랜덤 UI/UX 검사.
 *
 * 퀵은 기존 UI/UX 스펙(a11y·responsive·layout·settings) 어디에도 들어 있지 않다 —
 * 화면과 CSS가 새로 생겼는데 접근성·반응형·테마 조합 검사를 한 번도 거치지 않았다.
 * 특히 .result-score.neutral과 .quick-start-btn은 이번에 추가된 색이라 대비가 미검증이다.
 */

const problems: string[] = [];
const bad = (s: string) => { problems.push(s); console.log("  ✗ " + s); };
const note = (s: string) => console.log("· " + s);

/** 보기가 있는 문항이 나올 때까지 '다음'으로 이동한다(찾으면 true). */
async function advanceToOptionQuestion(page: Page, max = 20): Promise<boolean> {
  for (let i = 0; i < max; i += 1) {
    if (await page.locator("#options .option").count()) return true;
    const next = page.locator("#nextBtn");
    if (!(await next.count()) || (await next.isDisabled())) return false;
    await next.click();
    await page.waitForTimeout(80);
  }
  return false;
}

async function axeScan(page: Page, label: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  if (!r.violations.length) { note(`${label}: 위반 없음`); return; }
  for (const v of r.violations) {
    const where = v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ");
    bad(`${label} :: [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length}곳: ${where})`);
  }
}

// ─────────────────────────────────────────────────────────────
test("UI: 퀵 화면 axe 스캔 — 라이트·다크·모바일", async ({ page }) => {
  test.setTimeout(300_000);

  // 라이트 · 데스크톱 — 진입 패널이 보이는 상태
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  // 퀵 패널은 퀵 안에서만 렌더된다(진입로는 모드 세그먼트다) — 밖에서 스캔하면
  // 아무것도 없는 사이드바를 훑고 통과한다. 들어간 뒤에 본다.
  await enterQuick(page, "ISTQB");
  await axeScan(page, "퀵 풀이 화면(라이트) — 패널·헤더 점수판 포함");

  // 채점 결과 — 이번에 추가한 중립 표면(.result-score.neutral)이 여기서만 나온다.
  await answerCurrent(page);
  await page.getByTestId("grade-button").click();
  const c = page.getByTestId("confirm-grade");
  if (await c.count()) await c.click();
  await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });
  await axeScan(page, "퀵 결과 모달(라이트)");
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();

  // 다크
  await page.evaluate(() => localStorage.setItem("istqb-theme", "dark"));
  await page.reload();
  await enterQuick(page, "ISTQB");
  await page.waitForTimeout(400);
  await axeScan(page, "퀵 화면(다크)");

  // 모바일
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await enterQuick(page, "ISTQB");
  await page.getByTestId("drawer-open").click();
  await page.waitForTimeout(400);
  await axeScan(page, "퀵 화면(모바일 다크)");

  expect(problems, problems.join("\n")).toEqual([]);
});

// ─────────────────────────────────────────────────────────────
test("UX: 키보드만으로 퀵을 시작하고 풀 수 있다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");

  // 퀵의 진입로는 모드 세그먼트다(문항 수 셀렉트는 없앴다 — 끝이 정해지지 않은 모드에
  // 문항 수를 고르게 하는 것이 거짓말이라서). 그 버튼에 키보드로 닿고 이름이 읽히는가.
  const quickBtn = page.locator('.segmented button[data-mode="quick"]');
  const reached = await quickBtn.evaluate((el) => ({
    tabbable: (el as HTMLButtonElement).tabIndex >= 0 && !(el as HTMLButtonElement).disabled,
    named: ((el.textContent || "") + (el.getAttribute("aria-label") || "")).trim().length > 0,
  }));
  if (!reached.tabbable) bad("퀵 모드 버튼에 키보드로 도달할 수 없다");
  if (!reached.named) bad("퀵 모드 버튼에 접근 가능한 이름이 없다");

  // 버튼을 Enter로 눌러 진입한다.
  await quickBtn.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await expect(quickStat(page, "solved")).toHaveText("0");
  note("키보드만으로 퀵 진입 성공");

  // 보기 선택도 키보드로 — 라디오/버튼 어느 쪽이든 포커스 후 Enter/Space가 먹어야 한다.
  // 퀵에는 서답형이 섞이므로(B5) 보기가 있는 문항까지 이동한 뒤 검사한다.
  // 그냥 첫 문항을 잡으면 서답형이 뽑힌 회차에서 셀렉터가 없어 헛되이 죽는다.
  if (!(await advanceToOptionQuestion(page))) {
    bad("20문항을 다 넘겨도 보기가 있는 문항이 없다 — 퀵이 서답형만 뽑았다");
    expect(problems, problems.join("\n")).toEqual([]);
    return;
  }
  // 진행은 헤더 점수판에서 읽는다 — 퀵에는 진행률(#progressText)이 없다(분모가 없는 모드).
  const solvedBefore = Number((await quickStat(page, "solved").textContent()) ?? "0");
  const opt = page.locator("#options .option").first();
  await opt.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  const solved = async () => Number((await quickStat(page, "solved").textContent()) ?? "0");
  let progressed = (await solved()) > solvedBefore;
  if (!progressed) {
    await page.keyboard.press(" ");
    await page.waitForTimeout(200);
    progressed = (await solved()) > solvedBefore;
  }
  if (!progressed) bad("보기를 키보드(Enter/Space)로 선택할 수 없다");

  // 문항 이동도 키보드로(← →) — 이미 다른 스펙이 보지만 퀵에서도 성립하는지 확인한다.
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  const title = await page.locator("#questionTitle").textContent();
  note(`화살표 이동 후 헤더: ${title?.trim()}`);

  expect(problems, problems.join("\n")).toEqual([]);
});

// ─────────────────────────────────────────────────────────────
test("UI: 모바일에서 퀵 컨트롤이 터치 타깃 최소 크기를 만족한다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await enterQuick(page, "ISTQB");
  await page.getByTestId("drawer-open").click();
  await page.waitForTimeout(400);

  // WCAG 2.1 AA(2.5.5는 AAA지만 모바일 실사용 기준으로 44px를 쓴다).
  const MIN = 44;
  for (const [label, sel] of [
    ["퀵 모드 버튼", '.segmented button[data-mode="quick"]'],
    ["다시 섞어 시작 버튼", '[data-testid="quick-start-btn"]'],
  ] as const) {
    const box = await page.locator(sel).boundingBox();
    if (!box) { bad(`${label}: 화면에 없다`); continue; }
    note(`${label}: ${Math.round(box.width)}×${Math.round(box.height)}`);
    if (box.height < MIN) bad(`${label} 높이 ${Math.round(box.height)}px < ${MIN}px`);
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

// ─────────────────────────────────────────────────────────────
test("UI: 테마 × 글자 크기 조합에서 퀵 화면이 넘치거나 잘리지 않는다", async ({ page }) => {
  test.setTimeout(400_000);

  // 실제로 몇 조합에서 '넘침을 볼 수 있는 화면'까지 갔는지 센다. 퀵 패널이 없으면
  // continue로 빠지는데, 그 경로만 12번 타도 problems가 비어 있는 한 통과해 버린다
  // (bad를 부르므로 지금은 걸리지만, 검사 대상 화면에 닿았는지 자체를 세어 두면
  // 셀렉터·레이아웃이 바뀌어 조용히 건너뛰는 경우까지 잡는다).
  let inspected = 0;
  for (const theme of ["light", "dark"] as const) {
    for (const font of ["small", "normal", "large"] as const) {
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        // 한 테스트가 12번 연속으로 이동한다 — 간헐적 net::ERR_ABORTED 대응은 공용 헬퍼로.
        await gotoStable(page);
        await page.evaluate(([t, f]) => {
          localStorage.clear();
          localStorage.setItem("istqb-theme", t as string);
          localStorage.setItem("istqb-q-font", f as string);
        }, [theme, font]);
        await enterQuick(page, "ISTQB");
        if (width === 390) await page.getByTestId("drawer-open").click();
        await page.waitForTimeout(350);

        const label = `${theme}/${font}/${width}px`;
        // 진입 패널 넘침
        const panel = await page.evaluate(() => {
          const el = document.querySelector(".quick-panel") as HTMLElement | null;
          if (!el) return null;
          return { scrollW: el.scrollWidth, clientW: el.clientWidth };
        });
        if (!panel) { bad(`${label}: 퀵 패널이 없다`); continue; }
        if (panel.scrollW > panel.clientW + 1) {
          bad(`${label}: 퀵 패널 가로 넘침 ${panel.scrollW}>${panel.clientW}`);
        }

        // 헤더 점수판 — 문제 제목과 한 줄을 나눠 쓰므로 큰 글자·좁은 폭에서 먼저 넘친다.
        const board = await page.evaluate(() => {
          const el = document.querySelector(".quick-scoreboard") as HTMLElement | null;
          if (!el) return null;
          const bar = el.closest(".topbar") as HTMLElement | null;
          return {
            scrollW: el.scrollWidth,
            clientW: el.clientWidth,
            barOverflow: bar ? bar.scrollWidth > bar.clientWidth + 1 : false,
          };
        });
        if (!board) { bad(`${label}: 퀵 점수판이 없다`); continue; }
        if (board.scrollW > board.clientW + 1) {
          bad(`${label}: 점수판 가로 넘침 ${board.scrollW}>${board.clientW}`);
        }
        if (board.barOverflow) bad(`${label}: 점수판이 헤더 카드를 넘겼다`);

        // 문서 전체 넘침
        const doc = await page.evaluate(() => ({
          s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth,
        }));
        if (doc.s > doc.c + 1) bad(`${label}: 문서 가로 넘침 ${doc.s}>${doc.c}`);
        inspected += 1;
      }
    }
  }
  note(`테마 2 × 글자크기 3 × 폭 2 = 12조합 중 ${inspected}조합 검사`);
  expect(inspected, "12조합을 다 보지 못했다 — 검사가 무력하다").toBe(12);
  expect(problems, problems.join("\n")).toEqual([]);
});

// ─────────────────────────────────────────────────────────────
test("UI: 퀵 결과의 중립 표면이 라이트·다크 모두에서 읽을 수 있는 대비를 갖는다", async ({ page }) => {
  test.setTimeout(300_000);

  // 상대 휘도 → 대비비. axe가 놓치는 조합(동적 클래스)을 직접 잰다.
  const contrast = (fg: string, bg: string) => {
    const lum = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return 0;
      const [r, g, b] = m[1].split(",").slice(0, 3).map((v) => {
        const s = Number(v.trim()) / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const a = lum(fg); const b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };

  for (const theme of ["light", "dark"] as const) {
    await page.goto("/");
    await page.evaluate((t) => { localStorage.clear(); localStorage.setItem("istqb-theme", t as string); }, theme);
    await enterQuick(page, "ISTQB");
    await answerCurrent(page);
    await page.getByTestId("grade-button").click();
    const c = page.getByTestId("confirm-grade");
    if (await c.count()) await c.click();
    await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });

    const colors = await page.evaluate(() => {
      const box = document.querySelector(".result-score") as HTMLElement | null;
      const strong = box?.querySelector("strong") as HTMLElement | null;
      const badge = box?.querySelector(".result-badge") as HTMLElement | null;
      if (!box || !strong || !badge) return null;
      const cs = getComputedStyle(box);
      return {
        cls: box.className,
        bg: cs.backgroundColor,
        strongFg: getComputedStyle(strong).color,
        strongSize: parseFloat(getComputedStyle(strong).fontSize),
        badgeFg: getComputedStyle(badge).color,
        badgeSize: parseFloat(getComputedStyle(badge).fontSize),
      };
    });
    if (!colors) { bad(`${theme}: 결과 점수 블록을 찾지 못함`); continue; }
    if (!colors.cls.includes("neutral")) bad(`${theme}: 퀵 결과인데 중립 클래스가 아니다 (${colors.cls})`);

    // 큰 글자(≥24px 굵게)는 3:1, 본문 크기는 4.5:1이 AA 기준이다.
    const bigRatio = contrast(colors.strongFg, colors.bg);
    const badgeRatio = contrast(colors.badgeFg, colors.bg);
    note(`${theme}: 점수 ${colors.strongSize}px 대비 ${bigRatio.toFixed(2)}:1 · 배지 ${colors.badgeSize}px 대비 ${badgeRatio.toFixed(2)}:1`);
    const bigNeed = colors.strongSize >= 24 ? 3 : 4.5;
    if (bigRatio < bigNeed) bad(`${theme}: 퀵 결과 점수 대비 ${bigRatio.toFixed(2)}:1 < ${bigNeed}:1`);
    if (badgeRatio < 4.5) bad(`${theme}: 퀵 결과 배지 대비 ${badgeRatio.toFixed(2)}:1 < 4.5:1`);

    await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

// ─────────────────────────────────────────────────────────────
/**
 * 안내 문구는 네 가지를 말해야 한다 — 출제 범위 · 제한시간 · 회차 기록, 그리고 **그 제품에
 * 서답형이 있을 때만** 출제 유형. 마지막 조건이 중요하다: 서답형 문장을 자격증과 무관하게
 * 늘 붙이면, 서답형이 한 문항도 없는 ISTQB 사용자에게 나오지도 않을 유형을 예고하게 된다.
 * 그래서 두 제품을 모두 밟는다 — 종전에는 CSTS만 봐서 이 어긋남이 검사를 통과했다.
 */
test("UX: 퀵 안내 문구가 잘리지 않고, 그 제품에 맞는 출제 범위를 알린다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const product of ["CSTS", "ISTQB"] as const) {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    // 퀵 패널은 퀵 안에서만 렌더된다(진입로는 모드 세그먼트) — 밖에서 찾으면 늘 null이다.
    await enterQuick(page, product);
    await page.getByTestId("drawer-open").click();
    await page.waitForTimeout(400);

    // 기대값의 근거는 데이터다(scripts로 실측: CSTS 440문항 중 서답형 63, ISTQB 186 중 0).
    // 문구가 이 사실을 따라오는지가 요점이므로, 기대는 여기서 못 박고 화면을 대조한다.
    // 데이터가 바뀌어 ISTQB에 서답형이 생기면 이 줄이 먼저 틀려 갱신 지점을 알려 준다.
    const expectShort = product === "CSTS";

    const hint = await page.evaluate(() => {
      const panel = document.querySelector(".quick-panel") as HTMLElement | null;
      const p = panel?.querySelector(".action-hint") as HTMLElement | null;
      if (!p) return null;
      return { text: p.textContent ?? "", clipped: p.scrollHeight > p.clientHeight + 1 };
    });
    if (!hint) { bad(`${product}: 퀵 안내 문구가 없다`); continue; }

    note(`${product} 안내: ${hint.text}`);
    if (!new RegExp(product).test(hint.text)) bad(`${product}: 안내가 다른 자격증을 말한다`);
    if (!/전 세트/.test(hint.text)) bad(`${product}: 안내에 '전 세트 출제'가 없다`);
    if (!/제한시간/.test(hint.text)) bad(`${product}: 안내에 제한시간 여부가 없다`);
    // 퀵은 회차 이력을 남기지 않는다 — 이 사실을 안내에서 알 수 있어야 한다.
    if (!/기록/.test(hint.text)) bad(`${product}: 안내에 회차 기록 여부가 없다`);
    if (hint.clipped) bad(`${product}: 안내 문구가 세로로 잘렸다`);

    const saysShort = /서답형/.test(hint.text);
    if (expectShort && !saysShort) bad(`${product}: 서답형이 나오는데 안내가 알리지 않는다`);
    if (!expectShort && saysShort) {
      bad(`${product}: 서답형이 한 문항도 없는데 안내가 예고한다`);
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
