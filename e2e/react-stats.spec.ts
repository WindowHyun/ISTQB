import { expect, Page, test } from "./fixtures";
import { enterExam, isReddish, modeBtn, openProduct, openSet, settle, submitGrade } from "./helpers";

// 학습 통계 — 요약·회차 타임라인·약점 분석·챕터 분모.

// ── react-stats.spec.ts에서 합침 ────────────────────────────────────────
interface SeedSet {
  setId: string;
  certification: "istqb" | "csts";
  setTitle: string;
}
// 출처 세트 — index.json의 실제 id·제목이다(통계 화면은 index.json의 제목을 먼저 쓴다). 배치 검사는 화면에 뜬 글자를 이 값과 대조하므로
// 제목이 바뀌면 조용히 다른 길이를 재지 않고 여기서 실패한다.
const SET_A: SeedSet = { setId: "ISTQB-FL-V4-A", certification: "istqb", setTitle: "ISTQB FL v4.0 샘플문제 A" };
const SET_B: SeedSet = { setId: "ISTQB-FL-V4-B", certification: "istqb", setTitle: "ISTQB FL v4.0 샘플문제 B" };
// 폰 폭 한 줄에 다 안 드는 실제 제목들(가장 긴 것과 그다음) — 말줄임 검사는 이 길이에서만 의미가 있다.
const SET_CSTS_LONGEST: SeedSet = { setId: "CSTS-EL-SW-EXAMPLE", certification: "csts", setTitle: "SW 테스트 전문가(CSTS) 자격시험 예제문제_정답포함" };
const SET_CSTS_2018: SeedSet = { setId: "CSTS-EL-2018", certification: "csts", setTitle: "2018년도 CSTS 자격시험 예제(일반등급)" };

interface SeedRound {
  id: string; mode: string; correct: number; total: number; chapter?: string;
  /** 출처 세트 — 생략하면 ISTQB 샘플문제 A. */
  set?: SeedSet;
  /** 응시 시각(ms) — 생략하면 id로 만든 고정 날짜. 날짜 글자 길이가 행 배치에 영향을 주는 검사에서만 준다. */
  at?: number;
  /** 소요 시간·응시 시각이 없는 옛·가져온 이력(두 필드는 선택이고 저장소가 채워 주지 않는다) — 0이 아니라 키 자체를 쓰지 않는다. */
  bare?: boolean;
  /** 챕터별 집계 — 생략하면 '테스트 기초' 하나에 전부. */
  chapterStats?: Record<string, { c: number; t: number }>;
}

