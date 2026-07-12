#!/usr/bin/env node
/**
 * 자산 단일 정본 동기화 (#52)
 *
 * 정본: www/  (콘텐츠 데이터·이미지 원본, 커밋됨)
 * 대상(둘 다 생성물이라 커밋하지 않음 — predev/prebuild 훅이 재생성):
 *   - public/  : Vite publicDir → dev 서버와 빌드가 여기서 자산을 취한다. (public/service-worker.js tombstone만 정본·커밋)
 *   - dist/    : Vite 빌드 산출물.
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
const missing = [];
for (const [asset, targets] of plan) {
  const src = path.join(srcRoot, asset);
  // 정본 누락은 조용히 건너뛰지 않는다 — 절반만 동기화된 배포가 "성공"으로 넘어가는 것 방지.
  if (!fs.existsSync(src)) { missing.push(asset); continue; }
  for (const t of targets) {
    const dst = path.join(root, t, asset);
    // 원자적 교체 — 대상을 먼저 지우고 복사하면 중간 크래시 시 자산이 삭제된 채 남는다.
    // 임시 폴더에 복사를 끝낸 뒤 rename으로 교체해 "긴 작업(복사)" 중단이 대상을 해치지 않게 한다.
    const tmp = `${dst}.tmp-sync`;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.cpSync(src, tmp, { recursive: true });
    fs.rmSync(dst, { recursive: true, force: true });
    fs.renameSync(tmp, dst);
    count++;
  }
}
if (missing.length) {
  console.error(`[sync-assets] 정본 폴더 누락: ${missing.map((m) => `www/${m}`).join(', ')} — 동기화를 실패로 처리합니다.`);
  process.exit(1);
}
console.log(`[sync-assets] www/ 정본에서 ${count}개 자산 폴더 동기화 완료`);
