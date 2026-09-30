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
 * Playwright 스위트는 동시에 띄우지 않는다(dist/와 포트를 서로 덮어쓴다). 프로젝트는 한 번의
 * 호출로 묶고, 스펙 파일 필터가 필요한 전수 스윕만 그 뒤에 차례로 실행한다.
 */
const { spawnSync } = require("child_process");
const { main: detect, SWEEP_SPECS } = require("./changed-areas.js");

function plan(areas, { skipSlow = false } = {}) {
  const steps = [];
  const code = areas.ui || areas.logic || areas.unit || areas.data
    || areas.e2e || areas.explore || areas.nonfunctional || areas.apk
    || areas.mutationCore || areas.mutationStorage;
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
  // 변이 대상·그 의존 모듈·대상에 닿는 테스트가 바뀌었을 때만(판정: changed-areas의 import 폐포).
  if (areas.mutationCore) steps.push(["npm", ["run", "test:mutation"]]);
  if (areas.mutationStorage && !skipSlow) steps.push(["npm", ["run", "test:mutation:storage"]]);

  const projects = [];
  if (areas.ui || areas.logic || areas.e2e || areas.data) projects.push("react");
  if (areas.ui || areas.android || areas.apk) projects.push("apk", "apk-nf");
  if (areas.logic || areas.nonfunctional) projects.push("nonfunctional");
  // 탐색 스펙 자체가 바뀌면 explore 전체, 데이터·렌더 경로만 바뀌면 CI e2e-sweep과 같은 두 스펙.
  const exploreAll = areas.explore && !skipSlow;
  if (exploreAll) projects.push("explore");
  if (projects.length) {
    steps.push(["npx", ["playwright", "test", ...projects.map((p) => `--project=${p}`)]]);
  }
  // 스펙 파일 필터는 모든 프로젝트에 걸리므로 위 호출에 섞을 수 없다. 차례로 한 번 더 띄운다
  // (금지는 동시 실행이다 — spawnSync라 앞 호출이 끝난 뒤에 시작한다).
  if (areas.sweep && !exploreAll && !skipSlow) {
    steps.push(["npx", ["playwright", "test", "--project=explore", ...SWEEP_SPECS]]);
  }
  if (areas.android) {
    steps.push(["npm", ["run", "build"]]);
    steps.push(["npm", ["run", "cap:sync"]]);
  }
  // 네이티브 변경은 컴파일까지 해야 검증이다 — 안내만 찍으면 Java·Gradle 오류가 이 명령을
  // 통과한다. Android SDK가 없는 환경에서는 여기서 실패하고, 그 사실이 보고에 남아야 한다.
  if (areas.native) steps.push(["./gradlew", ["assembleDebug"], { cwd: "android" }]);
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
  const show = ([cmd, args, opts]) => `${opts && opts.cwd ? `(cd ${opts.cwd}) ` : ""}${cmd} ${args.join(" ")}`;
  for (const step of steps) console.log(`  ${show(step)}`);
  if (argv.includes("--dry-run")) return 0;

  for (const step of steps) {
    const [cmd, args, opts] = step;
    console.log(`\n[check:changed] ▶ ${show(step)}`);
    const r = spawnSync(cmd, args, { stdio: "inherit", ...(opts || {}) });
    if (r.status !== 0) {
      console.error(`\n[check:changed] ✗ 실패: ${show(step)}`);
      return r.status || 1;
    }
  }
  console.log("\n[check:changed] ✓ 모두 통과");
  return 0;
}

module.exports = { plan };

if (require.main === module) process.exit(run(process.argv.slice(2)));
