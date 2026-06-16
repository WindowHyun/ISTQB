const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "tmp", "visual-audit");
const BASE_URL = "http://127.0.0.1:8080/";
const VIEWPORT = { width: 430, height: 760 };

const SETS = [
  "ISTQB-FL-A",
  "ISTQB-FL-B",
  "ISTQB-FL-C",
  "ISTQB-FL-D",
  "CSTS-FL-2402",
  "CSTS-FL-2403",
  "CSTS-FL-2404",
  "CSTS-FL-2405",
  "CSTS-EL-2018",
  "CSTS-EL-2019",
  "CSTS-EL-SW-EXAMPLE",
];

function safeName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
}

async function waitForImages(page) {
  await page
    .waitForFunction(
      () =>
        Array.from(
          document.querySelectorAll(
            "#questionStem img, #questionFigure img, #options img, .figure-card img, .question-figure img, .option img",
          ),
        ).every((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
      null,
      { timeout: 10000 },
    )
    .catch(() => {});
}

async function waitForStableQuestion(page) {
  await page.waitForFunction(
    () => {
      const title = document.querySelector("#questionTitle")?.textContent || "";
      const stem = document.querySelector("#questionStem")?.textContent || "";
      const answer = document.querySelector("#cstsAnswer") || document.querySelector("#answerInput");
      const options = document.querySelectorAll("#options .option").length;
      return /\d+\s*\/\s*\d+/.test(title) && stem.trim().length > 0 && (options > 0 || answer);
    },
    null,
    { timeout: 10000 },
  );
  await waitForImages(page);
  await page.waitForTimeout(100);
}

async function selectSet(page, setId) {
  const isCsts = setId.startsWith("CSTS-");
  await page.evaluate((product) => {
    const button = document.getElementById(product === "csts" ? "openCstsBtn" : "openIstqbBtn");
    button?.click();
  }, isCsts ? "csts" : "istqb");
  await page.waitForTimeout(250);
  await page.evaluate((nextSetId) => {
    const select = document.getElementById("examSelect");
    if (!select) throw new Error("Missing #examSelect");
    select.value = nextSetId;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, setId);
  await waitForStableQuestion(page);
}

async function currentNumber(page) {
  const title = await page.locator("#questionTitle").innerText();
  const match = title.match(/(\d+)\s*\/\s*(\d+)/);
  return match ? { current: Number(match[1]), total: Number(match[2]) } : { current: 1, total: 1 };
}

async function goQuestion(page, targetNumber) {
  for (let guard = 0; guard < 120; guard += 1) {
    const { current } = await currentNumber(page);
    if (current === targetNumber) return;
    await page.evaluate((direction) => {
      const button = document.getElementById(direction === "next" ? "nextBtn" : "prevBtn");
      if (!button) throw new Error(`Missing ${direction} button`);
      button.click();
    }, current < targetNumber ? "next" : "prev");
    await waitForStableQuestion(page);
  }
  throw new Error(`Failed to move to question ${targetNumber}`);
}

async function measure(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x * 10) / 10,
        y: Math.round(r.y * 10) / 10,
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
        top: Math.round(r.top * 10) / 10,
        bottom: Math.round(r.bottom * 10) / 10,
      };
    };
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const title = document.querySelector("#questionTitle")?.textContent.trim() || "";
    const setMeta = document.querySelector("#setMeta")?.textContent.trim() || "";
    const stem = document.querySelector("#questionStem");
    const figure = document.querySelector("#questionFigure");
    const options = document.querySelector("#options");
    const optionEls = Array.from(options?.querySelectorAll(".option") || []).filter(visible);
    const images = Array.from(
      document.querySelectorAll("#questionStem img, #questionFigure img, #options img, .figure-card img, .question-figure img"),
    )
      .filter(visible)
      .map((img) => ({
        src: img.getAttribute("src"),
        alt: img.getAttribute("alt") || "",
        loaded: img.complete && img.naturalWidth > 0,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        rect: rect(img),
      }));
    const optionData = optionEls.map((el) => ({
      text: el.innerText.trim(),
      rect: rect(el),
      lineCount: el.innerText.split(/\n+/).filter((line) => line.trim()).length,
      imageCount: el.querySelectorAll("img").length,
      images: Array.from(el.querySelectorAll("img")).map((img) => ({
        src: img.getAttribute("src"),
        loaded: img.complete && img.naturalWidth > 0,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        rect: rect(img),
      })),
    }));
    const stemText = stem?.innerText.trim() || "";
    const stemLines = stemText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const stemRect = rect(stem);
    const figureRect = rect(figure);
    const optionsRect = rect(options);
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const bad = [];

    if (!stemText) bad.push("missing-stem");
    if (!optionEls.length && !document.querySelector("#cstsAnswer") && !document.querySelector("#answerInput")) {
      bad.push("missing-options-or-answer-input");
    }
    if (stemRect && optionsRect && optionEls.length && optionsRect.top - stemRect.bottom < 12) {
      bad.push(`small-stem-options-gap:${Math.round(optionsRect.top - stemRect.bottom)}`);
    }
    if (figureRect && optionsRect && optionEls.length && optionsRect.top - figureRect.bottom < 12) {
      bad.push(`small-image-options-gap:${Math.round(optionsRect.top - figureRect.bottom)}`);
    }
    images.forEach((img, i) => {
      if (!img.loaded) bad.push(`image-load-failed:${img.src || i + 1}`);
      if (img.rect && img.rect.w > viewport.width - 24) bad.push(`image-too-wide:${img.rect.w}`);
      if (img.rect && img.rect.h > viewport.height * 0.7) bad.push(`image-too-tall:${img.rect.h}`);
    });
    optionData.forEach((opt, i) => {
      if (opt.rect && opt.rect.h > 260) bad.push(`option-too-tall:${i + 1}:${opt.rect.h}`);
      if (opt.text.match(/\n\s*[A-H][.)]/g)?.length >= 2) bad.push(`option-may-merge-choices:${i + 1}`);
      opt.images.forEach((img) => {
        if (!img.loaded) bad.push(`option-image-load-failed:${i + 1}:${img.src}`);
      });
    });
    const oneCharLines = stemLines.filter((line) => /^[A-Ha-h0-9-]$/.test(line)).length;
    if (oneCharLines >= 5) bad.push(`table-linebreak-suspected:${oneCharLines}`);
    const boldBlocks = Array.from(stem?.querySelectorAll("strong, b") || []).filter(visible);
    const boldChars = boldBlocks.map((el) => el.textContent.length).reduce((a, b) => a + b, 0);
    if (boldBlocks.length >= 4 && boldChars > stemText.length * 0.7) bad.push("mostly-bold-stem");

    return {
      setMeta,
      title,
      stemText: stemText.slice(0, 260),
      stemLines: stemLines.length,
      options: optionData,
      images,
      rects: { stem: stemRect, figure: figureRect, options: optionsRect, viewport },
      bad,
    };
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await page.goto(`${BASE_URL}?visual-audit=${Date.now()}`, { waitUntil: "domcontentloaded" });

  const badResults = [];
  const screenshots = [];

  for (const setId of SETS) {
    await selectSet(page, setId);
    const { total } = await currentNumber(page);
    for (let q = 1; q <= total; q += 1) {
      await goQuestion(page, q);
      const result = await measure(page);
      result.setId = setId;
      result.question = q;
      if (result.bad.length) {
        const file = `${safeName(setId)}-q${String(q).padStart(2, "0")}.png`;
        const screenshotPath = path.join(OUT_DIR, file);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        result.screenshot = screenshotPath;
        screenshots.push(screenshotPath);
        badResults.push(result);
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    viewport: VIEWPORT,
    checkedSets: SETS,
    badCount: badResults.length,
    badResults,
    screenshots,
  };
  const reportPath = path.join(OUT_DIR, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ badCount: badResults.length, report: reportPath, screenshots: screenshots.slice(0, 20) }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
