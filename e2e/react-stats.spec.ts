import { expect, Page, test } from "./fixtures";
import { enterExam, modeBtn, openProduct, openSet, submitGrade } from "./helpers";

// 학습 통계 — 요약·회차 타임라인·약점 분석·챕터 분모.

// ── react-stats.spec.ts에서 합침 ────────────────────────────────────────
interface SeedRound {
  id: string; mode: string; correct: number; total: number; chapter?: string;
}

// 통계 화면은 "여러 회차가 쌓인 뒤"의 계산이 핵심이라, 실제 풀이로는 원하는 점수 조합을
// 만들기 어렵다 — 이력을 IndexedDB에 직접 심어 화면 수치를 검증한다.
async function seedHistories(page: Page, rounds: SeedRound[]) {
  await page.goto("/");
  await page.evaluate(async (rounds: SeedRound[]) => {
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
          id: r.id, setId: "ISTQB-FL-V4-A", mode: r.mode, certification: "istqb",
          setTitle: "ISTQB FL v4.0 샘플문제 A", answers: {},
          correct: r.correct, total: r.total, elapsedSeconds: 600,
          createdAt: 1750000000000 + Number(r.id),
          chapterStats: { "테스트 기초": { c: r.correct, t: r.total } },
          ...(r.chapter ? { chapter: r.chapter } : {}),
        });
      }
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }, rounds);
}

async function openStats(page: Page) {
  await openProduct(page, "ISTQB");
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
    await page.waitForTimeout(150);
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
    await page.waitForTimeout(150);

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
