import { test, expect, type Page } from "./fixtures";
import {
  enterExam,
  enterMiniTestMobile,
  gotoQuestionMobile,
  openProduct,
  openQuestionList,
  openSet,
  submitGrade,
} from "./helpers";

// 채점 1회를 마친 상태 — 오답 노트 배지와 챕터 통계가 생긴다. 모바일 레이아웃(≤880px)에서는 모드 버튼이 드로어 안에 있다.
async function gradeOnceMobile(page: Page) {
  await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
  await page.getByTestId("drawer-open").click();
  await enterExam(page);
  await page.locator("#options .option").first().click();
  await submitGrade(page, "grade-button-m"); // 모바일: 하단 액션바 채점 버튼
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
}

// 위 상태에서 학습 통계를 연다(통계 버튼도 드로어 안에 있다).
async function openStatsAfterGrading(page: Page) {
  await gradeOnceMobile(page);
  await page.getByTestId("drawer-open").click();
  await page.getByTestId("stats-open").click();
  await expect(page.getByTestId("chapter-minitest-btn").first()).toBeVisible();
}

/**
 * 상태 줄(모드 칩·위치·시간·오답 노트)의 칸 상자. `content`를 주면 그 내용으로 덮어 **같은 틱에서** 잰다 —
 * 시계는 매초 다시 그려지므로 덮어쓰기와 측정을 나누면 되돌아간다.
 */
type StatusContent = { chip?: string; time?: string; badge?: string };
async function measureStatusRow(page: Page, content: StatusContent = {}) {
  return page.evaluate((c) => {
    const el = (sel: string) => document.querySelector<HTMLElement>(sel)!;
    if (c.chip) el(".mtb-chip").textContent = c.chip;
    if (c.time) el(".mtb-time").lastChild!.textContent = c.time;
    if (c.badge) el(".mtb-wrong b").textContent = c.badge;
    const box = (sel: string) => {
      const r = el(sel).getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    return {
      cells: { 모드: box(".mtb-chip"), 위치: box(".mtb-pos"), 시간: box(".mtb-time"), 오답노트: box(".mtb-wrong") },
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  }, content);
}
type StatusRow = Awaited<ReturnType<typeof measureStatusRow>>;

/** 계약은 '한 줄'이 아니라 '잘리지 않음'이다 — 칸이 모자라면 오답 노트가 다음 줄로 내려가도 된다. */
function expectStatusRowIntact(m: StatusRow, width: number, label: string) {
  const { 모드, 위치, 시간, 오답노트 } = m.cells;
  // 글자가 꺾이지 않는다 — 한 칸이 두 줄이 되면 높이가 한 줄의 두 배가 된다('시/험'·'1 / 40'·'오답 노/트').
  expect(모드.h, `${label}: 모드 칩이 글자 중간에서 꺾였다`).toBeLessThan(36);
  expect(위치.h, `${label}: 위치('1 / 40')가 두 줄로 꺾였다`).toBeLessThan(28);
  expect(시간.h, `${label}: 시간이 두 줄로 꺾였다`).toBeLessThan(28);
  expect(오답노트.h, `${label}: 오답 노트 칩이 두 줄로 꺾였다`).toBeLessThan(48);
  // 좌우 16px 여백 안에 든다 — 파고들면 ☰와 오른쪽 끝이 어긋나고, 더 나가면 화면 끝에 붙어 잘린다.
  for (const [name, b] of Object.entries(m.cells)) {
    expect(b.x, `${label}: ${name}이 왼쪽 여백을 넘었다 ${JSON.stringify(b)}`).toBeGreaterThanOrEqual(16 - 1);
    expect(b.x + b.w, `${label}: ${name}이 오른쪽 여백을 넘었다 ${JSON.stringify(b)}`).toBeLessThanOrEqual(width - 16 + 1);
  }
  expect(m.overflow, `${label}: 페이지가 가로로 넘친다`).toBeLessThanOrEqual(0);
  // 칸끼리 겹치지 않는다.
  const cells = Object.entries(m.cells);
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      const [an, a] = cells[i];
      const [bn, b] = cells[j];
      const overlap = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
      expect(overlap, `${label}: ${an}과 ${bn}이 겹친다`).toBe(false);
    }
  }
}