// 통계 화면은 "여러 회차가 쌓인 뒤"의 계산이 핵심이라, 실제 풀이로는 원하는 점수 조합을
// 만들기 어렵다 — 이력을 IndexedDB에 직접 심어 화면 수치를 검증한다.
async function seedHistories(page: Page, rounds: SeedRound[]) {
  const resolved = rounds.map((r) => ({ ...r, set: r.set ?? SET_A }));
  await page.goto("/");
  await page.evaluate(async (rounds: (SeedRound & { set: SeedSet })[]) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("istqb-db", 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains("history")) r.result.createObjectStore("history", { keyPath: "id" });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise<void>((res, rej) => {
      const tx = db.transaction("history", "readwrite");
      tx.objectStore("history").clear();
      for (const r of rounds) {
        tx.objectStore("history").put({
          id: r.id, setId: r.set.setId, mode: r.mode, certification: r.set.certification,
          setTitle: r.set.setTitle, answers: {},
          correct: r.correct, total: r.total,
          ...(r.bare ? {} : { elapsedSeconds: 600, createdAt: r.at ?? 1750000000000 + Number(r.id) }),
          chapterStats: r.chapterStats ?? { "테스트 기초": { c: r.correct, t: r.total } },
          ...(r.chapter ? { chapter: r.chapter } : {}),
        });
      }
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }, resolved);
}

async function openStats(page: Page, product: "ISTQB" | "CSTS" = "ISTQB") {
  await openProduct(page, product);
  await page.getByTestId("stats-open").click();
  await expect(page.getByTestId("stats-dashboard")).toBeVisible();
}

const summaryOf = (page: Page) =>
  page.evaluate(() => {
    const d = document.querySelector('[data-testid="stats-dashboard"]')!;
    const q = (s: string) => d.querySelector(s)?.textContent?.trim();
    return {
      attempts: q('.stats-summary div:nth-child(1) strong'),
      avg: q('.stats-summary div:nth-child(2) strong'),
      best: q('.stats-summary div:nth-child(3) strong'),
    };
  });

// 짧은 세션 행을 '보이는 관계'로 잰다 — 마크업 구조(.mr-head·.mr-meta 같은 래퍼)가 아니라 상자와 글자가 어디 서는지만 본다.
async function measureMinis(page: Page) {
  return page.getByTestId("mini-round-item").evaluateAll((rows) => rows.map((li) => {
    const box = (sel: string) => li.querySelector(sel)!.getBoundingClientRect();
    const cs = getComputedStyle(li);
    const row = li.getBoundingClientRect();
    const innerLeft = row.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
    const innerRight = row.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    const chapter = box(".mr-chapter");
    const del = box(".stl-round-del");
    const rate = box(".mr-rate");
    // 말줄임(…)·잘림은 상자 좌표에 안 보인다 — 잘린 칸의 상자는 잘린 크기다. 안쪽 글자 폭(scrollWidth)이 상자(clientWidth)보다 크면 잘린 것이다.
    const cut = (sel: string) => { const e = li.querySelector(sel); return !!e && e.scrollWidth > e.clientWidth + 1; };
    // 글자가 몇 줄에 걸쳐 놓였는가 — 줄바꿈이 실제로 일어났는지(시나리오가 그 경로를 타는지) 본다.
    const lines = (sel: string) => {
      const e = li.querySelector(sel);
      if (!e) return 0;
      const range = document.createRange();
      range.selectNodeContents(e);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    };
    // 스크린리더 전용 글자(.sr-only)는 1px로 접혀 있어 일부러 상자 밖에 걸친다 — 넘침 검사에서 뺀다.
    const overflow = [...li.querySelectorAll<HTMLElement>("*")]
      .filter((el) => !el.classList.contains("sr-only"))
      .filter((el) => el.getBoundingClientRect().right > innerRight + 1 || el.getBoundingClientRect().left < innerLeft - 1)
      .map((el) => el.className);
    return {
      label: li.querySelector(".mr-chapter")!.textContent ?? "",
      set: li.querySelector(".mr-set")?.textContent ?? "",
      delSameLine: Math.abs((del.top + del.height / 2) - (chapter.top + chapter.height / 2)),
      delAtRight: Math.abs(del.right - innerRight),
      rateBelow: rate.top >= chapter.bottom - 1,
      chapterCut: cut(".mr-chapter"), setCut: cut(".mr-set"), setLines: lines(".mr-set"), overflow,
    };
  }));
}

// 짧은 세션 행이 지켜야 할 관계.
function expectMinisFit(minis: Awaited<ReturnType<typeof measureMinis>>) {
  for (const m of minis) {
    const who = `${m.label} · ${m.set}`;
    expect(m.delSameLine, `${who}: ✕가 챕터명 첫 줄에 있지 않다(${m.delSameLine}px)`).toBeLessThanOrEqual(8);
    expect(m.delAtRight, `${who}: ✕가 행의 오른쪽 끝에 붙지 않았다(${m.delAtRight}px)`).toBeLessThanOrEqual(1);
    expect(m.rateBelow, `${who}: 정답률이 첫 줄(챕터명) 아래로 가지 않았다`).toBe(true);
    // 출처 세트의 구분 단서는 이름 끝(A·B)이다 — 말줄임하면 같은 챕터를 두 세트에서 푼 행을 가를 수 없다.
    expect(m.setCut, `${who}: 출처 세트가 말줄임으로 잘렸다`).toBe(false);
    expect(m.chapterCut, `${who}: 챕터명이 말줄임으로 잘렸다`).toBe(false);
    expect(m.overflow, `${who}: 행 안쪽 밖으로 넘친 칸`).toEqual([]);
  }
}

test.describe("학습 통계", () => {
  // 실전 시험 60%·65%, 랜덤 50%, 챕터 미니 90%·100%(각 10문항)
  const MIXED: SeedRound[] = [
    { id: "1000", mode: "exam", correct: 24, total: 40 },
    { id: "2000", mode: "exam", correct: 26, total: 40 },
    { id: "3000", mode: "random", correct: 20, total: 40 },
    { id: "4000", mode: "random", correct: 9, total: 10, chapter: "테스트 기초" },
    { id: "5000", mode: "random", correct: 10, total: 10, chapter: "테스트 도구" },
  ];

  test("요약은 실전 회차만 센다 — 10문항 미니가 최고 정답률을 부풀리지 않는다", async ({ page }) => {
    await seedHistories(page, MIXED);
    await openStats(page);
    // 미니(90%·100%)를 섞으면 최고가 100%로 보였다. 실전 최고는 65%(26/40)다.
    expect(await summaryOf(page)).toEqual({ attempts: "3", avg: "58%", best: "65%" });
  });

  test("응시 횟수와 타임라인 회차 수가 일치한다", async ({ page }) => {
    await seedHistories(page, MIXED);
    await openStats(page);
    const { attempts } = await summaryOf(page);
    const timelineRounds = await page.locator(".stl-rounds li").count();
    // 종전에는 요약 5 / 타임라인 3으로 어긋나, 사라진 2건의 행방을 알 수 없었다.
    expect(Number(attempts)).toBe(timelineRounds);
  });

  test("챕터 미니 회차는 챕터명과 함께 별도로 보인다", async ({ page }) => {
    await seedHistories(page, MIXED);
    await openStats(page);
    const minis = page.getByTestId("mini-round-item");
    await expect(minis).toHaveCount(2);
    // 종전에는 아래 목록에 "랜덤 10/10"으로만 떠 어느 챕터인지 알 수 없었다.
    await expect(minis.first()).toContainText("테스트 도구");
    await expect(minis.first()).toContainText("100%");
  });

  test("랜덤을 풀어도 시험 성장폭 배지가 사라지지 않는다", async ({ page }) => {
    const exams: SeedRound[] = [
      { id: "1000", mode: "exam", correct: 20, total: 40 }, // 50%
      { id: "2000", mode: "exam", correct: 30, total: 40 }, // 75%
    ];
    await seedHistories(page, exams);
    await openStats(page);
    await expect(page.getByTestId("stl-improve")).toHaveText(/시험.*\+25%p/);

    // 시험 실력은 그대로인데 랜덤만 한 번 추가 — 종전에는 배지가 통째로 사라졌다.
    await seedHistories(page, [...exams, { id: "3000", mode: "random", correct: 20, total: 40 }]);
    await openStats(page);
    await expect(page.getByTestId("stl-improve")).toHaveText(/시험.*\+25%p/);
  });

  test("회차를 1건만 삭제할 수 있다", async ({ page }) => {
    await seedHistories(page, MIXED);
    await openStats(page);
    expect((await summaryOf(page)).attempts).toBe("3");

    await page.getByTestId("round-delete-btn").first().click();
    // 이력을 통째로 버리지 않고 잘못된 회차 하나만 정리할 수 있어야 한다.
    await expect.poll(async () => (await summaryOf(page)).attempts).toBe("2");
  });

  test("중복이던 전체 이력 목록은 없고, 소요 시간·날짜는 회차에 남아 있다", async ({ page }) => {
    await seedHistories(page, MIXED);
    await openStats(page);
    await expect(page.locator(".stats-list")).toHaveCount(0);
    const firstRound = page.locator(".stl-rounds li").first();
    await expect(firstRound).toContainText("소요");      // 라벨 없이 "10:00"이면 시각으로 읽힌다
    // 날짜만 찍으면 하루 여러 번 응시했을 때 구분이 안 돼 시각을 함께 표기한다(C2).
    // 로케일은 ko-KR로 고정 — 기기 설정과 무관하게 같은 형식이어야 한다.
    await expect(firstRound).toContainText(/\d+월 \d+일 \d{2}:\d{2}/);
  });

  test("좁은 화면에서 회차 항목이 글자 단위로 쪼개지지 않는다", async ({ page }) => {
    await seedHistories(page, MIXED);
    await openStats(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await settle(page);
    const worst = await page.locator(".stl-rounds li").evaluateAll((els) => {
      let maxLines = 1;
      for (const el of els) {
        for (const child of Array.from(el.children) as HTMLElement[]) {
          const lh = parseFloat(getComputedStyle(child).lineHeight) || 16;
          maxLines = Math.max(maxLines, Math.round(child.getBoundingClientRect().height / lh));
        }
      }
      return maxLines;
    });
    // "1회"가 "1/회"로 쪼개지면 2줄이 된다(한국어 min-content = 한 글자).
    expect(worst).toBe(1);
  });

  // 합격선 미만(ISTQB 65%)은 행 테두리를 두르지 않고 정답률 숫자만 붉게 한다 — 챕터 행과 같은 규칙. 행마다 빨간 테두리가
  // 둘리면 아직 합격하지 못한 사용자에게는 목록 전체가 오류 화면처럼 읽힌다. 색 값이 아니라 관계(붉은 기)를 잰다.
  test("미달 회차·짧은 세션은 행 테두리가 아니라 정답률 숫자만 붉고, 스크린리더에는 글자로 읽힌다", async ({ page }) => {
    await seedHistories(page, [
      { id: "1000", mode: "exam", correct: 24, total: 40 },                              // 60% 미달
      { id: "2000", mode: "exam", correct: 26, total: 40 },                              // 65% 통과(합격선 이상)
      { id: "4000", mode: "random", correct: 4, total: 10, chapter: "테스트 기초" },     // 40% 미달
      { id: "5000", mode: "random", correct: 9, total: 10, chapter: "테스트 도구" },     // 90% 통과
    ]);
    await openStats(page);

    for (const [list, rate] of [[".stl-rounds li", ".stl-round-rate"], [".mini-rounds li", ".mr-rate"]] as const) {
      const rows = await page.locator(list).evaluateAll((els, rateSel) => els.map((el) => ({
        weak: el.classList.contains("weak"),
        border: getComputedStyle(el).borderTopColor,
        rate: getComputedStyle(el.querySelector(rateSel)!).color,
        // 붉은색은 눈으로 보는 단서일 뿐이다 — 같은 판정이 정답률 칸 안의 글자로도 있어야 한다.
        cue: /합격선 미만/.test(el.querySelector(rateSel)!.textContent ?? ""),
      })), rate);
      expect(rows.some((r) => r.weak), `${list}: 미달 행이 없다 — 시드가 바뀌었다`).toBe(true);
      expect(rows.some((r) => !r.weak), `${list}: 통과 행이 없다 — 시드가 바뀌었다`).toBe(true);
      for (const r of rows) {
        expect(isReddish(r.border), `${list}: 행 테두리가 붉다(${r.border}) — 미달은 정답률 숫자로만 짚는다`).toBe(false);
        expect(isReddish(r.rate), `${list}: ${r.weak ? "미달 행의 정답률이 붉지 않다" : "통과 행의 정답률이 붉다"}(${r.rate})`).toBe(r.weak);
        expect(r.cue, `${list}: ${r.weak ? "미달 행에 '합격선 미만' 글자가 없다" : "통과 행에 '합격선 미만' 글자가 있다"}`).toBe(r.weak);
      }
    }
  });

  // 합격선 미만 챕터도 같은 규칙이다 — 붉은 숫자·막대 말고 스크린리더가 읽는 글자가 정답률 칸에 있다. 통과 챕터에는 없다.
  test("합격선 미만 챕터에만 '합격선 미만' 글자가 붙는다", async ({ page }) => {
    await seedHistories(page, [{
      id: "1000", mode: "exam", correct: 30, total: 40,
      chapterStats: { "테스트 기초": { c: 2, t: 10 }, "테스트 도구": { c: 9, t: 10 } }, // 20% 미달 · 90% 통과(둘 다 표본 5 이상)
    }]);
    await openStats(page);
    const rows = await page.getByTestId("stats-chapter-row").evaluateAll((els) => els.map((el) => ({
      name: el.querySelector(".sc-name")!.textContent,
      weak: el.classList.contains("weak"),
      cue: /합격선 미만/.test(el.querySelector(".sc-rate")!.textContent ?? ""),
    })));
    expect(rows.map((r) => [r.name, r.weak]), "순위 행이 시드와 다르다(정답률 낮은 순)").toEqual([["테스트 기초", true], ["테스트 도구", false]]);
    for (const r of rows) expect(r.cue, `${r.name}: ${r.weak ? "미달 챕터에 '합격선 미만' 글자가 없다" : "통과 챕터에 '합격선 미만' 글자가 있다"}`).toBe(r.weak);
  });

  // 가져온 백업의 createdAt은 '유한한 수'이기만 하면 통과한다(sanitizeHistory) — 1e20 같은 값은 Date가 Invalid Date로 읽고
  // Intl 포매터는 그것에 RangeError를 던진다. 종전에는 행 하나 때문에 통계 화면 전체가 오류 경계 뒤로 사라졌고, '이력 비우기'도 그
  // 화면 안에 있어 손상된 기록을 지울 길이 없었다. (페이지 예외는 fixtures의 자동 검사가 함께 잡는다.)
  test("읽을 수 없는 응시 시각이 든 이력이 있어도 통계가 열리고 그 회차를 지울 수 있다", async ({ page }) => {
    await seedHistories(page, [
      { id: "1000", mode: "exam", correct: 24, total: 40, at: 1e20 },
      { id: "2000", mode: "exam", correct: 26, total: 40 },
    ]);
    await openStats(page);
    const rows = page.locator(".stl-rounds li");
    await expect(rows, "손상된 시각 한 건 때문에 회차 목록이 사라졌다").toHaveCount(2);
    // 날짜 칸만 빠지고 나머지(정답률·소요 시간·✕)는 그대로다.
    const broken = rows.filter({ hasNot: page.locator(".stl-round-date") });
    await expect(broken, "읽을 수 없는 시각이면 날짜 칸을 그리지 않는다").toHaveCount(1);
    await expect(broken).toContainText("소요");
    await broken.getByTestId("round-delete-btn").click();
    await expect(rows).toHaveCount(1);
    await expect(page.locator(".stl-round-date")).toHaveCount(1);
  });

  // 배치는 위치가 아니라 규칙으로 잰다. 회차 행이 40px 들여써지고(ol 기본 여백) 짧은 세션의 ✕가 셋째 줄로 떨어지던 결함 —
  // 둘 다 눌러지고 읽히므로 기능 검사는 통과했다. 날짜가 가장 긴 형식('10월 28일 23:30')·가장 긴 챕터명으로 잰다.
  // 같은 챕터를 세트 A·B에서 푼 두 행도 함께 심는다 — 둘을 가르는 단서가 출처 세트 이름의 끝(A·B)이라, 잘리면 두 행이 같아 보인다.
  // 상자 좌표만 재면 말줄임(…)으로 잘린 글자도 통과하므로(잘린 칸의 상자는 잘린 크기다) scrollWidth로 따로 본다.
  for (const width of [320, 360, 390]) {
    test(`회차·짧은 세션 행의 배치 — ${width}px`, async ({ page }) => {
      const at = (day: number) => new Date(2025, 9, day, 23, 30).getTime(); // 10월 N일 23:30 — 월·일이 모두 두 자리
      const longest = "테스트 분석 및 설계(기법)"; // 실제 챕터명 중 가장 길다
      await seedHistories(page, [
        { id: "1000", mode: "exam", correct: 24, total: 40, at: at(21) },
        { id: "2000", mode: "exam", correct: 26, total: 40, at: at(24) },
        { id: "3000", mode: "exam", correct: 30, total: 40, at: at(28) },
        { id: "4000", mode: "random", correct: 4, total: 10, chapter: longest, at: at(25), set: SET_A },
        { id: "5000", mode: "random", correct: 9, total: 10, chapter: longest, at: at(27), set: SET_B },
        { id: "6000", mode: "random", correct: 7, total: 10, chapter: "테스트 도구", at: at(26), set: SET_B },
      ]);
      await openStats(page);
      await page.setViewportSize({ width, height: 1400 });
      await settle(page);

      // ① 회차 행은 카드 안쪽 여백에 맞춰 선다 — 들여쓰기(ol 기본 padding 40px)가 없다.
      const timeline = await page.locator(".set-timeline").first().evaluate((card) => {
        const head = card.querySelector(".stl-head")!.getBoundingClientRect();
        // 행의 안쪽 오른쪽 끝(테두리·패딩 안) — 소요 시간·✕가 붙어야 하는 자리.
        const inner = (li: Element) => {
          const cs = getComputedStyle(li);
          return li.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
        };
        const rows = [...card.querySelectorAll<HTMLElement>(".stl-rounds li")].map((li) => {
          const box = li.getBoundingClientRect();
          const time = li.querySelector(".stl-round-time")?.getBoundingClientRect();
          const date = li.querySelector(".stl-round-date")?.getBoundingClientRect();
          const del = li.querySelector(".stl-round-del")!.getBoundingClientRect();
          return {
            left: box.left, right: box.right, innerRight: inner(li),
            // 칸이 없으면 null — 없는 칸의 관계를 0으로 쳐서 통과시키지 않는다.
            timeRight: time ? time.right : null,
            dateDelSameLine: date ? Math.abs((date.top + date.height / 2) - (del.top + del.height / 2)) : null,
          };
        });
        return { headLeft: head.left, headRight: head.right, rows };
      });
      expect(timeline.rows, "회차 행은 시드한 시험 세 건이다").toHaveLength(3);
      for (const r of timeline.rows) {
        expect(Math.abs(r.left - timeline.headLeft), `회차 행이 카드 안쪽 여백에 맞지 않는다(들여쓰기): 행 ${r.left} · 카드 ${timeline.headLeft}`).toBeLessThanOrEqual(1);
        expect(r.right, "회차 행이 카드 오른쪽을 넘었다").toBeLessThanOrEqual(timeline.headRight + 1);
        // ② 소요 시간은 모든 회차 행에서 행의 오른쪽 끝에 붙는다 — 첫 회차(증감 없음)만 왼쪽에 붙던 결함. 줄이 접혀도 같은 쪽이다.
        expect(r.timeRight, "소요 시간 칸이 없다 — 시드가 바뀌었다").not.toBeNull();
        expect(Math.abs(r.timeRight! - r.innerRight), `소요 시간이 오른쪽 끝에 붙지 않았다: ${r.timeRight} · 행 안쪽 끝 ${r.innerRight}`).toBeLessThanOrEqual(1);
        // ③ 날짜와 ✕는 한 덩어리 — 줄이 접혀도 ✕만 혼자 아랫줄로 떨어지지 않는다.
        expect(r.dateDelSameLine, "날짜 칸이 없다 — 시드가 바뀌었다").not.toBeNull();
        expect(r.dateDelSameLine!, `회차 행의 ✕가 날짜와 다른 줄에 있다(${r.dateDelSameLine}px)`).toBeLessThanOrEqual(6);
      }

      // ④ 짧은 세션: ✕는 첫 줄 오른쪽 끝에 서고(혼자 셋째 줄로 떨어지지 않는다), 챕터명·출처 세트는 잘리지 않으며, 모든 칸이 행 안쪽에 든다.
      const minis = await measureMinis(page);
      expect(minis.map((m) => `${m.label} | ${m.set}`).sort(), "화면에 뜬 챕터·출처 세트가 시드와 다르다").toEqual([
        `${longest} | ${SET_A.setTitle}`,
        `${longest} | ${SET_B.setTitle}`,
        `테스트 도구 | ${SET_B.setTitle}`,
      ].sort());
      expectMinisFit(minis);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), "페이지가 가로로 넘친다").toBeLessThanOrEqual(0);
    });
  }

  // 폰 폭 한 줄에 다 안 드는 실제 CSTS 제목 — 출처 세트는 말줄임 없이 줄바꿈해서 끝까지 보인다. (ISTQB 샘플문제 A·B는 이름이 짧아
  // 한 줄에 들어오므로 위 검사만으로는 이 규칙이 재어지지 않는다.) 줄바꿈이 실제로 일어났는지도 본다 — 레이아웃이 바뀌어 한 줄에 다
  // 들어오게 되면 이 시나리오는 더는 말줄임을 재지 못하는데, 그 사실을 통과로 숨기지 않고 실패로 알린다.
  for (const width of [320, 360, 390]) {
    test(`가장 긴 CSTS 출처 세트도 말줄임 없이 끝까지 보인다 — ${width}px`, async ({ page }) => {
      await seedHistories(page, [
        { id: "4000", mode: "random", correct: 4, total: 10, chapter: "테스트 프로세스와 도구", set: SET_CSTS_LONGEST },
        { id: "5000", mode: "random", correct: 9, total: 10, chapter: "소프트웨어 개발과 테스트", set: SET_CSTS_2018 },
      ]);
      await openStats(page, "CSTS");
      await page.setViewportSize({ width, height: 1400 });
      await settle(page);

      const minis = await measureMinis(page);
      expect(minis.map((m) => `${m.label} | ${m.set}`).sort(), "화면에 뜬 챕터·출처 세트가 시드와 다르다").toEqual([
        `테스트 프로세스와 도구 | ${SET_CSTS_LONGEST.setTitle}`,
        `소프트웨어 개발과 테스트 | ${SET_CSTS_2018.setTitle}`,
      ].sort());
      // 잘림(말줄임)을 먼저 본다 — 잘렸다면 그것이 결함이고, 줄바꿈 전제는 잘리지도 않았는데 한 줄이라는 뜻일 때만 의미가 있다.
      expectMinisFit(minis);
      expect(Math.max(...minis.map((m) => m.setLines)), "긴 출처 세트가 줄바꿈되지 않았다 — 이 시나리오는 더는 말줄임을 재지 못한다").toBeGreaterThan(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), "페이지가 가로로 넘친다").toBeLessThanOrEqual(0);
    });
  }

  // 소요 시간·응시 시각은 선택 필드다(옛·가져온 이력에는 키 자체가 없고 저장소가 채워 주지 않는다). 그 회차의 ✕도 오른쪽 끝에 서야 한다 —
  // 정답률 바로 뒤가 ✕인 경우다.
  test("소요 시간·날짜가 없는 옛 회차도 ✕가 행의 오른쪽 끝에 선다", async ({ page }) => {
    await seedHistories(page, [
      { id: "1000", mode: "exam", correct: 24, total: 40, bare: true },
      { id: "2000", mode: "exam", correct: 26, total: 40 },
    ]);
    await openStats(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await settle(page);
    const rows = await page.locator(".stl-rounds li").evaluateAll((lis) => lis.map((li) => {
      const cs = getComputedStyle(li);
      const innerRight = li.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
      return {
        hasTime: !!li.querySelector(".stl-round-time"),
        hasDate: !!li.querySelector(".stl-round-date"),
        // 양쪽으로 잰다 — ✕가 행 안쪽 끝을 넘어 밀려나도(음수) 어긋난 것이다.
        delGap: Math.abs(innerRight - li.querySelector(".stl-round-del")!.getBoundingClientRect().right),
      };
    }));
    // 시드가 의도대로 만들어졌는지 먼저 본다: 소요·날짜가 모두 없는 행 하나, 모두 있는 행 하나.
    const bare = rows.filter((r) => !r.hasTime && !r.hasDate);
    expect(bare, "소요·날짜가 모두 없는 행은 시드한 한 건이다").toHaveLength(1);
    expect(rows.filter((r) => r.hasTime && r.hasDate), "소요·날짜가 모두 있는 행은 나머지 한 건이다").toHaveLength(1);
    // 소요·날짜가 있는 행의 ✕는 날짜 바로 뒤(둘째 줄)에 서는 것이 설계다 — 오른쪽 끝에 붙어야 하는 것은 정답률 바로 뒤가 ✕인 행이다.
    expect(bare[0].delGap, `소요·날짜 없는 행의 ✕가 오른쪽 끝에서 ${bare[0].delGap}px 떨어져 있다`).toBeLessThanOrEqual(1);
  });
});

