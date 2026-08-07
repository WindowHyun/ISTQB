import { test, expect, Page } from "@playwright/test";

// 전수 채점 테스트 — 모든 세트를 실제로 "정답만 골라" 끝까지 풀고 채점한다.
//
// 렌더 스윕(react-fullsweep)이 '보이는가'를 본다면 이쪽은 '맞게 계산하는가'를 본다.
// 전 문항 정답이면 결과는 반드시 100%여야 하므로, 한 문항이라도 정답 키가 화면의
// 보기와 어긋나거나(데이터 오타·보기 순서 변경) 배점·합격 판정이 틀어지면 즉시 드러난다.
// 특히 CSTS는 문항 유형별 가중 배점(4지선다·서답형 1.5점, 진위형 1.0점)이라
// 세트마다 만점이 달라, 유형 하나만 잘못 분류돼도 만점이 100이 아니게 된다.

const problems: string[] = [];
const record = (s: string) => { problems.push(s); console.log("  ⚠ " + s); };

interface Q {
  number: number; type?: string; answer: string | string[];
  answerParts?: { label: string; answer: string | string[] }[];
  options?: { key: string }[];
}

// 제품 게이트 → 세트 선택.
// 두 가지를 처리해야 한다:
//  - 이미 채점한 세트/모드로 되돌아오면 '결과 보기 / 새 회차 시작' 모달이 먼저 뜬다.
//    백드롭이 사이드바를 덮으므로 닫기 전에는 모드 버튼도 세트 셀렉트도 누를 수 없다.
//  - 시험 모드가 복원된 채로 새 세트에 들어가면 시작 게이트가 워크스페이스를 가린다.
async function dismissModals(page: Page) {
  for (let i = 0; i < 4; i++) {
    const backdrop = page.locator(".modal-backdrop");
    if (!(await backdrop.count())) return;
    const fresh = page.getByTestId("graded-resume-fresh");
    if (await fresh.count()) await fresh.click();
    else await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }
}

async function openSet(page: Page, product: string, setId: string) {
  await page.goto("/");
  await page.getByRole("button", { name: product }).click();
  await dismissModals(page);
  await expect(page.locator("#examSelect")).toBeVisible({ timeout: 20_000 });
  await page.locator("#examSelect").selectOption(setId);
  await dismissModals(page);
  await expect(page.locator("#questionStem, [data-testid='exam-start-gate']").first())
    .toBeVisible({ timeout: 20_000 });
}

// 데이터의 정답을 그대로 입력한다 — 선택형은 해당 보기를 누르고, 서답형은 첫 정답을 적는다.
async function answerCorrectly(page: Page, q: Q) {
  if (q.type === "short_answer") {
    const inputs = page.locator(".short-answer-input");
    const n = await inputs.count();
    if (q.answerParts?.length) {
      for (let i = 0; i < q.answerParts.length; i++) {
        const a = q.answerParts[i].answer;
        await inputs.nth(i).fill(Array.isArray(a) ? a[0] : String(a));
      }
    } else {
      const a = Array.isArray(q.answer) ? q.answer[0] : String(q.answer);
      if (n) await inputs.first().fill(a);
    }
    return;
  }
  const keys = Array.isArray(q.answer) ? q.answer : [q.answer];
  for (const k of keys) {
    const opt = page.locator(`#options .option`).filter({ has: page.locator(".option-key", { hasText: new RegExp(`^${String(k).trim().toUpperCase()}$`) }) });
    if (await opt.count()) await opt.first().click();
    else record(`보기 키 '${k}'를 화면에서 찾지 못함 (문제 ${q.number})`);
  }
}