/** 네 칸이 같은 줄에 선다(세로 중심이 같다). */
function expectStatusRowOnOneLine(m: StatusRow, label: string) {
  const centers = Object.values(m.cells).map((b) => b.y + b.h / 2);
  expect(Math.max(...centers) - Math.min(...centers), `${label}: 네 칸이 한 줄에 서지 않는다 ${centers.map(Math.round)}`).toBeLessThanOrEqual(4);
}

// 엣지: 반응형(모바일 드로어·하단바·문항 목록·소형 뷰포트).
test.describe("엣지-반응형", () => {
  test.describe("모바일(375x812)", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("모바일 상단바가 보인다", async ({ page }) => {
      await openProduct(page, "ISTQB");
      await expect(page.locator(".mobile-topbar")).toBeVisible();
    });

    test("인라인 팔레트는 모바일에서 숨겨진다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await expect(page.locator(".palette-block")).toBeHidden();
    });

    test("☰로 드로어가 열리고 백드롭으로 닫힌다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      const shell = page.locator(".app-shell");
      await page.getByTestId("drawer-open").click();
      await expect(shell).toHaveAttribute("data-drawer", "open");
      await page.locator(".drawer-backdrop").click({ position: { x: 360, y: 400 } });
      await expect(shell).toHaveAttribute("data-drawer", "closed");
    });

    test("드로어는 Esc로 닫힌다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("drawer-open").click();
      await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "open");
      await page.keyboard.press("Escape");
      await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "closed");
    });
    test("하단 바의 '문항 목록'으로 문항을 옮긴다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      const sheet = await openQuestionList(page);
      await sheet.locator("button", { hasText: /^4$/ }).click();
      await expect(sheet).toHaveCount(0); // 고르면 시트가 닫힌다
      await expect(page.getByTestId("question-list-open")).toContainText("4 /");
    });
    test("드로어에서 학습 통계가 열린다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("drawer-open").click();
      await page.getByTestId("stats-open").click();
      await expect(page.getByTestId("stats-dashboard")).toBeVisible({ timeout: 5_000 });
    });

    test("제품 선택 게이트가 모바일에서 표시된다", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "ISTQB" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "CSTS" })).toBeVisible();
    });

    test("드로어의 채점하기는 드로어를 닫고 확인 팝업을 맨 위로 띄운다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("drawer-open").click();
      await enterExam(page); // 모드 변경으로 드로어가 닫힘
      await page.getByTestId("drawer-open").click();
      await page.getByTestId("grade-button").click();
      // 드로어가 닫혀 뒤의 모드/세트 컨트롤을 더 조작할 수 없다.
      await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "closed");
      const modal = page.getByTestId("confirm-grade-modal");
      await expect(modal).toBeVisible();
      // 팝업이 최상단이라 버튼 조작이 가능하다(z-index 회귀 방지).
      await page.getByRole("button", { name: "계속 풀기" }).click();
      await expect(modal).toHaveCount(0);
    });

    test("라이트박스 이미지가 화면 폭 안에 온전히 들어온다(오른쪽 잘림 방지)", async ({ page }) => {
      await openSet(page, "CSTS", "CSTS-FL-2402");
      // 그림 문항(9번)으로 이동 — 모바일은 문항 목록 시트 사용.
      await gotoQuestionMobile(page, 9);
      await page.locator("#questionFigure img, #questionStem img").first().click();
      const img = page.locator(".figure-lightbox-img");
      await expect(img).toBeVisible();
      const box = await img.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375 + 1); // 뷰포트 폭(375) 안(±1px 반올림 여유)
    });

    test("통계 챕터 행의 연습·미니 시험 버튼이 한 줄로 렌더된다(세로 꺾임 회귀)", async ({ page }) => {
      await openStatsAfterGrading(page); // 채점 1회로 챕터 통계를 만든다
      const mini = page.getByTestId("chapter-minitest-btn").first();
      // 세로로 꺾이면('미/니/시/험') 높이가 4줄(≥60px)이 된다 — 한 줄이면 터치 타깃 높이(44px).
      const box = await mini.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeLessThan(45);
      const prac = await page.getByTestId("chapter-practice-btn").first().boundingBox();
      expect(prac!.height).toBeLessThan(45);
    });

    // 위 검사는 높이만 본다 — 버튼이 한 줄에 서지 않아도, 브라우저 기본 모양이어도 통과한다. 실제로 '미니 시험'은
    // 모바일 그리드(3칸)에 자식이 4개라 혼자 아랫줄로 떨어졌고 CSS 규칙이 없어 기본 회색 버튼으로 나갔다.
    // 위치가 아니라 **규칙**을 잰다: 한 쌍은 같은 줄에 같은 크기로 서고, 터치 타깃을 지키며, 행 밖으로 넘치지 않는다.
    test("통계 챕터 행의 연습·미니 시험은 같은 줄에 같은 크기로 서고 터치 타깃을 지킨다", async ({ page }) => {
      await openStatsAfterGrading(page);

      // 순위 행(4칸)과 표본 부족 행(막대 없는 3칸 변형) 둘 다 본다 — 3칸 변형은 그리드 칸 수와 자식 수가 어긋나
      // 버튼이 아랫줄로 떨어졌던 바로 그 자리다. ISTQB-FL-V4-A는 1회 응시로 두 그룹이 모두 생긴다(react-stats가 개수까지 못 박는다).
      // 없으면 건너뛰지 않고 실패한다 — 데이터가 바뀌어 조용히 검사가 사라지는 것을 막는다.
      for (const rowId of ["stats-chapter-row", "stats-lowsample-row"]) {
        const rows = page.getByTestId(rowId);
        await expect(rows.first(), `${rowId}가 없다 — 이 시나리오에서는 두 그룹이 모두 있어야 한다`).toBeVisible();

        const row = rows.first();
        const [r, p, m] = await Promise.all([
          row.boundingBox(),
          row.getByTestId("chapter-practice-btn").boundingBox(),
          row.getByTestId("chapter-minitest-btn").boundingBox(),
        ]);
        const where = `${rowId}: 행 ${JSON.stringify(r)} · 연습 ${JSON.stringify(p)} · 미니 시험 ${JSON.stringify(m)}`;
        expect(Math.abs(p!.y - m!.y), `서로 다른 줄에 있다 — ${where}`).toBeLessThanOrEqual(1);
        expect(Math.abs(p!.width - m!.width), `폭이 다르다 — ${where}`).toBeLessThanOrEqual(2);
        expect(Math.min(p!.height, m!.height), `터치 타깃 44px 미만 — ${where}`).toBeGreaterThanOrEqual(44);
        expect(m!.x + m!.width, `행 오른쪽으로 넘친다 — ${where}`).toBeLessThanOrEqual(r!.x + r!.width + 1);
        expect(p!.x, `행 왼쪽으로 넘친다 — ${where}`).toBeGreaterThanOrEqual(r!.x - 1);
      }

      // 브라우저 기본 버튼(모서리 각짐·회색 면)이 아니라 이 앱의 버튼이다 — 규칙이 아예 없던 결함의 직접 증거.
      const radius = await page.getByTestId("chapter-minitest-btn").first().evaluate((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius));
      expect(radius, "미니 시험이 기본 버튼 모양이다(CSS 규칙 없음)").toBeGreaterThanOrEqual(8);
    });
    // react-layout에서 옮김
    test("모드 변경 시 드로어가 자동으로 닫힌다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("drawer-open").click();
      await enterExam(page);
      await expect(page.locator(".app-shell")).toHaveAttribute("data-drawer", "closed");
    });
    // react-responsive(구)에서 옮김 — 나머지는 이 파일과 중복
    test("하단 액션바 채점 흐름이 동작한다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      // 모드 변경은 드로어에서
      await page.getByTestId("drawer-open").click();
      await enterExam(page);
      await page.locator("#options .option").first().click();
      await submitGrade(page, "grade-button-m");
      await expect(page.getByTestId("score")).toContainText("점수", { timeout: 8_000 });
    });

    test("드로어에서 설정 모달이 열리고 닫힌다", async ({ page }) => {
      await openProduct(page, "ISTQB");
      await page.getByTestId("drawer-open").click();
      await page.getByRole("button", { name: /설정/ }).click();
      const dialog = page.getByRole("dialog", { name: "설정" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "닫기" }).click();
      await expect(dialog).toHaveCount(0);
    });
  });

  test.describe("초소형(320x640)", () => {
    test.use({ viewport: { width: 320, height: 640 } });

    test("320px에서도 문항과 보기가 렌더된다", async ({ page }) => {
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await expect(page.locator("#questionStem")).toBeVisible();
      await expect(page.locator("#options .option").first()).toBeVisible();
    });
  });

  // 상태 줄은 내용에 따라 폭이 크게 달라진다 — 모드 라벨('시험'→'미니 시험'), 시계('59:59'→'1:05:12': 연습은 경과 시간이
  // 한 시간을 넘길 수 있다), 오답 노트 배지(전 세트 오답의 총수라 세 자리가 된다). 한 조합만 재면 다른 조합에서 넘친다 —
  // 실제로 '시험'+두 자리 배지만 재서, 미니 시험에서 칩이 오른쪽 여백을 넘어 화면 끝에 붙는 결함이 이 검사를 통과했다.
  // 그래서 실제 흐름(시험 → 채점 → 미니 시험)으로 상태를 만든 뒤 가장 긴 내용을 같은 틱에 덮어 재고, 폭은 좁은 쪽
  // (320 · 344=접이식 폰 겉화면 · 360=가장 흔한 안드로이드)과 좁은 화면용 여백 축소(≤380px) 경계 바깥(390·412)까지 훑는다.
  // 계약은 '한 줄'이 아니라 '잘리지 않음'이다(칸이 모자라면 오답 노트가 다음 줄로 내려간다). 보통 내용만 한 줄을 약속한다.
  const WORST_CONTENT: StatusContent = { chip: "미니 시험", time: "1:05:12", badge: "126" };
  for (const width of [320, 344, 360, 375, 390, 412]) {
    test.describe(`상태 줄 ${width}px`, () => {
      test.use({ viewport: { width, height: 760 } });

      test("가장 긴 내용에서도 잘리거나 글자가 꺾이지 않고, 보통 내용은 한 줄에 선다", async ({ page }) => {
        await gradeOnceMobile(page); // 시험 → 채점: 실제 배지가 뜬다
        const exam = await measureStatusRow(page);
        expectStatusRowIntact(exam, width, "시험(실제 내용)");
        expectStatusRowOnOneLine(exam, "시험(실제 내용)");
        expectStatusRowIntact(await measureStatusRow(page, WORST_CONTENT), width, "최장 내용(미니 시험·1:05:12·배지 126)");

        // 미니 시험은 모드 라벨이 가장 길다 — 실제로 들어가 같은 규칙을 잰다.
        await enterMiniTestMobile(page);
        await expect(page.locator(".mtb-chip")).toHaveText("미니 시험");
        expectStatusRowIntact(await measureStatusRow(page), width, "미니 시험(실제 내용)");
        expectStatusRowIntact(await measureStatusRow(page, WORST_CONTENT), width, "미니 시험 + 최장 시계·배지");
      });
    });
  }

  test.describe("태블릿(768x1024)", () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test("태블릿에서 CSTS 문항이 렌더된다", async ({ page }) => {
      await openSet(page, "CSTS", "CSTS-FL-2402");
      await expect(page.locator("#questionStem")).toBeVisible();
      await expect(page.locator("#options .option").first()).toBeVisible();
    });

    test("태블릿에서도 채점 결과 모달이 표시된다", async ({ page }) => {
      // 768px은 ≤880(모바일 레이아웃) → 모드는 드로어에서, 채점은 하단바로.
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      await page.getByTestId("drawer-open").click();
      await enterExam(page);
      await page.locator("#options .option").first().click();
      await submitGrade(page, "grade-button-m");
      await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 8_000 });
    });

    // 터치 기기다 — 터치 타깃 44px은 폰 폭(≤640px)만이 아니라 모바일 레이아웃 전체(≤880px)의 약속이다.
    // 통계 행의 버튼 크기 규칙이 640px 블록에만 있으면 세로 태블릿(641~880px)은 데스크톱용 32px 버튼을 받는다.
    test("통계 챕터 행의 연습·미니 시험도 터치 타깃 44px을 지킨다", async ({ page }) => {
      await openStatsAfterGrading(page);
      for (const id of ["chapter-practice-btn", "chapter-minitest-btn"]) {
        const box = await page.getByTestId(id).first().boundingBox();
        expect(box!.height, `${id}: 터치 타깃 44px 미만 ${JSON.stringify(box)}`).toBeGreaterThanOrEqual(44);
      }
    });
  });
});