// 표본이 적은 챕터는 순위에서 분리한다 — 정답률만으로 줄 세우면 1문항 챕터가 늘 1위 약점이 된다.
test.describe("약점 분석 표본", () => {
  test("5문항 미만 챕터는 순위가 아니라 '판단 이른 챕터'로 분리된다", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const r = indexedDB.open("istqb-db", 1);
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains("history")) r.result.createObjectStore("history", { keyPath: "id" });
        };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      await new Promise<void>((res, rej) => {
        const tx = db.transaction("history", "readwrite");
        tx.objectStore("history").clear();
        tx.objectStore("history").put({
          id: "1000", setId: "ISTQB-FL-V4-A", mode: "exam", certification: "istqb",
          setTitle: "샘플 A", answers: {}, correct: 2, total: 21, elapsedSeconds: 600,
          createdAt: 1750000001000,
          chapterStats: {
            "테스트 도구": { c: 0, t: 2 },   // 0% — 표본 2 (종전 1위 약점)
            "테스트 기법": { c: 2, t: 19 },  // 10% — 표본 19 (진짜 약점)
          },
        });
        tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
      });
    });
    await openProduct(page, "ISTQB");
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard")).toBeVisible();

    // 순위 1위는 표본이 충분한 '테스트 기법'이어야 한다.
    const ranked = page.getByTestId("stats-chapter-row");
    await expect(ranked).toHaveCount(1);
    await expect(ranked.first()).toContainText("테스트 기법");
    // 표본 2짜리는 순위가 아니라 보류 그룹으로.
    const low = page.getByTestId("stats-lowsample-row");
    await expect(low).toHaveCount(1);
    await expect(low.first()).toContainText("테스트 도구");
    await expect(page.getByTestId("stats-lowsample")).toContainText("판단하기 이른");
  });

  test("좁은 화면에서 챕터명이 어절 중간에서 끊기지 않는다", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const r = indexedDB.open("istqb-db", 1);
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains("history")) r.result.createObjectStore("history", { keyPath: "id" });
        };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      await new Promise<void>((res, rej) => {
        const tx = db.transaction("history", "readwrite");
        tx.objectStore("history").clear();
        tx.objectStore("history").put({
          id: "1000", setId: "ISTQB-FL-V4-A", mode: "exam", certification: "istqb",
          setTitle: "샘플 A", answers: {}, correct: 5, total: 40, elapsedSeconds: 600,
          createdAt: 1750000001000,
          // 실제 CSTS 챕터명 — 좁은 열에서 "…테스 / 트"로 꺾이던 이름들.
          chapterStats: {
            "소프트웨어 개발과 테스트": { c: 1, t: 13 },
            "테스트 프로세스와 도구": { c: 2, t: 12 },
            "SDLC 전반의 테스트": { c: 2, t: 15 },
          },
        });
        tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
      });
    });
    await openProduct(page, "ISTQB");
    // 통계는 데스크톱 폭에서 연다 — 모바일에선 stats-open이 드로어 안에 있다.
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);

    // 줄 수를 세는 대신 '어절이 두 줄에 걸쳐 있는가'를 직접 본다 — 이름이 길어 두 줄이
    // 되는 것 자체는 정상이고, 문제는 "테스 / 트"처럼 어절 내부가 끊기는 것이다.
    // Range의 클라이언트 사각형이 2개 이상이면 그 어절이 줄바꿈으로 쪼개졌다는 뜻이다.
    const split = await page.locator(".sc-name").evaluateAll((els) => {
      const bad: string[] = [];
      for (const el of els) {
        const node = el.firstChild;
        if (!node || node.nodeType !== Node.TEXT_NODE) continue;
        const text = node.textContent ?? "";
        let at = 0;
        for (const word of text.split(" ")) {
          if (word.length > 1) {
            const range = document.createRange();
            range.setStart(node, at);
            range.setEnd(node, at + word.length);
            if (range.getClientRects().length > 1) bad.push(`${text} → ${word}`);
          }
          at += word.length + 1;
        }
      }
      return bad;
    });
    expect(split).toEqual([]);
  });
});

