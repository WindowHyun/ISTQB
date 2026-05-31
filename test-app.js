const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      errors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', err => {
    errors.push(`[Exception] ${err.message}`);
  });

  try {
    console.log("Navigating to http://localhost:8080/");
    await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
    
    // 1. Initial Load Checks
    console.log("Checking Initial Load...");
    const title = await page.title();
    console.log("Title:", title);
    
    // 2. Select a Set and Mode
    console.log("Starting a Practice Session...");
    await page.click('button:has-text("샘플문제 A")');
    await page.click('button:has-text("연습 모드 시작")');
    await page.waitForSelector('.question-container', { state: 'visible' });
    
    // 3. Answer a question
    console.log("Answering Question 1...");
    await page.click('.options button:nth-child(1)');
    await page.click('#submitBtn'); // In practice mode, this grades the single question
    
    // 4. Move to next question
    console.log("Moving to Next Question...");
    await page.click('#nextBtn');
    
    // 5. Open Settings and Check Console Log Button
    console.log("Testing Settings and vConsole...");
    await page.click('#settingsPanelToggleBtn');
    await page.waitForSelector('#consoleLogBtn', { state: 'visible' });
    await page.click('#consoleLogBtn');
    
    // Wait for vConsole
    await page.waitForTimeout(1000);
    const vConsoleBtn = await page.$('#__vconsole');
    console.log("vConsole Loaded:", !!vConsoleBtn);

    // 6. Test Export
    console.log("Testing Export...");
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#exportBackupBtn')
    ]);
    console.log("Downloaded backup:", download.suggestedFilename());
    
    // 7. Check Wrong Note
    console.log("Testing Wrong Note...");
    await page.click('.app-navigation-section #productHomeBtn');
    // Wait for home
    await page.waitForTimeout(500);
    await page.click('#wrongNoteBtn');
    await page.waitForSelector('#wrongNoteModal', { state: 'visible' });
    
    const wrongItems = await page.$$('.wrong-item');
    console.log("Wrong items found:", wrongItems.length);
    
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    if (errors.length > 0) {
      console.log("\\n--- Browser Logs/Errors ---");
      console.log(errors.join('\\n'));
    } else {
      console.log("\\nNo browser errors detected.");
    }
    await browser.close();
  }
})();
