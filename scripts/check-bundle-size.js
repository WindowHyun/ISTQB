#!/usr/bin/env node
/**
 * 번들 크기 예산 검사 (성능 회귀 가드)
 *
 * dist/assets 의 JS·CSS raw 합계가 예산을 넘으면 실패한다.
 * 목적: 무거운 의존성 유입 등 "큰" 회귀 조기 감지. 소폭 증가엔 관대하도록
 * 현재 크기 대비 넉넉한 여유를 둔다(현재 JS ~265KB·CSS ~31KB).
 *
 * CI(build job)와 로컬(`node scripts/check-bundle-size.js`) 공용.
 */
const fs = require("fs");
const path = require("path");

const KB = 1024;
const BUDGET = {
  js: 330 * KB, // 현재 ~265KB
  css: 45 * KB, // 현재 ~31KB
};

const assetsDir = path.join(__dirname, "..", "dist", "assets");

function sumBytes(ext) {
  if (!fs.existsSync(assetsDir)) return null;
  return fs
    .readdirSync(assetsDir)
    .filter((f) => f.endsWith(ext))
    .reduce((sum, f) => sum + fs.statSync(path.join(assetsDir, f)).size, 0);
}

const js = sumBytes(".js");
const css = sumBytes(".css");

if (js === null) {
  console.error("[bundle-size] dist/assets 가 없습니다. 먼저 `npm run build` 를 실행하세요.");
  process.exit(1);
}

const fmt = (n) => `${(n / KB).toFixed(1)} KB`;
let failed = false;
for (const [kind, size, budget] of [
  ["JS", js, BUDGET.js],
  ["CSS", css, BUDGET.css],
]) {
  const pct = ((size / budget) * 100).toFixed(0);
  const status = size > budget ? "초과" : "OK";
  console.log(`[bundle-size] ${kind}: ${fmt(size)} / 예산 ${fmt(budget)} (${pct}%) — ${status}`);
  if (size > budget) failed = true;
}

if (failed) {
  console.error("[bundle-size] 번들 예산 초과 — 의존성/코드 증가를 확인하거나 예산을 재검토하세요.");
  process.exit(1);
}
console.log("[bundle-size] 모든 예산 이내.");
