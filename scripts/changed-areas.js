/**
 * 변경 파일 목록 → 검증 영역.
 *
 * CI의 경로 필터(ci.yml의 mutation-storage·e2e-sweep 잡)와 로컬 `npm run check:changed`가 같은
 * 분류를 쓰도록 규칙을 여기 한 곳에 둔다. 두 곳이 따로 판단하면 "CI는 돌렸는데 로컬 안내는
 * 빠뜨린" 영역이 생긴다.
 *
 * 원칙: 모르는 파일은 넓게 잡는다. 다만 넓게 잡을 때도 그 파일이 닿을 수 없는 비싼 검사
 * (Gradle 컴파일·뮤테이션)는 켜지 않는다 — Android SDK가 없는 곳에서 Gradle이 실패하거나,
 * 워크플로 한 줄 고친 PR이 12분짜리 뮤테이션을 도는 것은 넓은 게 아니라 틀린 것이다.
 *
 * CLI
 *   node scripts/changed-areas.js [--base <ref>] [--github-output]
 *   --base 생략 시 origin/main. base를 못 찾으면(얕은 클론·0 SHA) 전 영역을 켠다.
 *   --github-output 은 $GITHUB_OUTPUT 에 `<영역>=true|false` 를 쓴다.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const AREAS = [
  "data", "ui", "logic", "android", "native",
  // E2E 스펙 자체의 변경 — 바뀐 스펙이 속한 Playwright 프로젝트를 돌린다(e2e = react 프로젝트).
  "e2e", "explore", "nonfunctional", "apk",
  "unit", "sweep",
  // 뮤테이션 게이트 — 변이 대상의 import 폐포와 그 대상을 import하는 테스트에서만 켜진다.
  "mutationCore", "mutationStorage",
];

// 전수 스윕 스펙 — sweep 영역이 켜졌을 때 CI(e2e-sweep)와 로컬이 똑같이 이 둘만 돌린다.
const SWEEP_SPECS = ["e2e/explore-fullsweep.spec.ts", "e2e/explore-fullgrade.spec.ts"];

// 뮤테이션 게이트별 Stryker 설정. 변이 대상은 설정의 `mutate`에서 읽는다 — 목록을 여기 따로
// 적어 두면 설정에 대상을 추가할 때 게이트가 조용히 빠진다.
const MUTATION_CONFIGS = {
  mutationCore: "stryker.config.json",
  mutationStorage: "stryker.storage.config.json",
};

// 도구 체인 — 무엇이든 깨뜨릴 수 있으므로 넓게. 뮤테이션은 아래 MUTATION_TOOLING만 켠다.
const GLOBAL = [
  /^package(-lock)?\.json$/,
  /^tsconfig[^/]*\.json$/,
  /^vite\.config\.ts$/,
  /^vitest[^/]*\.config\.ts$/,
  /^playwright\.config\.ts$/,
  /^scripts\/(changed-areas|sync-assets|check-changed)\.js$/,
];

// 테스트 러너·Stryker 버전과 설정 — 두 뮤테이션 게이트의 점수를 모두 바꿀 수 있다.
const MUTATION_TOOLING = [/^package(-lock)?\.json$/, /^vitest[^/]*\.config\.ts$/];

// 영향이 없는 파일 — 문서·이미지 자료.
const INERT = [/\.md$/, /^docs\//, /^LICENSE$/, /^\.github\/ISSUE_TEMPLATE\//, /^DATA\//];

// 전 세트 순회 스펙(fullsweep·fullgrade)이 유일하게 잡는 변경 — 문항 데이터와 그것을
// 화면·채점으로 옮기는 경로.
const SWEEP = [
  /^www\/(data|images)\//,
  /^src\/utils\/(parser|questionLoader|scoring|answer|sessionDerive)[^/]*\.tsx?$/,
  // 문항을 그리는 카드, 카드를 조립하고 제출·채점을 부르는 작업 영역, 완주 결과(점수·합격선).
  // fullgrade는 12세트를 끝까지 풀고 결과 화면의 점수를 대조한다 — 이 셋 중 하나만 어긋나도
  // react 프로젝트의 표본 문항으로는 드러나지 않는다.
  /^src\/components\/quiz\/(QuestionCard|QuestionWorkspace|ResultSummary)\.tsx$/,
  // 출제 목록을 조립하는 훅과 채점 흐름을 도는 훅(파생 계산은 sessionDerive로 꺼내 두었다).
  // 세트에서 문항이 빠지거나 완주 채점이 깨지는 회귀는 전수 스윕·완주 채점만 잡는다.
  /^src\/hooks\/(useQuestions|useQuizSession)\.ts$/,
];

const isTest = (f) => /\.test\.tsx?$/.test(f);

// ── import 그래프 ───────────────────────────────────────────────────────────
// 정적 분석 도구 없이 상대 경로 import만 읽는다. `import type`은 런타임에 없으니 제외한다.
const STATIC_IMPORT = /\b(?:import|export)\s+(type\s+)?(?:[^;'"`]*?\sfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]/g;
const CALL_IMPORT = /\b(?:import|require|vi\.mock|vi\.importActual)\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]/g;

function resolveImport(from, spec, exists) {
  const base = path.posix.join(path.posix.dirname(from), spec);
  const stem = base.replace(/\.(js|jsx)$/, "");
  const candidates = [base, `${stem}.ts`, `${stem}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
  return candidates.find(exists) || null;
}

function importsOf(file, read, exists) {
  const src = read(file);
  if (src == null) return [];
  const out = new Set();
  for (const m of src.matchAll(STATIC_IMPORT)) {
    if (m[1]) continue;
    const r = resolveImport(file, m[2], exists);
    if (r) out.add(r);
  }
  for (const m of src.matchAll(CALL_IMPORT)) {
    const r = resolveImport(file, m[1], exists);
    if (r) out.add(r);
  }
  return [...out];
}

/** 파일 → 그 파일이 (전이적으로) import하는 파일 전부(자신 포함). */
function closureOf(start, imports) {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const g of imports(f)) stack.push(g);
  }
  return seen;
}

