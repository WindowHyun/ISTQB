import { test, expect, Page } from "@playwright/test";

// 전수 렌더 테스트 — 모든 세트의 모든 문항을 실제로 렌더해 보고 검사한다.
//
// scripts/validate-questions.js는 JSON 스키마(필드 존재·정답 키 유효성)를 보고,
// 개별 E2E는 문제가 됐던 특정 문항만 짚는다. 그 사이에 구멍이 있다 — 데이터는
// 멀쩡한데 화면에서만 깨지는 문항(보기 텍스트 누락, 이미지 404, 유형과 입력
// 위젯 불일치, 좁은 화면에서 잘려 도달 불가)은 누가 열어 보기 전까지 모른다.
// 문항이 추가·수정될 때마다 사람이 626개를 다시 볼 수는 없으므로 여기서 훑는다.
//
// 실패시키는 것과 관찰만 남기는 것을 구분한다: 잘려서 볼 수 없으면 결함이지만,
// 스크롤로 도달 가능하면 정상이다(안내 문구는 별도 스펙에서 검증).

interface SetInfo { id: string; certification: string; title: string; path: string }

const problems: string[] = [];
// 결함은 아니지만 사람이 판단해야 하는 관찰 — 실패시키지 않고 목록으로 남긴다.
const notices: string[] = [];
const record = (s: string) => { problems.push(s); console.log("  ⚠ " + s); };

async function loadIndex(page: Page): Promise<SetInfo[]> {
  const idx = await (await page.request.get("/data/index.json")).json();
  return idx.sets;
}

// 한 문항 화면을 훑어 이상 징후를 모은다(브라우저 컨텍스트에서 한 번에).
async function inspect(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const stem = document.querySelector("#questionStem");
    const stemText = (stem?.textContent || "").trim();
    if (!stemText) out.push("지문 비어 있음");

    const opts = Array.from(document.querySelectorAll("#options .option"));
    const shortInputs = document.querySelectorAll(".short-answer-input");
    if (opts.length === 0 && shortInputs.length === 0) out.push("보기·입력칸 모두 없음");
    if (opts.length === 1) out.push("보기가 1개뿐");
    opts.forEach((o, i) => {
      const t = (o.querySelector(".option-text")?.textContent || "").trim();
      if (!t) out.push(`보기 ${i + 1} 텍스트 비어 있음`);
    });

    // 깨진 이미지(로드 실패) — 문제 그림이 안 보이면 풀 수 없다.
    for (const img of Array.from(document.querySelectorAll("#questionStem img, .question-card img"))) {
      const el = img as HTMLImageElement;
      if (el.complete && el.naturalWidth === 0) out.push(`이미지 로드 실패: ${el.getAttribute("src")}`);
    }

    // 가로 넘침 — 모바일에서 글자가 화면 밖으로 나간다.
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth + 1) out.push(`가로 넘침 ${de.scrollWidth}>${de.clientWidth}`);

    // 뷰포트 밖으로 삐져나온 요소 — 스크롤 가능한 컨테이너 안이면 정상이고,
    // 잘려서 도달할 수 없을 때만 결함이다(표는 .data-table-wrap이 가로 스크롤을 준다).
    const vw = de.clientWidth;
    const reachable = (el: Element) => {
      let n: HTMLElement | null = el.parentElement;
      while (n && n !== document.body) {
        const s = getComputedStyle(n);
        if (/auto|scroll/.test(s.overflowX) && n.scrollWidth > n.clientWidth) return true;
        if (/hidden|clip/.test(s.overflowX)) return false;
        n = n.parentElement;
      }
      return false;
    };
    for (const el of Array.from(document.querySelectorAll("#questionStem *, #options *"))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1 && !reachable(el)) {
        out.push(`잘려서 볼 수 없는 요소: ${el.className || el.tagName} right=${Math.round(r.right)} > ${vw}`);
        break;
      }
    }

    // 가로로 넘치는 표 — 스크롤로 도달은 되지만 '더 있다'는 안내가 켜졌는지 확인한다.
    // 안내가 없으면 사용자는 보이는 데까지가 전부인 줄 알고 부분 정보로 답을 고른다.
    const hidden: string[] = [];
    for (const w of Array.from(document.querySelectorAll(".data-table-wrap")) as HTMLElement[]) {
      if (w.scrollWidth > w.clientWidth + 1) {
        const scroller = w.parentElement;
        const hinted = scroller?.classList.contains("has-overflow")
          && getComputedStyle(scroller.querySelector(".data-table-hint")!).display !== "none";
        hidden.push(`가로 스크롤 표(+${w.scrollWidth - w.clientWidth}px, 안내 ${hinted ? "표시됨" : "없음"})`);
      }
    }

    // 지문 이미지가 너무 작게 렌더돼 글자를 읽을 수 없는 경우(원본 대비 축소율).
    const tiny: string[] = [];
    for (const img of Array.from(document.querySelectorAll("#questionStem img, #options img")) as HTMLImageElement[]) {
      if (!img.naturalWidth) continue;
      const shown = img.getBoundingClientRect().width;
      if (shown > 0 && shown / img.naturalWidth < 0.5) {
        tiny.push(`이미지 축소 ${Math.round((shown / img.naturalWidth) * 100)}% (${Math.round(shown)}px / 원본 ${img.naturalWidth}px)`);
      }
    }
    return { problems: out, scrollTables: hidden, tinyImages: tiny, stem: stemText.slice(0, 30), optCount: opts.length, shortCount: shortInputs.length };
  });
}

/**
 * 비교용 정규화 — 공백을 접고, 원본에만 있는 밑줄 태그를 벗긴다.
 * parser.tsx가 해석하는 태그는 <u> 하나뿐이고 렌더 결과에는 태그가 남지 않으므로,
 * 데이터 쪽에서 같은 방식으로 벗겨야 화면 텍스트와 맞는다.
 */