// 종전에는 회차별 출제 수를 그대로 더해, 같은 세트를 두 번 풀면 챕터 분모가 두 배가 됐다.
// 화면은 "0/18"인데 연습 버튼을 누르면 6문항이 나와 두 숫자가 서로 맞지 않았다.
test.describe("챕터 분모 — 재풀이", () => {
  async function gradeExamOnce(page: Page, fresh: boolean) {
    await page.locator('.segmented button[data-mode="exam"]').click();
    if (fresh) {
      const resume = page.getByTestId("graded-resume-fresh");
      if (await resume.count()) await resume.click();
    }
    const gate = page.getByTestId("exam-start-btn");
    if (await gate.count()) await gate.click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    await page.locator("#options .option").first().click();
    await page.getByTestId("grade-button").click();
    const confirm = page.getByTestId("confirm-grade");
    if (await confirm.count()) await confirm.click();
    await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();
  }

  // 챕터 행의 분모(t)만 모아 합한다. 순위 그룹은 "38% (3/8)", 보류 그룹은 "3/8문항"으로
  // 표기가 달라 두 형식을 모두 읽는다 — 한쪽만 세면 합계가 조용히 모자란다.
  async function denominatorSum(page: Page) {
    return page.locator(".sc-rate").evaluateAll((els) =>
      els.reduce((sum, el) => {
        const m = (el.textContent || "").match(/\d+\s*\/\s*(\d+)/);
        return sum + (m ? Number(m[1]) : 0);
      }, 0));
  }

  test("같은 세트를 두 번 풀어도 챕터 분모가 늘지 않는다", async ({ page }) => {
    await openProduct(page, "ISTQB"); // 샘플 A = 40문항

    await gradeExamOnce(page, false);
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard")).toBeVisible();
    const after1 = await denominatorSum(page);
    await page.getByRole("button", { name: "닫기", exact: true }).first().click();

    await gradeExamOnce(page, true);
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard")).toBeVisible();
    const after2 = await denominatorSum(page);

    // 세트 문항 수와 같아야 하고, 두 번 풀어도 그대로여야 한다(종전이면 40 → 80).
    expect(after1).toBe(40);
    expect(after2).toBe(40);
  });
});