/**
 * 뮤테이션 게이트 하나의 점수를 바꿀 수 있는 파일 집합.
 * - 변이 대상과 그것이 import하는 모듈 — 대상의 동작이 바뀐다.
 * - 대상에 닿는 테스트, 그리고 테스트가 대상에 닿기까지 거치는 모듈 — 변이를 죽이는 쪽이 바뀐다.
 * 테스트가 대상과 무관하게 import하는 모듈(예: 속성 테스트가 함께 부르는 parser)은 넣지 않는다.
 */
function mutationScope(targets, srcFiles, imports) {
  const scope = new Set();
  for (const t of targets) for (const f of closureOf(t, imports)) scope.add(f);
  const targetSet = new Set(targets);
  const reachesTarget = (f) => [...closureOf(f, imports)].some((g) => targetSet.has(g));
  for (const t of srcFiles.filter(isTest)) {
    if (!reachesTarget(t)) continue;
    for (const f of closureOf(t, imports)) if (reachesTarget(f)) scope.add(f);
  }
  return scope;
}

function listSrcFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name)) out.push(rel);
    }
  };
  if (fs.existsSync(path.join(root, "src"))) walk("src");
  return out;
}

/** 저장소 트리를 읽어 게이트별 범위를 만든다. 테스트는 가짜 트리를 넘긴다. */
function mutationScopes({ root = process.cwd(), srcFiles, read, configs } = {}) {
  const files = srcFiles || listSrcFiles(root);
  const known = new Set(files);
  const readFile = read || ((f) => {
    try { return fs.readFileSync(path.join(root, f), "utf8"); } catch { return null; }
  });
  const cache = new Map();
  const imports = (f) => {
    if (!cache.has(f)) cache.set(f, importsOf(f, readFile, (p) => known.has(p)));
    return cache.get(f);
  };
  const scopes = {};
  for (const [area, cfg] of Object.entries(MUTATION_CONFIGS)) {
    const json = configs ? configs[cfg] : JSON.parse(readFile(cfg) || "{}");
    const targets = (json.mutate || []).filter((f) => !f.startsWith("!"));
    scopes[area] = { config: cfg, files: mutationScope(targets, files, imports) };
  }
  return scopes;
}

// ── 분류 ────────────────────────────────────────────────────────────────────

