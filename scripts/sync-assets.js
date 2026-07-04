#!/usr/bin/env node
/**
 * 자산 단일 정본 동기화 (#52)
 *
 * 정본: www/  (콘텐츠 데이터·이미지 원본)
 * 대상:
 *   - public/  : Vite publicDir → dev 서버와 빌드가 여기서 자산을 취한다.
 *   - dist/    : Vite 빌드 산출물(빌드가 덮어쓰지만 정적 배포 일관성 위해 동기화).
 *
 * 루트 복사·script.js 동기화는 레거시 바닐라 앱 제거(C8)와 함께 삭제됨 —
 * Vercel은 outputDirectory: dist 만 서빙하므로 루트 사본이 불필요하다.
 *
 * predev/prebuild/precap:sync 훅에서 자동 실행된다.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcRoot = path.join(root, "www");

// [자산 폴더, 복사 대상(루트 기준 상대)]
const plan = [
  ["data", ["public", "dist"]],
  ["images", ["public", "dist"]],
  ["source-visuals", ["public", "dist"]],
  ["figures", ["public", "dist"]],
  ["csts-figures", ["public", "dist"]],
  ["icons", ["public", "dist"]],
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
