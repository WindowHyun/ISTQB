#!/usr/bin/env node
/**
 * 번들 크기 예산 검사 (성능 회귀 가드)
 *
 * dist의 JS·CSS를 gzip 압축한 크기 합계가 예산을 넘으면 실패한다.
 *
 * 왜 gzip인가: 사용자가 실제로 내려받는 건 압축된 바이트다(Vercel·안드로이드 WebView
 * 모두 gzip/brotli 전송). 종전에는 압축 전 raw 바이트를 셌는데, 그러면 실제 전송량의
 * 약 3배를 기준으로 경보가 울린다 — 349KB raw = 115KB gzip이라 "예산 97% 소진"이
 * 떠도 사용자 비용은 그 3분의 1이었다. 잘못된 값을 재면 최적화를 해도 개선이 보이지
 * 않고, 하지 않아도 곧 터진다.
 *
 * 목적은 여전히 "무거운 의존성 유입 등 큰 회귀"를 잡는 것이다. 소폭 증가마다 실패해
 * 경보가 무뎌지지 않도록 실측 대비 약 20%의 여유를 둔다.
 *
 * 참고: JS의 약 2/3은 React 런타임이라 앱 코드를 줄여도 총량은 크게 변하지 않는다.
 * 코드 분할은 첫 로드 체감을 개선하지만 이 지표(dist 전체 합계)는 그대로다.
 *
 * CI(build job)와 로컬(`npm run size`) 공용.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const KB = 1024;
const BUDGET = {
  js: 140 * KB, // 현재 ~115KB gzip(메인 ~94 + SW/workbox ~9 + 지연 청크 ~12)
  css: 12 * KB, // 현재 ~8.5KB gzip
};

const distDir = path.join(__dirname, "..", "dist");
const assetsDir = path.join(distDir, "assets");

/** 디렉터리 안 확장자별 파일의 [상대경로, gzip 크기] 목록. 디렉터리가 없으면 null. */
function gzipSizesIn(dir, ext) {
  if (!fs.existsSync(dir)) return null;
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(ext) && fs.statSync(path.join(dir, f)).isFile())
    .map((f) => {
      const p = path.join(dir, f);
      // level 9 — 실제 서버 설정에 따라 조금 달라지지만 회귀 감지용 상대 비교엔 충분하다.
      return [path.relative(distDir, p), zlib.gzipSync(fs.readFileSync(p), { level: 9 }).length];
    });
}

const assetsJs = gzipSizesIn(assetsDir, ".js");
// 서비스워커도 브라우저가 내려받는 JS다 — assets만 세면 SW 비대화가 예산을 우회한다.
const rootJs = gzipSizesIn(distDir, ".js") ?? [];
const cssFiles = gzipSizesIn(assetsDir, ".css") ?? [];

if (assetsJs === null) {
  console.error("[bundle-size] dist/assets 가 없습니다. 먼저 `npm run build` 를 실행하세요.");
  process.exit(1);
}

const jsFiles = [...assetsJs, ...rootJs];
const sum = (files) => files.reduce((n, [, size]) => n + size, 0);

const fmt = (n) => `${(n / KB).toFixed(1)} KB`;
let failed = false;
for (const [kind, files, budget] of [
  ["JS", jsFiles, BUDGET.js],
  ["CSS", cssFiles, BUDGET.css],
]) {
  const size = sum(files);
  const pct = ((size / budget) * 100).toFixed(0);
  const status = size > budget ? "초과" : "OK";
  console.log(`[bundle-size] ${kind}: ${fmt(size)} gzip / 예산 ${fmt(budget)} (${pct}%) — ${status}`);
  if (size > budget) failed = true;
}

if (failed) {
  // 어떤 파일이 커졌는지 함께 보여준다 — 숫자만 보면 원인을 다시 찾아야 한다.
  const list = [...jsFiles, ...cssFiles].sort((a, b) => b[1] - a[1]);
  console.error("[bundle-size] 큰 파일 상위(gzip):");
  for (const [name, size] of list.slice(0, 5)) console.error(`  ${fmt(size).padStart(10)}  ${name}`);
  console.error("[bundle-size] 번들 예산 초과 — 의존성/코드 증가를 확인하거나 예산을 재검토하세요.");
  process.exit(1);
}
console.log("[bundle-size] 모든 예산 이내.");
