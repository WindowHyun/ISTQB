import { test, expect } from "@playwright/test";
import { openSet, submitGrade } from "./helpers";

// 시드 랜덤 스모크(살충제 패러독스 대응) — 매 실행 다른 세트·문항·답 조합을 밟되,
// 시드를 로그로 남겨 실패 시 SMOKE_SEED로 정확히 재현한다.
// 오라클이 "UI가 지금 하는 일"이 아니라 **데이터(JSON 정답) 기준 기대 점수**라서,
// 채점 로직이 잘못돼도 스위트가 그 잘못을 봉인하지 않는다(독립 검증 계층).
//
// 재현: SMOKE_SEED=<seed> npx playwright test e2e/react-random-smoke.spec.ts

// mulberry32 — 시드 고정형 PRNG(테스트 내 Math.random 사용 금지 규율 유지).
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface RawQuestion {
  id?: string;
  number: number;
  type?: string;
  options: { key: string; text: string }[];
  answer: string[];
}

// 시드: 환경변수 우선, 없으면 일자 기반(하루 단위로 조합이 회전하되 당일 재실행은 재현 가능).
const SEED = process.env.SMOKE_SEED
  ? Number(process.env.SMOKE_SEED)
  : Number(new Date().toISOString().slice(0, 10).replace(/-/g, ""));

const ISTQB_SETS = [
  { id: "ISTQB-FL-V4-A", path: "istqb/sample-a.json" },
  { id: "ISTQB-FL-V4-B", path: "istqb/sample-b.json" },
  { id: "ISTQB-FL-V4-C", path: "istqb/sample-c.json" },
  { id: "ISTQB-FL-V4-D", path: "istqb/sample-d.json" },
];

test("랜덤 응시 스모크: 무작위 답안 조합의 점수가 데이터 기준 기대값과 일치한다", async ({ page }, testInfo) => {
  const rnd = mulberry32(SEED);
  const set = ISTQB_SETS[Math.floor(rnd() * ISTQB_SETS.length)];
  testInfo.annotations.push({ type: "smoke-seed", description: `SMOKE_SEED=${SEED} set=${set.id}` });
  console.log(`[random-smoke] SMOKE_SEED=${SEED} set=${set.id} (재현: SMOKE_SEED=${SEED})`);

  // 데이터 정답을 독립 채널(HTTP)로 확보 — UI가 아니라 원본 JSON이 오라클이다.
  const res = await page.request.get(`/data/${set.path}`);
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  const questions: RawQuestion[] = data.questions;

  await openSet(page, "ISTQB", set.id);
  await page.locator('.segmented button[data-mode="exam"]').click();
  await page.getByTestId("exam-start-btn").click();

  // 앞쪽 K개 문항에 대해 무작위로 "정답을 정확히 낸다 / 오답 하나를 낸다 / 건너뛴다".
  const K = Math.min(10, questions.length);
  let expectedCorrect = 0;
  for (let i = 0; i < K; i++) {
    const q = questions[i];
    const roll = rnd();
    if (q.options.length > 0 && roll < 0.45) {
      // 정답을 정확히 선택(복수정답 포함) — 옵션 인덱스는 데이터 순서 = 렌더 순서.
      for (const key of q.answer) {
        const idx = q.options.findIndex((o) => o.key.toLowerCase() === key.toLowerCase());
        expect(idx, `${set.id} #${q.number} 정답 키 ${key}가 보기에 없음`).toBeGreaterThanOrEqual(0);
        await page.locator("#options .option").nth(idx).click();
      }
      expectedCorrect += 1;
    } else if (q.options.length > 0 && roll < 0.85) {
      // 오답 하나 선택(정답 아닌 보기 중 무작위) — 복수정답 문항도 개수 미달이라 항상 오답.
      const wrongIdxs = q.options
        .map((o, idx) => ({ o, idx }))
        .filter(({ o }) => !q.answer.some((k) => k.toLowerCase() === o.key.toLowerCase()))
        .map(({ idx }) => idx);
      const pick = wrongIdxs[Math.floor(rnd() * wrongIdxs.length)];
      await page.locator("#options .option").nth(pick).click();
    } // else: 건너뜀(미응답=오답)
    if (i < K - 1) await page.locator("#nextBtn").click();
  }

  // 채점 → 점수가 데이터 기준 기대값과 정확히 일치해야 한다(나머지 문항은 전부 미응답=오답).
  await submitGrade(page);
  await expect(page.getByTestId("result-summary")).toBeVisible();
  await page.getByTestId("result-summary").getByRole("button", { name: "닫기" }).click();
  await expect(page.getByTestId("score")).toHaveText(
    `점수 ${expectedCorrect} / ${questions.length}`,
    { timeout: 8_000 },
  );
});