test("전수 기능: 12세트를 정답으로 완주하면 전부 100%가 나온다", async ({ page }) => {
  // 예산 5분. 실측 1.2분(단독) — 종전 30분은 25배였다.
  // 예산을 잡 타임아웃(30분)보다 작게 유지하는 이유는 react-fullsweep 주석 참고.
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });

  await page.goto("/");
  const idx = await (await page.request.get("/data/index.json")).json();

  let graded = 0;
  let answered = 0;
  for (const s of idx.sets) {
    const product = s.certification === "ISTQB" ? "ISTQB" : "CSTS";
    const data = await (await page.request.get(`/data/${s.path.replace(/^\.\//, "")}`)).json();
    const qs: Q[] = data.questions;
    if (!qs?.length) { record(`${s.id}: 문항이 0개 — 이 세트는 검사되지 않았다`); continue; }

    await openSet(page, product, s.id);
    await page.locator('.segmented button[data-mode="exam"]').click();
    await dismissModals(page);
    const start = page.getByTestId("exam-start-btn");
    if (await start.count()) await start.click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

    for (let i = 0; i < qs.length; i++) {
      await answerCorrectly(page, qs[i]);
      if (i < qs.length - 1) await page.locator("#nextBtn").first().click();
    }

    // 전 문항 응답 후에는 미응답 확인 모달이 뜨지 않아야 한다(진행률 계산 검증).
    const progress = await page.locator("#progressText").innerText();
    if (!progress.includes(`${qs.length} / ${qs.length}`) && !progress.includes(`${qs.length}/${qs.length}`)) {
      record(`${s.id}: 전 문항 응답했는데 진행률이 "${progress}"`);
    }

    await page.getByTestId("grade-button").click();
    const confirm = page.getByTestId("confirm-grade");
    if (await confirm.count()) {
      record(`${s.id}: 전 문항 응답했는데 미응답 확인 모달이 떴다`);
      await confirm.click();
    }

    const res = page.getByTestId("result-summary");
    await expect(res).toBeVisible({ timeout: 15_000 });
    const score = (await page.getByTestId("result-score").innerText()).replace(/\s+/g, " ");
    const rate = (await page.getByTestId("result-rate").innerText()).replace(/\s+/g, " ");
    const body = (await res.innerText()).replace(/\n/g, " | ");

    // ISTQB는 단순 정답률, CSTS는 가중 점수(4지선다·서답형 1.5 / 진위형 1.0)라 표기가 다르다.
    const pct = Number((rate.match(/(\d+)%/) || [])[1] ?? -1);
    if (pct !== 100) record(`${s.id}: 정답만 골랐는데 ${rate} (점수: ${score})`);
    if (/오답\s*\|?\s*0개/.test(body) === false && /오답/.test(body)) {
      const wrong = (body.match(/오답 \| (\d+)개/) || [])[1];
      if (wrong && wrong !== "0") record(`${s.id}: 정답만 골랐는데 오답 ${wrong}개`);
    }
    if (!/합격/.test(body)) record(`${s.id}: 결과에 합격 판정 문구가 없다`);
    else if (/미달/.test(body)) record(`${s.id}: 100%인데 '합격 기준 미달'로 표시됨`);

    graded += 1;
    answered += qs.length;
    console.log(`· ${s.id} (${qs.length}문항) → ${rate} / ${score}`);
    await res.getByRole("button", { name: "닫기", exact: true }).click();
  }

  console.log(`\n=== 전수 기능: ${graded}세트 / ${answered}문항 · 이상 ${problems.length}건 ===`);
  console.log("=== 콘솔 오류 ===\n" + (errors.length ? [...new Set(errors)].join("\n") : "없음"));
  // 제목이 '12세트'라고 말하는 만큼 실제로 12세트를 채점했는지 먼저 못 박는다.
  // 이 검사가 없으면 매니페스트가 비거나 잘려도 루프가 0회 돌고 problems가 빈 채로
  // 초록이 된다 — 이름은 전수인데 아무것도 안 본 상태다. index.json은 빌드 타임에
  // 생성되는 파생 필드를 싣고 있어(questionCount 등) 잘못 생성될 여지가 실제로 있다.
  expect(graded, `12세트를 채점하지 못했다 — ${graded}세트만 돌았다`).toBe(12);
  expect(problems).toEqual([]);
  expect(errors).toEqual([]);
});
