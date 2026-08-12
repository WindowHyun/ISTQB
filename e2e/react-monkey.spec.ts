import { test, expect, Page } from "@playwright/test";

const note = (s: string) => console.log("· " + s);

// 몽키 퍼즈 — 대본 없이 무작위로 누른다.
//
// 지금까지의 테스트는 전부 "사람이 생각한 순서"였다. 결함은 대개 아무도 밟지 않은
// 순서에서 나온다(모달을 연 채 모드를 바꾸고 그 위에서 채점, 같은 것). 시드를
// 고정해 실패를 재현할 수 있게 하고, 매 조작 뒤 불변식을 확인한다.
//
// 불변식은 "무슨 짓을 해도 참이어야 하는 것"만 넣는다 — 특정 화면의 기대값을 넣으면
// 무작위 조작에서 거짓 실패가 난다.
//
// 시드 배열(아래 `[42, 1337, 20260730]`)은 **CI에서도 전부 돈다** — 환경 분기가 없다.
// 종전 주석은 "CI에서는 시드 하나만"이라고 적어 두었는데 코드에 그런 분기가 없었고,
// 시드를 늘릴 때 러너 예산을 잘못 가늠하게 만들었다. 하나만 돌리고 싶으면 분기를
// 실제로 넣어야 한다. 탐색할 때는 배열을 늘려 로컬에서 돌린다 —
// 시드 1·7·42 × 200스텝(683회 조작)에서 위반 0건을 확인했다.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Violation { step: number; action: string; msg: string }

// page.evaluate는 timeout 옵션이 없다 — 메인 스레드가 막히면 무기한 기다린다.
// 몽키에게 이것은 치명적이다: 앱이 멈추는 것 자체가 잡아야 할 결함인데, 그 순간
// 검사도 함께 멈춰 예산을 다 태우고 아무 기록 없이 죽는다(CI #272가 그랬다).
// 응답이 없으면 기다리지 말고 **위반으로 보고한다.**
async function raceDeadline<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  let timer: NodeJS.Timeout;
  const bell = new Promise<T>((res) => { timer = setTimeout(() => res(onTimeout), ms); });
  return Promise.race([p, bell]).finally(() => clearTimeout(timer));
}

// 매 조작 뒤 브라우저에서 한 번에 검사한다(왕복 비용 절감).
async function checkInvariants(page: Page) {
  return raceDeadline(rawInvariants(page), 15_000, ["앱이 15초간 응답하지 않음(메인 스레드 블록 의심)"]);
}

async function rawInvariants(page: Page) {
  return page.evaluate(() => {
    const bad: string[] = [];
    const de = document.documentElement;

    // 1) 가로 스크롤 — 모바일에서 콘텐츠가 화면 밖으로 나가면 조작이 불가능해진다.
    if (de.scrollWidth > de.clientWidth + 1) bad.push(`가로 넘침 ${de.scrollWidth}>${de.clientWidth}`);

    // 2) 진행률 표기의 내적 일관성: 답함 ≤ 총계, 퍼센트 0~100.
    const prog = document.querySelector("#progressText")?.textContent || "";
    const m = prog.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) {
      const [a, t] = [Number(m[1]), Number(m[2])];
      if (a > t) bad.push(`답함(${a})이 총계(${t})보다 큼`);
    }
    const pct = prog.match(/(\d+)%/);
    if (pct && (Number(pct[1]) < 0 || Number(pct[1]) > 100)) bad.push(`진행률 ${pct[1]}%`);

    // 3) 팔레트: 현재 문항 표시는 정확히 하나여야 한다.
    const cur = document.querySelectorAll('#questionNav button[aria-current="true"]');
    const navCount = document.querySelectorAll("#questionNav button").length;
    if (navCount > 0 && cur.length !== 1) bad.push(`현재 문항 표시가 ${cur.length}개`);

    // 4) 타이머: 음수나 NaN이 표시되면 안 된다.
    const t = document.querySelector("#timerText")?.textContent || "";
    if (t && (t.includes("-") || t.includes("NaN"))) bad.push(`타이머 표시 "${t}"`);

    // 5) 저장소가 항상 파싱 가능해야 한다 — 깨지면 다음 실행에서 앱이 못 뜬다.
    for (const k of Object.keys(localStorage)) {
      const v = localStorage.getItem(k) || "";
      if (v.startsWith("{") || v.startsWith("[")) {
        try { JSON.parse(v); } catch { bad.push(`localStorage['${k}'] 파싱 불가`); }
      }
    }

    // 6) 모달이 열려 있으면 정확히 하나가 최상위여야 한다(두 개가 동시에 조작 가능하면
    //    아래 모달의 버튼이 위 모달에 가려 눌리지 않는 상태가 된다).
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'))
      .filter((d) => (d as HTMLElement).offsetParent !== null);
    if (dialogs.length > 2) bad.push(`동시에 보이는 dialog ${dialogs.length}개`);

    // 7) 결과 모달이 떠 있다면 점수 표기가 내적으로 모순되지 않아야 한다.
    const score = document.querySelector('[data-testid="result-score"]')?.textContent || "";
    const sm = score.match(/([\d.]+)\s*\/\s*([\d.]+)/);
    if (sm && Number(sm[1]) > Number(sm[2])) bad.push(`점수 ${score}`);

    return bad;
  });
}