const norm = (t: string) => t.replace(/<\/?u\s*>/gi, "").replace(/\s+/g, " ").trim();

/**
 * 문항 하나에서 화면에 반드시 뜰 만한 텍스트 조각을 뽑는다(세트 전환 대기용).
 * 지문이 ContentBlock[]일 수도 문자열일 수도 있어 재귀로 훑고, 너무 짧으면
 * 보기 텍스트로 넘어간다 — 짧은 조각은 다른 세트와도 우연히 일치할 수 있다.
 */
function expectedText(q: { stem?: unknown; options?: { text?: string }[] }): string | null {
  const parts: string[] = [];
  // 객체의 모든 문자열을 담으면 안 된다 — 블록의 type 값('paragraph','code')까지 섞여
  // 화면에 없는 문자열로 기다리게 된다. 내용을 담는 키만 골라 훑는다.
  const CONTENT_KEYS = new Set(["text", "lines", "items", "blocks", "content", "caption"]);
  const walk = (v: unknown) => {
    if (typeof v === "string") { parts.push(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (CONTENT_KEYS.has(k)) walk(val);
      }
    }
  };
  walk(typeof q.stem === "string" ? q.stem : { blocks: q.stem });
  for (const c of [norm(parts.join(" ")), norm(q.options?.[0]?.text ?? "")]) {
    if (c.length >= 12) return c.slice(0, 24);
  }
  return null;
}

for (const width of [1280, 390]) {
  test(`전수: 12세트 626문항 렌더 검사 (${width}px)`, async ({ page }) => {
    // 예산 5분. 실측은 폭당 43초(단독)이고 전체 스위트와 워커를 나눠 써도 그 언저리다.
    // 종전 30분은 실측의 42배였는데, 그 크기가 곧 결함이었다 — 이 검사가 멈추면 30분을
    // 조용히 태우고, e2e 잡의 벽시계(30분)가 먼저 끝나 **리포트가 한 줄도 안 남는다**.
    // 실제로 #256·#257·#266이 그렇게 잘렸고 원인을 못 봤다. 예산이 잡보다 작아야
    // 테스트가 자기 예산에서 죽으면서 trace와 error-context를 남긴다.
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });

    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto("/");
    const sets = await loadIndex(page);

    let checked = 0;
    for (const s of sets) {
      const product = s.certification === "ISTQB" ? "ISTQB" : "CSTS";
      await page.goto("/");
      await page.getByRole("button", { name: product }).click();
      await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

      const select = page.locator("#examSelect");
      if (!(await select.isVisible())) {
        await page.getByTestId("drawer-open").click();
        await expect(select).toBeVisible();
      }
      await select.selectOption(s.id);
      await page.keyboard.press("Escape");

      const data = await (await page.request.get(`/data/${s.path.replace(/^\.\//, "")}`)).json();
      const total: number = data.questions.length;

      // 세트를 바꾼 직후 곧바로 읽으면 지문·보기가 비어 보인다(전체 스위트 부하에서 실제로
      // 잡혔다). #questionStem은 이전 세트의 지문이라 toBeVisible이 즉시 통과하고, 세트 제목과
      // 진행률은 문항 JSON이 오기 전에 먼저 바뀐다 — 둘 다 "교체가 끝났다"는 신호가 못 된다.
      // 새 세트 1번 문항의 실제 텍스트가 화면에 뜰 때까지 기다린다.
      const want = expectedText(data.questions[0]);
      if (want) {
        await expect
          .poll(async () => norm(await page.locator("#questionStem, #options").allInnerTexts().then((t) => t.join(" "))),
                { timeout: 20_000 })
          .toContain(want);
      } else {
        // 지문이 이미지·표뿐이라 대조할 텍스트가 없는 드문 경우 — 보기 수로 갈음한다.
        await expect
          .poll(async () => page.locator("#options .option").count(), { timeout: 20_000 })
          .toBeGreaterThan(0);
      }

      for (let i = 0; i < total; i++) {
        const q = data.questions[i];
        const r = await inspect(page);
        for (const p of r.problems) record(`${s.id} #${q.number}: ${p}`);
        for (const p of r.scrollTables) notices.push(`${s.id} #${q.number}: ${p}`);
        for (const p of r.tinyImages) notices.push(`${s.id} #${q.number}: ${p}`);

        // 유형별 기대치 대조 — 데이터의 type과 실제 렌더가 어긋나면 답을 넣을 수 없다.
        if (q.type === "short_answer" && r.shortCount === 0) record(`${s.id} #${q.number}: 서답형인데 입력칸 없음`);
        if (q.type !== "short_answer" && r.optCount === 0) record(`${s.id} #${q.number}: 선택형인데 보기 없음`);
        if (q.type === "true_false" && r.optCount !== 2) record(`${s.id} #${q.number}: 진위형 보기 ${r.optCount}개`);

        checked++;
        if (i < total - 1) {
          const next = page.locator("#nextBtn").first();
          if (await next.isVisible()) await next.click();
          else await page.locator(".mobile-actionbar .ab-nav").last().click();
        }
      }
      console.log(`· ${s.id} (${total}문항) 완료`);
    }

    console.log(`\n=== ${width}px: ${checked}문항 검사 · 결함 ${problems.length}건 · 관찰 ${notices.length}건 ===`);
    for (const n of [...new Set(notices)]) console.log("  ℹ " + n);
    console.log("=== 콘솔 오류 ===\n" + (errors.length ? [...new Set(errors)].join("\n") : "없음"));
    expect(checked).toBe(626);
    expect(errors).toEqual([]);
    expect(problems).toEqual([]);
  });
}