function classify(files, { scopes = mutationScopes(), exists = (f) => fs.existsSync(f) } = {}) {
  const on = Object.fromEntries(AREAS.map((a) => [a, false]));
  const mutationAreas = Object.keys(MUTATION_CONFIGS);
  // 넓게 켜되, 그 파일이 닿지 못하는 Gradle·뮤테이션은 뺀다.
  const broad = () => AREAS.forEach((a) => {
    if (a !== "native" && !mutationAreas.includes(a)) on[a] = true;
  });
  const allE2e = () => ["e2e", "explore", "nonfunctional", "apk"].forEach((a) => (on[a] = true));

  for (const f of files) {
    for (const area of mutationAreas) {
      const { config, files: scope } = scopes[area];
      if (f === config || scope.has(f)) on[area] = true;
      // 지워진 테스트는 무엇에 닿았는지 알 수 없다 — 변이를 죽이던 테스트일 수 있으니 켠다.
      else if (/^src\/.*\.test\.tsx?$/.test(f) && !exists(f)) on[area] = true;
    }
    if (f === "vitest.stryker.config.ts" || MUTATION_TOOLING.some((r) => r.test(f))) {
      mutationAreas.forEach((a) => (on[a] = true));
    }
    if (GLOBAL.some((r) => r.test(f))) { broad(); continue; }
    if (INERT.some((r) => r.test(f))) continue;
    // 테스트 파일은 스윕 대상이 아니다 — 화면·채점 경로를 바꾸지 않는다(scoring.test.ts 등).
    if (!isTest(f) && SWEEP.some((r) => r.test(f))) on.sweep = true;

    if (isTest(f)) { on.unit = true; continue; }
    if (/^stryker[^/]*\.json$/.test(f)) { on.unit = true; continue; }
    // 린트 규칙만 바꾼다 — 정적 게이트(lint·typecheck·유닛)로 충분하다.
    if (/^eslint\.config\.[cm]?js$/.test(f)) { on.unit = true; continue; }
    if (/^www\/(data|images)\//.test(f) || /^scripts\//.test(f)) { on.data = true; continue; }
    if (/^e2e\//.test(f)) {
      if (/^e2e\/react-[^/]*\.spec\.ts$/.test(f)) on.e2e = true;
      else if (/^e2e\/explore-[^/]*\.spec\.ts$/.test(f)) on.explore = true;
      else if (/^e2e\/nonfunctional\.spec\.ts$/.test(f)) on.nonfunctional = true;
      else if (/^e2e\/apk-[^/]*\.spec\.ts$/.test(f)) on.apk = true;
      // helpers.ts·fixtures.ts 등 공용 파일 — 모든 프로젝트가 import한다.
      else allE2e();
      continue;
    }
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
    // 워크플로·기타 루트 파일: 무엇을 건드렸는지 모르므로 넓게. 워크플로는 뮤테이션 잡 자체를
    // 고쳤을 수 있으니 뮤테이션도 켠다(Gradle은 CI의 android-build 잡이 매번 돈다).
    broad();
    if (/^\.github\/workflows\//.test(f)) mutationAreas.forEach((a) => (on[a] = true));
  }
  return on;
}

function changedFiles(base, { cwd } = {}) {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8", cwd }).trim();
  if (!base || /^0+$/.test(base)) return null;
  try {
    git("rev-parse", "--verify", `${base}^{commit}`);
  } catch {
    return null;
  }
  // --no-renames: 이름 바꾸기를 삭제+추가로 본다. 기본(rename 감지)은 새 경로만 내놓아,
  // www/data/x.json을 DATA/로 옮기면 출처(data 영역)가 목록에서 사라진다.
  const committed = git("diff", "--name-only", "--no-renames", `${base}...HEAD`);
  // 로컬: 커밋 안 한 변경도 포함한다(CI에서는 비어 있다).
  const working = git("diff", "--name-only", "--no-renames", "HEAD");
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

module.exports = { AREAS, SWEEP_SPECS, classify, changedFiles, mutationScopes, importsOf, main };

if (require.main === module) {
  const { areas } = main(process.argv.slice(2));
  if (!process.argv.includes("--github-output")) console.log(JSON.stringify(areas));
}
