import { test, expect, Page } from "@playwright/test";
import { openProduct } from "./helpers";

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
