import { contrastRatio } from "./cssColor";
import { test, expect } from "./fixtures";
import { openProduct, openSet } from "./helpers";

// 접근성(ARIA/키보드/포커스) — 레거시 대비 회귀 방지(#66).
test.describe("접근성", () => {
  test("모드 버튼에 aria-pressed가 반영된다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    const practice = page.locator('.segmented button[data-mode="practice"]');
    await expect(practice).toHaveAttribute("aria-pressed", "true");
    const exam = page.locator('.segmented button[data-mode="exam"]');
    await expect(exam).toHaveAttribute("aria-pressed", "false");
  });

  test("풀이 모드 그룹에 role=group과 라벨이 있다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await expect(page.getByRole("group", { name: "풀이 모드" })).toBeVisible();
  });

  test("현재 문항 팔레트 버튼에 aria-current가 설정된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await expect(page.locator('#questionNav button[aria-current="true"]')).toHaveText("1");
  });

  test("보기 버튼에 aria-pressed가 반영된다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    const opt = page.locator("#options .option").first();
    await expect(opt).toHaveAttribute("aria-pressed", "false");
    await opt.click();
    await expect(opt).toHaveAttribute("aria-pressed", "true");
  });

  test("이전/다음 버튼에 aria-label이 있다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await expect(page.locator("#prevBtn")).toHaveAttribute("aria-label", "이전 문제");
    await expect(page.locator("#nextBtn")).toHaveAttribute("aria-label", "다음 문제");
  });

  test("백업 파일 입력에 aria-label이 있다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    await expect(page.locator('input[type="file"][accept=".json"]')).toHaveAttribute("aria-label", /백업/);
  });

  test("설정 모달은 role=dialog + aria-modal을 갖는다", async ({ page }) => {
    await openProduct(page, "ISTQB");
    await page.getByRole("button", { name: /설정/ }).click();
    const dialog = page.getByRole("dialog", { name: "설정" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  test("키보드(Tab/Enter)만으로 보기를 선택할 수 있다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    const opt = page.locator("#options .option").first();
    await opt.focus();
    await page.keyboard.press("Enter");
    await expect(opt).toHaveClass(/selected/);
  });

  test("진행률에 aria-live가 있고, 타이머는 라이브 영역 밖이다(매초 낭독 방지)", async ({ page }) => {
    await openProduct(page, "ISTQB");
    // 진행률(답한/총) 갱신만 스크린리더가 알린다.
    await expect(page.locator("#progressText")).toHaveAttribute("aria-live", "polite");
    // .stats 섹션 전체를 라이브로 두면 타이머가 매초 낭독되므로, 섹션엔 aria-live가 없어야 한다.
    await expect(page.locator(".stats")).not.toHaveAttribute("aria-live", "polite");
  });

  // 다크 모드의 --success/--danger는 '어두운 배경 위 글자색'으로 고른 밝은 색이라,
  // 그걸 뱃지 배경으로 깔고 흰 글자를 얹으면 대비가 무너진다(정답 1.74:1, 오답 2.77:1).
  // 채점 직후 정·오답을 확인하는 화면이라 여기서 글자가 안 읽히면 기능이 무의미해진다.
  test("다크 모드에서 채점된 보기 뱃지의 글자 대비가 3:1 이상이다", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("istqb-theme", "dark"));
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");

    // 채점 상태의 정답/오답 뱃지를 만든다(연습은 즉시 피드백으로 색이 붙는다).
    await page.locator("#options .option").first().click();
    await expect(page.locator("#options .option.correct, #options .option.wrong")).not.toHaveCount(0);

    const worst = await page.locator("#options .option-key").evaluateAll((els) => {
      const rgb = (c: string) => (c.match(/\d+/g) || []).slice(0, 3).map(Number);
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      let min = Infinity;
      for (const el of els) {
        const s = getComputedStyle(el);
        const a = lum(rgb(s.color)) + 0.05;
        const b = lum(rgb(s.backgroundColor)) + 0.05;
        min = Math.min(min, Math.max(a, b) / Math.min(a, b));
      }
      return min;
    });
    expect(worst).toBeGreaterThanOrEqual(3);
  });

  // 글자색을 한 테마에서만 고르면 다른 테마에서 조용히 무너진다. 토스트(배경 --text에 흰 글자 → 다크에서 1.2:1),
  // 확인 모달의 파괴 버튼(다크의 밝은 빨강 위 흰 글자 2.8:1), 임박 타이머(라이트 전용 고정색 3.1~4.0:1)가 그랬다.
  // 실제 클래스를 단 요소를 만들어 계산된 색의 대비를 잰다 — 값이 아니라 관계(AA 4.5:1)를 못 박는다.
  for (const theme of ["light", "dark"] as const) {
    test(`${theme} 테마에서 토스트·파괴 버튼·임박 타이머의 글자 대비가 AA(4.5:1) 이상이다`, async ({ page }) => {
      await page.goto("/");
      await page.evaluate((t) => localStorage.setItem("istqb-theme", t), theme);
      await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
      if (theme === "dark") await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");

      const probes = await page.evaluate(() => {
        const host = document.createElement("div");
        host.className = "toast-host";
        document.body.appendChild(host);
        const make = (html: string) => {
          const wrap = document.createElement("div");
          wrap.innerHTML = html;
          host.appendChild(wrap);
          return wrap.firstElementChild as HTMLElement;
        };
        const read = (name: string, el: HTMLElement, bgEl: HTMLElement = el) =>
          ({ name, fg: getComputedStyle(el).color, bg: getComputedStyle(bgEl).backgroundColor });
        const out = [
          read("토스트(안내)", make('<div class="toast show">안내</div>')),
          read("토스트(성공)", make('<div class="toast toast-success show">성공</div>')),
          read("토스트(오류)", make('<div class="toast toast-error show">오류</div>')),
          read("파괴 버튼", make('<div class="confirm-actions"><button class="danger">삭제</button></div>').querySelector("button") as HTMLElement),
        ];
        // 타이머 글자는 표면 위에 얹힌다 — 가장 어두운·밝은 표면 토큰 셋 모두에서 잰다.
        for (const surface of ["--surface", "--surface-2", "--surface-3"]) {
          const box = make(`<div style="background: var(${surface})"><span class="timer-warn">4:59</span><span class="timer-danger">0:59</span></div>`);
          const warn = box.querySelector(".timer-warn") as HTMLElement;
          const danger = box.querySelector(".timer-danger") as HTMLElement;
          out.push(read(`임박 타이머(경고) @${surface}`, warn, box), read(`임박 타이머(위험) @${surface}`, danger, box));
        }
        host.remove();
        return out;
      });

      const rows = probes.map((p) => ({ ...p, ratio: contrastRatio(p.fg, p.bg) }));
      const low = rows.filter((r) => r.ratio < 4.5).map((r) => `${r.name} ${r.ratio.toFixed(2)}:1 (${r.fg} on ${r.bg})`);
      expect(low, `${theme} 테마에서 대비가 AA 미달이다`).toEqual([]);
    });
  }

  // react-features에서 옮김
  test("그림 클릭 라이트박스는 닫기 버튼에 포커스가 가고 Tab이 갇힌다", async ({ page }) => {
    await openSet(page, "ISTQB", "ISTQB-FL-V4-A");
    // figure 문항(23번)으로 이동
    const nav = page.locator("#questionNav button");
    const n = await nav.count();
    for (let i = 0; i < n; i++) {
      if (((await nav.nth(i).textContent()) || "").trim() === "23") { await nav.nth(i).click(); break; }
    }
    await page.locator("#questionFigure img, #questionStem img").first().click();
    await expect(page.getByTestId("figure-lightbox")).toBeVisible();
    // 닫기 버튼에 포커스
    await expect(page.locator(".figure-lightbox-close")).toBeFocused();
    // Tab 눌러도 포커스가 모달 밖으로 나가지 않음
    await page.keyboard.press("Tab");
    await expect(page.locator(".figure-lightbox-close")).toBeFocused();
  });
});
