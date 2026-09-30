/**
 * 변경 파일 목록 → 검증 영역.
 *
 * CI의 경로 필터(ci.yml `changes` 잡)와 로컬 `npm run check:changed`가 같은 분류를 쓰도록
 * 규칙을 여기 한 곳에 둔다. 두 곳이 따로 판단하면 "CI는 돌렸는데 로컬 안내는 빠뜨린"
 * 영역이 생긴다.
 *
 * 원칙: 모르는 파일은 넓게 잡는다. 설정·의존성 변경은 무엇이든 깨뜨릴 수 있으므로 전 영역.
 *
 * CLI
 *   node scripts/changed-areas.js [--base <ref>] [--github-output]
 *   --base 생략 시 origin/main. base를 못 찾으면(얕은 클론·0 SHA) 전 영역을 켠다.
 *   --github-output 은 $GITHUB_OUTPUT 에 `<영역>=true|false` 를 쓴다.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");

const AREAS = ["data", "ui", "logic", "android", "native", "e2e", "unit", "sweep", "mutationStorage"];

// 전 영역을 켜는 파일 — 빌드·테스트 도구 체인 자체.
const GLOBAL = [
  /^package(-lock)?\.json$/,
  /^tsconfig[^/]*\.json$/,
  /^vite\.config\.ts$/,
  /^vitest[^/]*\.config\.ts$/,
  /^playwright\.config\.ts$/,
  /^scripts\/(changed-areas|sync-assets|check-changed)\.js$/,
];

// 영향이 없는 파일 — 문서·이미지 자료.
const INERT = [/\.md$/, /^docs\//, /^LICENSE$/, /^\.github\/ISSUE_TEMPLATE\//, /^DATA\//];

// 저장 계층 뮤테이션 점수를 바꿀 수 있는 파일. 변이 대상 두 개 + 그것이 import하는 모듈 +
// 변이를 죽이는 테스트. 다른 src 테스트도 이 점수를 조금씩 바꿀 수 있는데, 그 드리프트는
// main 야간 실행(daily-e2e.yml)이 잡는다.
const MUTATION_STORAGE = [
  /^src\/utils\/storage[^/]*\.ts$/,
  /^src\/store\//,
  /^src\/utils\/(answerKey|roundHistory|toast)[^/]*\.ts$/,
  /^stryker\.storage\.config\.json$/,
  /^vitest\.stryker\.config\.ts$/,
];

// 전 세트 순회 스펙(fullsweep·fullgrade)이 유일하게 잡는 변경 — 문항 데이터와 그것을
// 화면·채점으로 옮기는 경로.
const SWEEP = [
  /^www\/(data|images)\//,
  /^src\/utils\/(parser|questionLoader|scoring|answer|sessionDerive)[^/]*\.tsx?$/,
  /^src\/components\/quiz\/QuestionCard\.tsx$/,
  // 출제 목록을 조립하는 훅과 채점 흐름을 도는 훅(파생 계산은 sessionDerive로 꺼내 두었다).
  // 세트에서 문항이 빠지거나 완주 채점이 깨지는 회귀는 전수 스윕·완주 채점만 잡는다.
  /^src\/hooks\/(useQuestions|useQuizSession)\.ts$/,
];

function classify(files) {
  const on = Object.fromEntries(AREAS.map((a) => [a, false]));
  const all = () => AREAS.forEach((a) => (on[a] = true));
  for (const f of files) {
    if (GLOBAL.some((r) => r.test(f))) { all(); continue; }
    if (INERT.some((r) => r.test(f))) continue;
    if (MUTATION_STORAGE.some((r) => r.test(f))) on.mutationStorage = true;
    // 테스트 파일은 스윕 대상이 아니다 — 화면·채점 경로를 바꾸지 않는다(scoring.test.ts 등).
    if (!/\.test\.tsx?$/.test(f) && SWEEP.some((r) => r.test(f))) on.sweep = true;

    if (/\.test\.tsx?$/.test(f)) { on.unit = true; continue; }
    if (/^www\/(data|images)\//.test(f) || /^scripts\//.test(f)) { on.data = true; continue; }
    if (/^e2e\//.test(f)) { on.e2e = true; continue; }
    if (/^(android\/|capacitor\.config\.json$)/.test(f)) {
      on.android = true;
      // 네이티브 프로젝트(Java·Gradle·매니페스트·리소스) — Gradle 컴파일이 필요하다.
      // assets/public은 cap:sync가 dist에서 복사해 넣는 웹 산출물이라 제외한다.
      if (/^android\//.test(f) && !/^android\/app\/src\/main\/assets\//.test(f)) on.native = true;
      continue;
    }
    if (/^src\/utils\/parser\.tsx$/.test(f) || /^src\/(components|app|styles)\//.test(f)
      || /^(index\.vite\.html|public\/)/.test(f)) { on.ui = true; continue; }
    if (/^(src\/|middleware\.ts$)/.test(f)) { on.logic = true; continue; }
    // 워크플로·기타 루트 파일: 무엇을 건드렸는지 모르므로 넓게.
    all();
  }
  return on;
}

function changedFiles(base) {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  if (!base || /^0+$/.test(base)) return null;
  try {
    git("rev-parse", "--verify", `${base}^{commit}`);
  } catch {
    return null;
  }
  const committed = git("diff", "--name-only", `${base}...HEAD`);
  // 로컬: 커밋 안 한 변경도 포함한다(CI에서는 비어 있다).
  const working = git("diff", "--name-only", "HEAD");
  const untracked = git("ls-files", "--others", "--exclude-standard");
  return [...new Set([committed, working, untracked].join("\n").split("\n").filter(Boolean))];
}

function main(argv) {
  const i = argv.indexOf("--base");
  const base = i >= 0 ? argv[i + 1] : "origin/main";
  const files = changedFiles(base);
  const areas = files === null
    ? Object.fromEntries(AREAS.map((a) => [a, true]))
    : classify(files);
  if (argv.includes("--github-output")) {
    const out = AREAS.map((a) => `${a}=${areas[a]}`).join("\n") + "\n";
    fs.appendFileSync(process.env.GITHUB_OUTPUT, out);
  }
  const reason = files === null ? `base '${base}'를 찾지 못해 전 영역` : `${files.length}개 파일`;
  console.error(`[changed-areas] ${reason}: ${AREAS.filter((a) => areas[a]).join(", ") || "(없음)"}`);
  return { files, areas };
}

module.exports = { AREAS, classify, changedFiles, main };

if (require.main === module) {
  const { areas } = main(process.argv.slice(2));
  if (!process.argv.includes("--github-output")) console.log(JSON.stringify(areas));
}
