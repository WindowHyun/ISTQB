import { test, expect, Page } from "@playwright/test";
import { openProduct } from "./helpers";

// 퀵 랜덤 — 제품의 전 세트에서 10~20문항을 짧게 푸는 모드.
// 세트 하나에 매이지 않아 setId가 센티넬(QUICK)이라, 세트를 전제하는 기존 경로들이
// 조용히 어긋날 수 있다. 그 지점들을 여기서 고정한다.

async function startQuick(page: Page, product: "ISTQB" | "CSTS", size: string) {
  await openProduct(page, product);
  const select = page.locator("#quickSize");
  // 모바일에서는 사이드바가 드로어라 숨어 있다 — 실사용자와 동일하게 연다.
  if (!(await select.isVisible())) await page.getByTestId("drawer-toggle").click();
  await select.selectOption(size);
  await page.getByTestId("quick-start-btn").click();
  await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
}

function readUi(page: Page, product: "istqb" | "csts") {
  const key = product === "csts" ? "csts-fl-v1-sample-ui-state" : "istqb-fl-v4-sample-ui-state";
  return page.evaluate((k: string) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, key);
}

test.describe("퀵 랜덤", () => {
  test("고른 문항 수만큼, 제품의 여러 세트에서 뽑는다", async ({ page }) => {
    await startQuick(page, "CSTS", "10");
    await expect(page.locator("#progressText")).toContainText("/ 10");

    const ui = await readUi(page, "csts");
    expect(ui.mode).toBe("quick");
    const items: { id: string; setId: string }[] = ui.quickDraw.items;
    expect(items).toHaveLength(10);
    // 한 세트에서만 뽑혔다면 '전 세트 출제'가 성립하지 않는다(CSTS는 7세트 440문항이라
    // 10문항이 우연히 한 세트에 몰릴 확률은 무시할 수 있다).
    expect(new Set(items.map((i) => i.setId)).size).toBeGreaterThan(1);
    // 출처 세트가 비면 오답 귀속과 복원이 성립하지 않는다.
    expect(items.every((i) => !!i.setId)).toBe(true);
  });

  // QuestionCard가 답안 키를 독립 조립하던 시절이라면 여기서 진행률이 오르지 않는다.
  test("답을 고르면 진행률이 오른다", async ({ page }) => {
    await startQuick(page, "ISTQB", "10");
    await expect(page.locator("#progressText")).toContainText("0 / 10");
    await page.locator("#options .option").first().click();
    await expect(page.locator("#progressText")).toContainText("1 / 10");
  });

  test("새로고침해도 같은 문항으로 이어 푼다", async ({ page }) => {
    await startQuick(page, "CSTS", "10");
    const before = (await readUi(page, "csts")).quickDraw.items.map((i: { id: string }) => i.id);
    await page.locator("#options .option").first().click();
    await expect(page.locator("#progressText")).toContainText("1 / 10");

    await page.reload();
    // 진입 시 항상 제품 게이트를 먼저 보여주는 것이 이 앱의 사양(#5)이라 다시 고른다 —
    // 제품을 고르는 순간 저장된 진행이 복원된다.
    await openProduct(page, "CSTS");
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    // 답안이 유지된다 = 같은 문항을 같은 키로 보고 있다.
    await expect(page.locator("#progressText")).toContainText("1 / 10");
    const after = (await readUi(page, "csts")).quickDraw.items.map((i: { id: string }) => i.id);
    expect(after).toEqual(before);
  });

  test("서답형은 나오지 않는다 — 입력이 오래 걸려 '퀵'이 성립하지 않는다", async ({ page }) => {
    await startQuick(page, "CSTS", "20");
    // 서답형이 섞였다면 보기 없는 텍스트 입력이 렌더된다.
    for (let i = 0; i < 20; i += 1) {
      await expect(page.locator("#options .option").first()).toBeVisible();
      const next = page.locator('[data-testid="next-btn"]');
      if (!(await next.count()) || (await next.isDisabled())) break;
      await next.click();
    }
    expect(await page.locator("#options input[type=text]").count()).toBe(0);
  });

  test("채점 결과에 합격 판정이 없다 — 10문항에 '기준 미달'은 오해를 만든다", async ({ page }) => {
    await startQuick(page, "ISTQB", "10");
    await page.locator("#options .option").first().click();
    await page.getByTestId("grade-button").click();
    const confirm = page.getByTestId("confirm-grade");
    if (await confirm.count()) await confirm.click();

    const result = page.getByTestId("result-summary");
    await expect(result).toBeVisible({ timeout: 15_000 });
    await expect(result).toContainText("퀵 랜덤");
    await expect(result).not.toContainText("합격 기준 미달");
    await expect(result).not.toContainText("합격 기준 충족");
    // %가 아니라 맞힌 개수로 보여준다.
    await expect(page.getByTestId("result-rate")).toContainText("/ 10문항");
  });

  test("퀵 회차는 요약(응시 횟수·최고 정답률)을 부풀리지 않는다", async ({ page }) => {
    await startQuick(page, "ISTQB", "10");
    // 전 문항 정답을 고를 수 없으므로 첫 보기만 찍고 채점한다 — 요약에 섞이는지만 본다.
    await page.locator("#options .option").first().click();
    await page.getByTestId("grade-button").click();
    const confirm = page.getByTestId("confirm-grade");
    if (await confirm.count()) await confirm.click();
    await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("result-summary").getByRole("button", { name: "닫기", exact: true }).click();

    await page.getByTestId("stats-open").click();
    await expect(page.getByTestId("stats-dashboard")).toBeVisible();
    // 실전 회차가 하나도 없으므로 요약 블록 자체가 뜨지 않아야 한다.
    expect(await page.locator(".stats-summary").count()).toBe(0);
    // 대신 짧은 세션 목록에는 남아 개별 삭제가 가능하다.
    await expect(page.getByTestId("stats-mini-rounds")).toContainText("퀵 랜덤");
  });

    // 영속 계약 — 퀵 회차가 IndexedDB에 어떤 모양으로 남는지. 여기서 하나라도 빠지면
    // 새로고침·백업 복원 뒤에 조용히 망가진다: mode가 exam으로 보정되면 요약을 부풀리고,
    // chapterQuestions가 없으면 챕터 통계에서 빠지고, wrongItems[].setId가 없으면
    // 오답노트가 다시 출처를 잃는다.
  test("퀵 회차가 저장소에 온전히 기록된다(모드·챕터·오답 출처)", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.locator("#quickSize").selectOption("10");
    await page.getByTestId("quick-start-btn").click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });
    for (let i = 0; i < 10; i++) {
      const o = page.locator("#options .option").first();
      if (await o.count()) await o.click();
      const n = page.locator("#nextBtn");
      if (!(await n.count()) || (await n.isDisabled())) break;
      await n.click();
    }
    await page.getByTestId("grade-button").click();
    const c = page.getByTestId("confirm-grade");
    if (await c.count()) await c.click();
    await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 20_000 });

    // IndexedDB에 저장된 퀵 회차를 직접 읽어 백업 왕복 계약을 검사한다.
    const info = await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const r = indexedDB.open("istqb-db", 1);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const all: Record<string, unknown>[] = await new Promise((res) => {
        const tx = db.transaction("history", "readonly");
        const q = tx.objectStore("history").getAll();
        q.onsuccess = () => res(q.result);
      });
      const quick = all.find((h) => (h as { mode?: string }).mode === "quick") as {
        mode: string; setId: string;
        chapterQuestions?: Record<string, { ok: string[]; no: string[] }>;
        wrongItems?: { number: number; setId?: string }[];
      } | undefined;
      return {
        found: !!quick,
        mode: quick?.mode,
        setId: quick?.setId,
        chapters: Object.keys(quick?.chapterQuestions ?? {}).length,
        wrongWithSource: (quick?.wrongItems ?? []).filter((w) => !!w.setId).length,
        wrongTotal: (quick?.wrongItems ?? []).length,
        sources: [...new Set((quick?.wrongItems ?? []).map((w) => w.setId))].length,
      };
    });
    console.log("[백업] 퀵 회차:", JSON.stringify(info));
    expect(info.found).toBe(true);
    expect(info.mode).toBe("quick");          // exam으로 보정되면 요약을 부풀린다
    expect(info.chapters).toBeGreaterThan(0); // 없으면 챕터 통계에서 빠진다
    expect(info.wrongWithSource).toBe(info.wrongTotal); // 출처 없으면 오답노트가 뭉친다
    expect(info.sources).toBeGreaterThan(1);  // 전 세트 출제의 흔적
  });
  // 오답노트는 회차가 아니라 문항의 출처 세트로 묶여야 한다. 회차 단위로 묶으면 퀵의
  // setId가 센티넬이라 서로 다른 세트의 오답이 '퀵 랜덤' 한 덩어리가 되고, 지문을 불러올
  // 경로가 없어 번호만 뜬다(번호가 겹치면 조용히 유실되기도 한다).
  test("오답노트가 퀵 오답을 출처 세트별로 갈라 보여준다", async ({ page }) => {
    await startQuick(page, "ISTQB", "10");
    for (let i = 0; i < 10; i += 1) {
      const o = page.locator("#options .option").first();
      if (await o.count()) await o.click();
      const n = page.locator("#nextBtn");
      if (!(await n.count()) || (await n.isDisabled())) break;
      await n.click();
    }
    await page.getByTestId("grade-button").click();
    const confirm = page.getByTestId("confirm-grade");
    if (await confirm.count()) await confirm.click();
    await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "오답 노트 보기" }).click();
    await expect(page.getByTestId("wrong-note")).toBeVisible();

    const groups = page.getByTestId("wrong-note-set-btn");
    // 10문항이 여러 세트에서 왔으므로 그룹도 여럿이어야 한다(1이면 한 덩어리로 뭉친 것).
    expect(await groups.count()).toBeGreaterThan(1);
    const note = page.getByTestId("wrong-note");
    // 그룹 이름은 실제 세트 제목이어야 한다 — '퀵 랜덤'이 보이면 출처를 잃은 것이다.
    await expect(note).not.toContainText("퀵 랜덤");
    await expect(note).toContainText("ISTQB FL v4.0 샘플문제");
  });

  test("퀵에서 틀린 문항이 출처 세트의 오답노트로 간다", async ({ page }) => {
    await startQuick(page, "ISTQB", "10");
    // 모든 문항에 답해 확실히 오답을 만든다(첫 보기 일괄 선택).
    for (let i = 0; i < 10; i += 1) {
      await page.locator("#options .option").first().click();
      const next = page.locator('[data-testid="next-btn"]');
      if (!(await next.count()) || (await next.isDisabled())) break;
      await next.click();
    }
    await page.getByTestId("grade-button").click();
    const confirm = page.getByTestId("confirm-grade");
    if (await confirm.count()) await confirm.click();
    await expect(page.getByTestId("result-summary")).toBeVisible({ timeout: 15_000 });

    // 오답은 QUICK 버킷이 아니라 각 출처 세트의 -quick 버킷에 담겨야 한다.
    const buckets = await page.evaluate(() => {
      const raw = localStorage.getItem("istqb-fl-v4-sample-ui-state");
      const ui = raw ? JSON.parse(raw) : {};
      return Object.keys(ui.reviewIds ?? {});
    });
    expect(buckets.some((k) => k.startsWith("QUICK"))).toBe(false);
    expect(buckets.some((k) => k.endsWith("-quick"))).toBe(true);
  });
});