// 세트 간 재수록(기출 재출제) — 같은 문제가 여러 세트에 실려 있는데 id는 세트마다 다르다.
// id 비교만으로는 걸러지지 않아, 2404를 풀고 2405를 푼 사용자에게서 같은 문제가 챕터
// 분모에 두 번 들어갔다. 위 "재풀이" 테스트는 단일 세트라 이 경로를 지나지 않는다.
test.describe("챕터 분모 — 세트 간 재수록", () => {
  // index.json의 duplicateGroups에 실제로 들어 있는 그룹.
  const DUP = ["CSTS-FL-2404-001", "CSTS-FL-2405-001"];
  const UNIQ_2404 = ["CSTS-FL-2404-011", "CSTS-FL-2404-012"];
  const UNIQ_2405 = ["CSTS-FL-2405-021", "CSTS-FL-2405-022"];
  const CH = "소프트웨어 테스트 기초";

  async function seedCstsRounds(page: Page) {
    await page.goto("/");
    await page.evaluate(async (p: { dup: string[]; u4: string[]; u5: string[]; ch: string }) => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const r = indexedDB.open("istqb-db", 1);
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains("history")) r.result.createObjectStore("history", { keyPath: "id" });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const round = (id: string, setId: string, ids: string[], at: number) => ({
        id, setId, mode: "exam", certification: "csts", setTitle: setId,
        answers: {}, correct: ids.length, total: ids.length, elapsedSeconds: 600, createdAt: at,
        chapterStats: { [p.ch]: { c: ids.length, t: ids.length } },
        chapterQuestions: { [p.ch]: { ok: ids, no: [] } },
      });
      await new Promise<void>((res, rej) => {
        const tx = db.transaction("history", "readwrite");
        tx.objectStore("history").clear();
        // 2404 회차: 재수록 1문항 + 고유 2문항 / 2405 회차: 같은 문제의 다른 id + 고유 2문항
        tx.objectStore("history").put(round("r1", "CSTS-FL-2404", [p.dup[0], ...p.u4], 1750000001000));
        tx.objectStore("history").put(round("r2", "CSTS-FL-2405", [p.dup[1], ...p.u5], 1750000002000));
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    }, { dup: DUP, u4: UNIQ_2404, u5: UNIQ_2405, ch: CH });
  }

  test("같은 문제가 두 세트에 실려 있어도 분모를 한 번만 센다", async ({ page }) => {
    await seedCstsRounds(page);
    await openProduct(page, "CSTS");
    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard")).toBeVisible();

    // 두 회차 합계 6문항이지만 그중 한 쌍이 같은 문제이므로 분모는 5여야 한다.
    // 중복 제거가 없으면 6이 나온다(수정 전 코드에서 실패하는 것을 확인함).
    const denom = await page.locator(".sc-rate").evaluateAll((els) =>
      els.reduce((sum, el) => {
        const m = (el.textContent || "").match(/\d+\s*\/\s*(\d+)/);
        return sum + (m ? Number(m[1]) : 0);
      }, 0));
    expect(denom).toBe(5);
  });
});

