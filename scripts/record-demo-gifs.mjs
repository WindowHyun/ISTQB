// README 데모 GIF 재녹화 — vite preview(4173)를 Playwright로 조작하며 상태별 무손실
// 스크린샷을 캡처해 gifenc로 GIF 인코딩. 기존 GIF와 동일 규격(600x371, 6종).
// 사용법: `npm run preview`를 띄운 상태에서 `node scripts/record-demo-gifs.mjs`
// ※ 비디오 녹화(webm) 경유는 손실 압축 노이즈로 정지 프레임까지 매번 달라져
//    GIF 용량이 10배 이상 불어난다 — 반드시 스크린샷 방식을 유지할 것.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import gifencPkg from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifencPkg;

const BASE = 'http://localhost:4173';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(REPO, 'docs', 'gifs');

// 1200x742 화면을 0.5배 스케일로 캡처 → 600x371 (기존 GIF와 동일).
const VIEW = { width: 1200, height: 742 };
const SCALE = 0.5;

function encodeGif(shots, gifPath) {
  // 전역 팔레트 — 프레임별 로컬 팔레트는 용량·색 흔들림의 원인.
  const decoded = shots.map((s) => ({ png: PNG.sync.read(s.data), delay: s.delay }));
  const sampleIdx = [...new Set([0, Math.floor(decoded.length / 2), decoded.length - 1])];
  const mergedLen = sampleIdx.reduce((sum, i) => sum + decoded[i].png.data.length, 0);
  const sample = new Uint8Array(mergedLen);
  let off = 0;
  for (const i of sampleIdx) { sample.set(decoded[i].png.data, off); off += decoded[i].png.data.length; }
  const palette = quantize(sample, 128);

  // 연속 동일 프레임은 지연시간만 누적(정지 구간 중복 저장 방지).
  const frames = [];
  let prev = null;
  for (const { png, delay } of decoded) {
    const buf = Buffer.from(png.data.buffer, png.data.byteOffset, png.data.byteLength);
    if (prev && prev.equals(buf)) {
      frames[frames.length - 1].delay += delay;
    } else {
      frames.push({ index: applyPalette(png.data, palette), width: png.width, height: png.height, delay });
      prev = Buffer.from(buf);
    }
  }
  const gif = GIFEncoder();
  for (const fr of frames) gif.writeFrame(fr.index, fr.width, fr.height, { palette, delay: fr.delay });
  gif.finish();
  fs.writeFileSync(gifPath, Buffer.from(gif.bytes()));
}

async function record(name, fn) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE });
  const page = await ctx.newPage();
  const shots = [];
  // snap(ms): 렌더 안정화 후 현재 화면을 캡처하고 GIF에서 ms 동안 보여준다.
  const snap = async (delay = 800) => {
    await page.waitForTimeout(220); // 모달 페이드 등 전환 마무리 대기
    shots.push({ data: await page.screenshot({ animations: 'disabled' }), delay });
  };
  try {
    await fn(page, snap);
    const gif = path.join(OUT_DIR, `${name}.gif`);
    encodeGif(shots, gif);
    console.log('✔', name, shots.length + '컷', Math.round(fs.statSync(gif).size / 1024) + 'KB');
  } finally {
    await browser.close();
  }
}

const openISTQB = async (page, snap) => {
  await page.goto(BASE + '/');
  await snap(1200); // 게이트(제품 선택 + 사용법·제보 링크)
  await page.getByRole('button', { name: 'ISTQB' }).click();
  await page.locator('#questionStem').waitFor({ timeout: 20000 });
  await snap(1200);
};

const submitGrade = async (page, snap) => {
  await page.getByTestId('grade-button').click();
  const confirm = page.getByTestId('confirm-grade');
  await confirm.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
  if (await confirm.count()) { await snap(900); await confirm.click(); }
};

// 1. 연습 풀이 — 즉시 피드백·문항 이동
await record('01-practice', async (page, snap) => {
  await openISTQB(page, snap);
  await page.locator('#options .option').nth(1).click();
  await snap(1800); // 즉시 피드백
  await page.locator('#nextBtn').click();
  await snap(1000);
  await page.locator('#options .option').first().click();
  await snap(1800);
  await page.locator('#nextBtn').click();
  await snap(1200);
});

