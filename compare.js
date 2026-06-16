const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = 'C:/Users/Computer/.gemini/antigravity/brain/d7a0f5ae-6c7d-4354-8c16-02fa28334420';

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // 1. Capture Vanilla JS (AS-IS) - ISTQB
  console.log('Navigating to AS-IS (Vanilla JS)...');
  await page.goto('http://localhost:3000/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:3000/');
  await page.waitForTimeout(1000);
  console.log('Clicking ISTQB (AS-IS)');
  await page.click('text=ISTQB');
  await page.waitForTimeout(2000);
  const asisIstqbPath = path.join(ARTIFACTS_DIR, 'screenshot_asis_istqb.png');
  await page.screenshot({ path: asisIstqbPath, fullPage: true });

  // Capture Vanilla JS (AS-IS) - CSTS
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:3000/'); // Reset to home
  await page.waitForTimeout(1000);
  console.log('Clicking CSTS (AS-IS)');
  await page.click('text=CSTS');
  await page.waitForTimeout(2000);
  const asisCstsPath = path.join(ARTIFACTS_DIR, 'screenshot_asis_csts.png');
  await page.screenshot({ path: asisCstsPath, fullPage: true });

  // 2. Capture React (TO-BE) - ISTQB
  console.log('Navigating to TO-BE (React)...');
  await page.goto('http://localhost:3001/index.vite.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:3001/index.vite.html');
  await page.waitForTimeout(1000);
  console.log('Clicking ISTQB (TO-BE)');
  await page.click('text=ISTQB');
  await page.waitForTimeout(2000);
  const tobeIstqbPath = path.join(ARTIFACTS_DIR, 'screenshot_tobe_istqb.png');
  await page.screenshot({ path: tobeIstqbPath, fullPage: true });

  // Capture React (TO-BE) - CSTS
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:3001/index.vite.html'); // Reset to home
  await page.waitForTimeout(1000);
  console.log('Clicking CSTS (TO-BE)');
  await page.click('text=CSTS');
  await page.waitForTimeout(2000);
  const tobeCstsPath = path.join(ARTIFACTS_DIR, 'screenshot_tobe_csts.png');
  await page.screenshot({ path: tobeCstsPath, fullPage: true });

  await browser.close();
  console.log('Comparison screenshots successfully saved.');
})();
