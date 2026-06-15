#!/usr/bin/env node
/**
 * 자산 단일 정본 동기화 (#52)
 *
 * 정본: www/  (APK web-dir이자 콘텐츠 원본)
 * 대상:
 *   - public/  : Vite publicDir. 웹(Vercel 루트 서빙)의 데이터 폴백 경로(./public/data) + 이미지.
 *   - dist/    : Vite 빌드 산출물(빌드가 덮어쓰지만 정적 배포 일관성 위해 동기화).
 *   - (루트)   : Vercel이 루트를 서빙하므로 figure의 절대경로 "/images/..", "/source-visuals/.." 가
 *                루트에서 해석된다. 따라서 이미지류는 루트에도 둔다.
 *
 * data 는 루트에 두지 않는다: Windows 대소문자 무시 파일시스템에서 원본 PDF 폴더 DATA/ 와 충돌하고,
 * script.js 가 ./data 실패 시 ./public/data 로 폴백하므로 public/data 로 충분하다.
 *
 * predev/preserve/prebuild/precap:sync 훅에서 자동 실행된다.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcRoot = path.join(root, "www");

// [자산 폴더, 복사 대상(루트 기준 상대; "" = 저장소 루트)]
const plan = [
  ["data", ["public", "dist"]],
  ["images", ["", "public", "dist"]],
  ["source-visuals", ["", "public", "dist"]],
  ["figures", ["", "public", "dist"]],
  ["csts-figures", ["", "public", "dist"]],
  ["icons", ["", "public", "dist"]],
];

let count = 0;
for (const [asset, targets] of plan) {
  const src = path.join(srcRoot, asset);
  if (!fs.existsSync(src)) continue;
  for (const t of targets) {
    const dst = path.join(root, t, asset);
    fs.rmSync(dst, { recursive: true, force: true });
    fs.cpSync(src, dst, { recursive: true });
    count++;
  }
}
console.log(`[sync-assets] www/ 정본에서 ${count}개 자산 폴더 동기화 완료`);