// 2. 시험 채점 — 점수·정답 공개
await record('02-grade', async (page, snap) => {
  await openISTQB(page, snap);
  await page.getByRole('button', { name: '시험', exact: true }).click();
  await snap(1300); // 시험 시작 게이트
  await page.getByTestId('exam-start-btn').click();
  await page.locator('#questionStem').waitFor({ timeout: 20000 });
  await snap(900);
  for (let i = 0; i < 3; i++) {
    await page.locator('#options .option').nth(i % 4).click();
    await snap(600);
    await page.locator('#nextBtn').click();
    await snap(500);
  }
  await submitGrade(page, snap);
  await page.getByTestId('score').waitFor({ timeout: 10000 });
  await snap(2600); // 결과 요약(점수) 모달
  await page.getByTestId('result-summary').getByRole('button', { name: '닫기' }).click();
  await snap(1400); // 정답 공개된 본문
});

// 3. 오답노트 열기·확인
await record('03-wrongnote', async (page, snap) => {
  await openISTQB(page, snap);
  await page.getByRole('button', { name: '시험', exact: true }).click();
  await page.getByTestId('exam-start-btn').click();
  await page.locator('#questionStem').waitFor({ timeout: 20000 });
  await page.locator('#options .option').first().click();
  await submitGrade(page, snap);
  await page.getByTestId('result-summary').getByRole('button', { name: '닫기' }).click();
  await snap(900);
  await page.getByRole('button', { name: '오답 노트' }).click();
  await page.getByTestId('wrong-note').waitFor({ timeout: 10000 });
  await snap(2000);
  const body = page.getByTestId('wrong-note').locator('.modal-body, [class*="body"]').first();
  await body.evaluate((el) => el.scrollBy(0, 300)).catch(() => {});
  await snap(1700);
  await body.evaluate((el) => el.scrollBy(0, 300)).catch(() => {});
  await snap(1700);
});

// 4. 설정 — 글자 크기 변경
await record('04-settings', async (page, snap) => {
  await openISTQB(page, snap);
  await page.getByRole('button', { name: /설정/ }).click();
  await snap(1400);
  await page.getByRole('button', { name: '크게' }).click();
  await snap(1600);
  await page.getByRole('button', { name: '작게' }).click();
  await snap(1600);
  await page.getByRole('button', { name: '기본' }).click();
  await snap(1200);
  await page.getByRole('dialog', { name: '설정' }).getByRole('button', { name: '닫기' }).click();
  await snap(1200);
});

// 5. 모드 전환·번호 팔레트·키보드 네비
await record('05-nav', async (page, snap) => {
  await openISTQB(page, snap);
  const nav = page.locator('#questionNav button');
  await nav.nth(5).click();
  await snap(1100);
  await nav.nth(11).click();
  await snap(1100);
  await page.keyboard.press('ArrowRight');
  await snap(900);
  await page.keyboard.press('ArrowRight');
  await snap(900);
  await page.keyboard.press('ArrowLeft');
  await snap(900);
  await page.locator('.segmented button', { hasText: /^랜덤$/ }).first().click();
  await snap(1500);
  await page.locator('.segmented button', { hasText: /^연습$/ }).first().click();
  await snap(1300);
});

// 6. 단답형 입력·정답 확인 (CSTS 2018 — short_answer 문항)
await record('06-shortanswer', async (page, snap) => {
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: 'CSTS' }).click();
  await page.locator('#questionStem').waitFor({ timeout: 20000 });
  await page.locator('#examSelect').selectOption('CSTS-EL-2018');
  await page.locator('#questionStem').waitFor({ timeout: 15000 });
  await snap(1100);
  const nav = page.locator('#questionNav button');
  const total = await nav.count();
  for (let i = 0; i < total; i++) {
    if (((await nav.nth(i).textContent()) || '').trim() === '18') { await nav.nth(i).click(); break; }
  }
  await page.locator('.short-answer-input').waitFor({ timeout: 5000 });
  await snap(1100);
  // 타이핑 과정을 3컷으로 나눠 입력이 진행되는 느낌을 준다.
  await page.locator('.short-answer-input').fill('테');
  await snap(500);
  await page.locator('.short-answer-input').fill('테스트');
  await snap(500);
  await page.locator('.short-answer-input').fill('테스트 실행');
  await snap(800);
  await page.getByRole('button', { name: '정답 확인' }).click();
  await snap(2400);
});

console.log('done');