// ── react-phase2.spec.ts에서 합침 ────────────────────────────────────────
// Phase 2 — 학습 누적: 결과 모달의 "직전 회차 대비" 비교 + 학습 통계의 세트별 회차 타임라인.

test.describe("학습 누적 — 회차 비교·타임라인(Phase 2)", () => {
  test("첫 응시엔 '첫 응시', 재응시엔 회차·직전 대비가 결과 모달에 뜬다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");

    // 1회차 — 첫 응시 안내.
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    const compare = page.getByTestId("result-compare");
    await expect(compare).toBeVisible();
    await expect(compare).toContainText("1회차");
    await expect(compare).toContainText("첫 응시");
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    // 잠금 해제 후 재응시(채점된 시험 재진입 → 초기화) — 2회차.
    await modeBtn(page, "연습").click();
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await expect(compare).toBeVisible();
    await expect(compare).toContainText("2회차");
    await expect(compare).toContainText("직전");
    await expect(page.getByTestId("result-delta")).toBeVisible();
  });

  test("학습 통계에 세트별 회차 타임라인이 누적된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");

    // 2회 응시해 회차를 쌓는다.
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    await modeBtn(page, "연습").click();
    await enterExam(page);
    await page.locator("#options .option").first().click();
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    // 학습 통계 열기 → 세트별 회차 타임라인에 2회차가 표시된다.
    await page.getByTestId("stats-open").click();
    const timeline = page.getByTestId("stats-set-timeline");
    await expect(timeline).toBeVisible();
    const item = page.getByTestId("set-timeline-item").first();
    await expect(item).toContainText("2회차");
    // 회차 칩(1회/2회)이 렌더된다.
    await expect(item.locator(".stl-rounds li")).toHaveCount(2);
  });

  // QA12 — 델타 "존재"만이 아니라 "방향"을 검증한다. 오라클은 UI가 아니라 원본 JSON:
  // 데이터 기준으로 점수를 올리고(오답→정답) 내려서(정답→오답) ▲/▼가 실변화와 일치하는지 본다.
  test("직전 대비 델타의 방향(▲/▼)이 데이터 기준 점수 변화와 일치한다", async ({ page }) => {
    const res = await page.request.get("/data/istqb/sample-a.json");
    expect(res.ok()).toBeTruthy();
    const q1 = (await res.json()).questions[0];
    const correctIdxs: number[] = q1.answer.map((k: string) =>
      q1.options.findIndex((o: { key: string }) => o.key.toLowerCase() === k.toLowerCase()));
    expect(correctIdxs.every((i) => i >= 0)).toBeTruthy();
    const wrongIdx = q1.options.findIndex(
      (o: { key: string }) => !q1.answer.some((k: string) => k.toLowerCase() === o.key.toLowerCase()));
    expect(wrongIdx).toBeGreaterThanOrEqual(0);

    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");

    // 1회차(기준): 1번 문항 오답 → 0점.
    await enterExam(page);
    await page.locator("#options .option").nth(wrongIdx).click();
    await submitGrade(page);
    const delta = page.getByTestId("result-delta");

    // 2회차: 다시 풀기 → 시작 게이트 재통과 → 1번 정답 → 점수 상승 = ▲.
    await page.getByTestId("result-retry").click();
    await page.getByTestId("exam-start-btn").click();
    for (const idx of correctIdxs) await page.locator("#options .option").nth(idx).click();
    await submitGrade(page);
    await expect(delta).toContainText("▲");

    // 3회차: 다시 오답 → 점수 하락 = ▼.
    await page.getByTestId("result-retry").click();
    await page.getByTestId("exam-start-btn").click();
    await page.locator("#options .option").nth(wrongIdx).click();
    await submitGrade(page);
    await expect(delta).toContainText("▼");
  });
});

