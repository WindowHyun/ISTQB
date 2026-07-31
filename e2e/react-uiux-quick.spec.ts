import { test, expect, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openProduct, gotoStable } from "./helpers";

/** 유형을 가리지 않고 현재 문항에 답한다 — 퀵에는 서답형이 최대 30% 섞인다(B5).
 *  보기 클릭만 쓰면 뽑기 결과에 따라 셀렉터가 아예 없어 타임아웃으로 죽는다. */
async function answerCurrent(page: Page) {
  const short = page.locator(".short-answer-input");
  if (await short.count()) {
    await short.first().fill("테스트");
    await short.first().blur();
    return;
  }
  await page.locator("#options .option").first().click();
}

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

async function openBar(page: Page) {
  const sel = page.locator("#quickSize");
  if (!(await sel.isVisible())) await page.getByTestId("drawer-open").click();
}

async function startQuick(page: Page, product: "ISTQB" | "CSTS", size = "10") {
  await openProduct(page, product);
  await openBar(page);
  await page.locator("#quickSize").selectOption(size);
  await page.getByTestId("quick-start-btn").click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
}

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
  await openProduct(page, "ISTQB");
  await axeScan(page, "퀵 진입 패널(라이트)");

  await startQuick(page, "ISTQB");
  await axeScan(page, "퀵 풀이 화면(라이트)");

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
  await openProduct(page, "ISTQB");
  await page.waitForTimeout(400);
  await axeScan(page, "퀵 진입 패널(다크)");

  // 모바일
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await openProduct(page, "ISTQB");
  await page.getByTestId("drawer-open").click();
  await page.waitForTimeout(400);
  await axeScan(page, "퀵 진입 패널(모바일 다크)");

  expect(problems, problems.join("\n")).toEqual([]);
});

// ─────────────────────────────────────────────────────────────
test("UX: 키보드만으로 퀵을 시작하고 풀 수 있다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "ISTQB");

  // 문항 수 셀렉트에 키보드로 도달 가능한가 — Tab만으로 닿지 못하면 마우스 없이는 못 쓴다.
  const reached = await page.evaluate(() => {
    const sel = document.querySelector<HTMLSelectElement>("#quickSize");
    if (!sel) return { found: false, tabbable: false, labelled: false };
    return {
      found: true,
      tabbable: sel.tabIndex >= 0 && !sel.disabled,
      labelled: !!(sel.getAttribute("aria-label") || document.querySelector('label[for="quickSize"]')),
    };
  });
  if (!reached.found) bad("퀵 문항 수 셀렉트를 찾을 수 없다");
  if (!reached.tabbable) bad("퀵 문항 수 셀렉트에 키보드로 도달할 수 없다");
  if (!reached.labelled) bad("퀵 문항 수 셀렉트에 접근 가능한 이름이 없다");

  // 셀렉트를 키보드로 조작하고 시작 버튼을 Enter로 누른다.
  await page.locator("#quickSize").focus();
  await page.locator("#quickSize").selectOption("15");
  await page.getByTestId("quick-start-btn").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#progressText")).toContainText("/ 15");
  note("키보드만으로 퀵 15문항 시작 성공");

  // 보기 선택도 키보드로 — 라디오/버튼 어느 쪽이든 포커스 후 Enter/Space가 먹어야 한다.
  // 퀵에는 서답형이 섞이므로(B5) 보기가 있는 문항까지 이동한 뒤 검사한다.
  // 그냥 첫 문항을 잡으면 서답형이 뽑힌 회차에서 셀렉터가 없어 헛되이 죽는다.
  if (!(await advanceToOptionQuestion(page))) {
    bad("15문항을 다 넘겨도 보기가 있는 문항이 없다 — 퀵이 서답형만 뽑았다");
    expect(problems, problems.join("\n")).toEqual([]);
    return;
  }
  const opt = page.locator("#options .option").first();
  await opt.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  let progressed = /^1 \//.test((await page.locator("#progressText").textContent()) ?? "");
  if (!progressed) {
    await page.keyboard.press(" ");
    await page.waitForTimeout(200);
    progressed = /^1 \//.test((await page.locator("#progressText").textContent()) ?? "");
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
  await openProduct(page, "ISTQB");
  await page.getByTestId("drawer-open").click();
  await page.waitForTimeout(400);

  // WCAG 2.1 AA(2.5.5는 AAA지만 모바일 실사용 기준으로 44px를 쓴다).
  const MIN = 44;
  for (const [label, sel] of [
    ["문항 수 셀렉트", "#quickSize"],
    ["시작 버튼", '[data-testid="quick-start-btn"]'],
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
        await openProduct(page, "ISTQB");
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

        // 문서 전체 넘침
        const doc = await page.evaluate(() => ({
          s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth,
        }));
        if (doc.s > doc.c + 1) bad(`${label}: 문서 가로 넘침 ${doc.s}>${doc.c}`);
      }
    }
  }
  note("테마 2 × 글자크기 3 × 폭 2 = 12조합 검사 완료");
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
    await openProduct(page, "ISTQB");
    await page.locator("#quickSize").selectOption("10");
    await page.getByTestId("quick-start-btn").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
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
test("UX: 퀵 안내 문구가 잘리지 않고 출제 범위를 알린다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await openProduct(page, "CSTS");
  await page.getByTestId("drawer-open").click();
  await page.waitForTimeout(400);

  const hint = await page.evaluate(() => {
    const panel = document.querySelector(".quick-panel") as HTMLElement | null;
    const p = panel?.querySelector(".action-hint") as HTMLElement | null;
    if (!p) return null;
    return {
      text: p.textContent ?? "",
      clipped: p.scrollHeight > p.clientHeight + 1,
    };
  });
  if (!hint) { bad("퀵 안내 문구가 없다"); }
  else {
    note(`안내: ${hint.text}`);
    // 출제 범위를 명시하지 않으면 "서답형이 왜 나오냐"가 결함 신고로 돌아온다.
    if (!/전 세트/.test(hint.text)) bad("안내에 '전 세트 출제'가 없다");
    if (!/서답형/.test(hint.text)) bad("안내에 출제 유형 범위가 없다");
    if (!/제한시간/.test(hint.text)) bad("안내에 제한시간 여부가 없다");
    // 퀵은 회차 이력을 남기지 않는다 — 이 사실을 안내에서 알 수 있어야 한다.
    if (!/기록/.test(hint.text)) bad("안내에 회차 기록 여부가 없다");
    if (hint.clipped) bad("안내 문구가 세로로 잘렸다");
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