// 누를 수 있는 것들 중 안전하지 않은 것만 제외한다(새 탭·파일 선택).
const CLICKABLE = [
  "#options .option",
  ".segmented button",
  "#questionNav button",
  "#prevBtn", "#nextBtn",
  "[data-testid='palette-toggle']",
  "[data-testid='grade-button']",
  "[data-testid='exam-start-btn']",
  "[data-testid='stats-open']",
  "[data-testid='result-open']",
  ".modal-header button",
  ".confirm-actions button",
  "[data-testid='wrong-note-set-btn']",
  "[data-testid='wrong-note-item-btn']",
  "[data-testid='wrong-note-back']",
  "[data-testid='chapter-practice-btn']",
  "[data-testid='chapter-minitest-btn']",
  "[data-testid='chapter-filter-clear']",
  "[data-testid='round-delete-btn']",
  ".settings-open-btn:not(.feedback-link)",
  ".sidebar button:not(.feedback-link)",
].join(", ");

// 시드가 하나면 몽키는 매번 똑같은 150수를 둔다 — 무작위 탐색이라기보다 고정 시나리오다.
// 시드를 늘리면 서로 다른 경로를 밟으면서도 각 실행은 재현 가능한 상태로 남는다.
// (테스트는 병렬로 도는 별개 케이스라 벽시계 시간은 거의 늘지 않는다.)
for (const seed of [42, 1337, 20260730]) {
  test(`몽키: 무작위 120회 조작 후에도 불변식이 유지된다 (시드 ${seed})`, async ({ page }) => {
    // 예산 7분. 실측은 회차당 1.7~2.2분(단독)이고, 403개 스위트 안에서 워커를 나눠 써도
    // 비슷하다(CI #272에서 시드 1337이 약 107초).
    //
    // 종전 15분은 "부하가 걸리면 10분을 넘긴 적이 있다"는 관찰에서 나왔는데, 그 관찰은
    // 시드를 쪼개기 전(150조작×1회) 이야기라 지금 구성에는 맞지 않는다. 더 중요한 것은
    // 큰 예산이 문제를 감춘다는 점이다 — CI #272에서 시드 20260730이 900초를 꽉 채우고
    // "Target page… has been closed"로 죽었다. 같은 회차가 단독으로는 1.8분에 끝나므로
    // 느린 것이 아니라 **멈춘 것**이고, 15분 예산은 그 멈춤을 15분간 조용히 태웠다.
    // 예산을 줄이면 같은 멈춤이 7분에 trace와 함께 드러난다.
    test.setTimeout(420_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });

    // 조작마다 상한을 둔다. Playwright의 actionTimeout 기본값은 0(무제한)이라, 아래
    // fill·selectOption·innerText·count는 요소가 계속 조작 불가 상태면 **영원히 기다린다.**
    // `.catch(() => {})`는 거절을 삼킬 뿐 대기를 끊지 못한다 — 종전에는 click에만
    // { timeout: 1500 }이 있었고 나머지는 전부 무제한이었다.
    page.setDefaultTimeout(10_000);

    const rand = rng(seed);
    const violations: Violation[] = [];
    const trail: string[] = [];

    await page.goto("/");
    await page.getByRole("button", { name: rand() < 0.5 ? "ISTQB" : "CSTS" }).click();
    await expect(page.locator("#questionStem")).toBeVisible({ timeout: 20_000 });

    for (let step = 1; step <= 120; step++) {
      // 진행 흔적을 주기적으로 흘린다. 종전에는 조작 이력을 루프가 **끝난 뒤에만** 찍어서,
      // 예산을 태우고 죽으면 무엇을 눌러 그렇게 됐는지 기록이 하나도 안 남았다
      // (CI #272에서 이 시드가 900초를 태웠는데 로그로는 원인 추적이 불가능했다).
      // 루프 첫머리에 두는 이유: 아래에는 continue로 빠지는 경로(skip·no-target)가 있어,
      // 뒤쪽에 두면 하필 그 경로에서 멈췄을 때 또 기록이 남지 않는다.
      if (step % 20 === 1 && step > 1) note(`  시드 ${seed} step ${step}: …${trail.slice(-6).join(" → ")}`);

      // 가끔 화면 폭을 바꾼다 — 반응형 전환 도중의 상태 오염을 노린다.
      if (rand() < 0.04) {
        const w = [390, 768, 1280][Math.floor(rand() * 3)];
        await page.setViewportSize({ width: w, height: 844 });
        trail.push(`resize:${w}`);
      }
      // 가끔 텍스트를 친다(서답형 칸이 있으면).
      if (rand() < 0.06) {
        const input = page.locator(".short-answer-input").first();
        if (await input.count() && await input.isVisible().catch(() => false)) {
          const junk = ["", " ", "가나다", "'\"<>&", "A".repeat(300)][Math.floor(rand() * 5)];
          await input.fill(junk).catch(() => {});
          trail.push(`type:${junk.slice(0, 8)}`);
        }
      }
      // 가끔 세트를 바꾼다 — CLICKABLE은 button만 훑어서 select가 통째로 빠져 있었다.
      // (종전에는 퀵 문항 수 셀렉트를 흔들었는데 그 컨트롤은 없어졌다. 남은 select는
      //  세트 셀렉트뿐이고, 세트 전환은 확인 모달·답안 이관이 얽혀 훨씬 값진 흔들기다.)
      if (rand() < 0.05) {
        const sel = page.locator("#examSelect");
        if (await sel.count() && await sel.isVisible().catch(() => false)) {
          const opts = await sel.locator("option").evaluateAll(
            (os) => os.map((o) => (o as HTMLOptionElement).value));
          if (opts.length) {
            const pick = opts[Math.floor(rand() * opts.length)];
            await sel.selectOption(pick).catch(() => {});
            trail.push(`setId:${pick}`);
          }
        }
      }
      // 가끔 Esc를 누른다.
      if (rand() < 0.08) {
        await page.keyboard.press("Escape");
        trail.push("esc");
      }

      const targets = page.locator(CLICKABLE);
      const n = await targets.count();
      if (n === 0) { trail.push("no-target"); await page.keyboard.press("Escape"); continue; }
      const idx = Math.floor(rand() * n);
      const el = targets.nth(idx);
      let label = "?";
      try {
        label = ((await el.getAttribute("data-testid")) || (await el.innerText()) || "?").slice(0, 16).replace(/\n/g, " ");
        await el.click({ timeout: 1500 });
      } catch {
        trail.push(`skip:${label}`);
        continue;
      }
      trail.push(label);

      const bad = await checkInvariants(page);
      for (const b of bad) violations.push({ step, action: label, msg: b });
      if (violations.length > 8) break; // 같은 결함이 계속 재발하면 조기 종료
    }

    note(`시드 ${seed}: 조작 ${trail.length}회 · 불변식 위반 ${violations.length}건 · JS오류 ${errors.length}건`);
    if (violations.length) {
      for (const v of violations.slice(0, 8)) note(`  ✗ step ${v.step} [${v.action}] ${v.msg}`);
      note(`  최근 조작: ${trail.slice(-15).join(" → ")}`);
    }
    if (errors.length) for (const e of [...new Set(errors)].slice(0, 5)) note(`  ✗ ${e}`);

    expect(violations).toEqual([]);
    expect([...new Set(errors)]).toEqual([]);
  });
}