// ── react-weakness.spec.ts에서 합침 ────────────────────────────────────────
// Phase 3: 챕터별 약점 분석·챕터 집중 연습·오답노트 전 회차 합산.

// 현재 표시 중인 문항을 데이터 정답으로 맞힌다(세트 JSON에서 정답 키를 조회).
async function answerCurrentCorrectly(page: Page, setPath: string) {
  const data = await (await page.request.get(`/data/${setPath}`)).json();
  const title = (await page.locator("#questionTitle").textContent()) || "";
  const num = parseInt(title.match(/문제 (\d+)/)?.[1] || "0", 10);
  const q = data.questions.find((x: { number: number }) => x.number === num);
  for (const key of q.answer) {
    await page
      .locator("#options .option")
      .filter({ has: page.locator(".option-key", { hasText: new RegExp(`^${key.toUpperCase()}$`) }) })
      .first()
      .click();
  }
}

test.describe("약점 분석(Phase 3)", () => {
  test("채점하면 통계에 챕터별 정답률이 뜨고, '연습'으로 챕터 집중 연습에 진입한다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await enterExam(page);
    await submitGrade(page); // 전부 미응답 채점 → 챕터 전부 0%
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    await page.getByTestId("stats-open").click();
    const chapters = page.getByTestId("stats-chapters");
    await expect(chapters).toBeVisible();
    // ISTQB 세트 A는 6개 챕터 전부 출제(공식 청사진 8/6/4/11/9/2).
    // 1회 응시로는 '정적 테스트'(4문항)·'테스트 도구'(2문항)가 최소 표본(5)에 못 미쳐
    // 순위가 아니라 '판단 이른 챕터'로 분리된다 — 표본 2짜리가 1위 약점이 되는 왜곡 방지.
    await expect(page.getByTestId("stats-chapter-row")).toHaveCount(4);
    await expect(page.getByTestId("stats-lowsample-row")).toHaveCount(2);
    // 0%라 전부 약점(빨간) 표시 — 첫 행 기준만 확인.
    await expect(page.getByTestId("stats-chapter-row").first()).toHaveClass(/weak/);

    // 첫 행(가장 약한 챕터)의 '연습' → 통계 닫히고 연습 모드 + 필터 배너.
    const firstName = (await page.locator(".sc-name").first().textContent()) || "";
    await page.getByTestId("chapter-practice-btn").first().click();
    await expect(page.getByTestId("stats-dashboard")).toHaveCount(0);
    const banner = page.getByTestId("chapter-filter-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(firstName.trim());
    await expect(page.locator('.segmented button[data-mode="practice"]')).toHaveAttribute("aria-pressed", "true");
    // 필터가 실제로 적용됨: 팔레트 문항 수 < 40, 배너 표기와 일치.
    const filtered = await page.locator("#questionNav button").count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(40);
    await expect(banner).toContainText(`${filtered}문항`);
    // 전체 보기로 해제하면 40문항으로 복귀.
    await page.getByTestId("chapter-filter-clear").click();
    await expect(page.locator("#questionNav button")).toHaveCount(40);
  });

  test("오답노트는 전 회차 합산 — 최신 회차에서 맞힌 문항도 이전 회차 오답이면 남는다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    // 1회차(시험): 전부 미응답 → 40문항 전부 오답.
    await enterExam(page);
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
    // 2회차(같은 세트 시험 재응시): 첫 문항만 정답 → 최신 회차 오답 39.
    // 종전에는 랜덤으로 2회차를 만들었는데 그 진입로가 사라졌다(퀵에 흡수). 이 검사가 재는
    // 것은 '세트 단위 회차가 둘일 때 오답이 합산되는가'이므로, 회차를 만드는 모드가
    // 무엇인지는 본질이 아니다 — 활성 탭 재클릭 = 원클릭 재응시로 같은 세트 2회차를 만든다.
    await modeBtn(page, "시험").click();
    // 재응시는 examStarted도 함께 해제해 시작 게이트를 다시 띄운다(Sidebar의 handleModeChange).
    // 게이트를 통과하지 않으면 워크스페이스가 가려져 지문이 뜨지 않는다.
    const gate2 = page.getByTestId("exam-start-btn");
    if (await gate2.count()) await gate2.click();
    await expect(page.locator("#questionStem")).toBeVisible();
    await answerCurrentCorrectly(page, "istqb/sample-a.json");
    await submitGrade(page);
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();

    // 최신 회차만 보여주면 39 — 합산이므로 40이어야 한다.
    await page.getByRole("button", { name: "오답 노트" }).click();
    const setBtn = page.getByTestId("wrong-note-set-btn").first();
    await expect(setBtn).toContainText("오답 40");
  });
});
