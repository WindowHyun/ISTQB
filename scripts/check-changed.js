/**
 * 변경된 파일에 맞는 검증 명령만 골라 차례로 실행한다(`npm run check:changed`).
 *
 * 영역 분류는 scripts/changed-areas.js가 정본이다 — CI 경로 필터와 같은 규칙을 쓴다.
 * 명령 표는 AGENTS.md의 '검증' 표와 같다. 둘 중 하나를 바꾸면 다른 쪽도 고친다.
 *
 *   npm run check:changed                  # origin/main 대비 + 커밋 안 한 변경
 *   npm run check:changed -- --base HEAD~3
 *   npm run check:changed -- --dry-run     # 실행하지 않고 고른 명령만 보여 준다
 *   npm run check:changed -- --skip-slow   # 저장 계층 뮤테이션(~12분)·탐색 E2E를 건너뛴다
 *
 * Playwright 스위트는 한 번의 호출로 묶어 실행한다(스위트를 따로 띄우면 dist/를 서로 덮어쓴다).
 */
const { spawnSync } = require("child_process");
const { main: detect } = require("./changed-areas.js");

function plan(areas, { skipSlow = false } = {}) {
  const steps = [];
  const code = areas.ui || areas.logic || areas.unit || areas.e2e || areas.data;
  if (code) {
    steps.push(["npm", ["run", "lint"]]);
    steps.push(["npm", ["run", "typecheck"]]);
    steps.push(["npm", ["run", "typecheck:test"]]);
    steps.push(["npm", ["test"]]);
  }
  if (areas.data) {
    steps.push(["npm", ["run", "verify"]]);
    steps.push(["python3", ["scripts/verify-pdf-data.py"]]);
  }
  if (areas.logic) steps.push(["npm", ["run", "test:mutation"]]);
  if (areas.mutationStorage && !skipSlow) steps.push(["npm", ["run", "test:mutation:storage"]]);

  const projects = [];
  if (areas.ui || areas.logic || areas.e2e || areas.data) projects.push("react");
  if (areas.ui || areas.android) projects.push("apk", "apk-nf");
  if (areas.logic) projects.push("nonfunctional");
  if (areas.sweep && !skipSlow) projects.push("explore");
  if (projects.length) {
    steps.push(["npx", ["playwright", "test", ...projects.map((p) => `--project=${p}`)]]);
  }
  if (areas.android) {
    steps.push(["npm", ["run", "build"]]);
    steps.push(["npm", ["run", "cap:sync"]]);
  }
  return steps;
}

function run(argv) {
  const baseIdx = argv.indexOf("--base");
  const { areas } = detect(baseIdx >= 0 ? ["--base", argv[baseIdx + 1]] : []);
  const steps = plan(areas, { skipSlow: argv.includes("--skip-slow") });
  if (!steps.length) {
    console.log("[check:changed] 검증할 코드 변경이 없습니다(문서만 바뀌었거나 변경 없음).");
    return 0;
  }
  console.log("[check:changed] 실행할 명령:");
  for (const [cmd, args] of steps) console.log(`  ${cmd} ${args.join(" ")}`);
  if (areas.android) console.log("  (네이티브 코드를 바꿨다면 추가로: cd android && ./gradlew assembleDebug)");
  if (argv.includes("--dry-run")) return 0;

  for (const [cmd, args] of steps) {
    console.log(`\n[check:changed] ▶ ${cmd} ${args.join(" ")}`);
    const r = spawnSync(cmd, args, { stdio: "inherit" });
    if (r.status !== 0) {
      console.error(`\n[check:changed] ✗ 실패: ${cmd} ${args.join(" ")}`);
      return r.status || 1;
    }
  }
  console.log("\n[check:changed] ✓ 모두 통과");
  return 0;
}

module.exports = { plan };

if (require.main === module) process.exit(run(process.argv.slice(2)));
