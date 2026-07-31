#!/usr/bin/env node
/**
 * 세트 간 재수록 문항 그룹 표를 www/data/index.json에 생성한다.
 *
 * 왜 필요한가: 같은 문제가 여러 세트에 실려 있는데(기출 재출제) id는 세트마다 다르다.
 * id 기준으로는 걸러낼 수 없어, 2404를 풀고 2405를 풀면 같은 문제가 챕터 통계 분모에
 * 두 번 들어간다. 앱이 "이 둘은 같은 문제"임을 알려면 표가 필요하다.
 *
 * 왜 빌드 타임인가: 런타임에 만들려면 통계 화면을 열 때마다 제품의 전 세트를 내려받아
 * 지문을 정규화해야 한다. 표는 46그룹뿐이라 index.json에 실어 두면 조회만으로 끝난다.
 *
 * 왜 별도 JSON 파일이 아닌가: validate-questions.js가 www/data/istqb·csts 하위의
 * .json을 전부 문항 세트로 검증한다. 새 파일을 두면 그 검증이 깨진다. index.json은
 * www/data 루트라 스캔 대상이 아니다.
 *
 * 사용:
 *   node scripts/build-duplicate-groups.js          # 생성(정본 수정)
 *   node scripts/build-duplicate-groups.js --check  # 정본이 최신인지 검사(CI)
 *
 * --check를 verify에 걸어 둔다 — 문항을 고치고 표를 다시 만들지 않으면 표가 조용히
 * 낡는다. 낡은 표는 "중복인데 중복이 아니라고 말하는" 상태라 통계가 다시 틀어진다.
 */
const fs = require("fs");
const path = require("path");
const { stemKeyOf, answerTextKeyOf } = require("./lib/stemKey.cjs");

const dataRoot = path.join(__dirname, "..", "www", "data");
const indexPath = path.join(dataRoot, "index.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * 재수록 그룹 목록. 각 그룹은 문항 id 배열이며, 그룹·그룹 내 모두 정렬해
 * 같은 입력이면 항상 같은 출력이 나오게 한다(--check가 순서 차이로 오탐하지 않도록).
 *
 * 두 동일성 키의 합집합으로 묶는다(어느 한쪽으로만 같아도 같은 문제):
 *   - stemKeyOf        지문 + 정답 키(a/b/c) + 보기 수 — 보기 본문이 손질된 재수록을 잡는다.
 *   - answerTextKeyOf  지문 + 정답 '본문' + 보기 수 — 보기 순서를 섞은 재수록을 잡는다.
 * 한쪽만으로는 각각 1그룹·4그룹을 놓친다(근거는 lib/stemKey.cjs 주석).
 * 합집합이므로 연쇄 병합이 가능해, 아래에서 3개 이상 묶인 그룹을 함께 보고한다.
 */
function buildGroups(index) {
  const rows = [];
  for (const set of index.sets) {
    const payload = readJson(path.join(dataRoot, set.path.replace(/^\.\//, "")));
    for (const q of payload.questions || []) {
      if (q.id) rows.push({ id: q.id, setId: set.id, q });
    }
  }

  // union-find — 두 키가 만드는 연결을 모두 합친다.
  const parent = new Map(rows.map((r) => [r.id, r.id]));
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const keyOf of [stemKeyOf, answerTextKeyOf]) {
    const byKey = new Map();
    for (const r of rows) {
      const key = keyOf(r.q);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(r.id);
    }
    for (const ids of byKey.values()) {
      for (let i = 1; i < ids.length; i += 1) union(ids[0], ids[i]);
    }
  }

  const setOf = new Map(rows.map((r) => [r.id, r.setId]));
  const byRoot = new Map();
  for (const r of rows) {
    const root = find(r.id);
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root).push(r.id);
  }

  const groups = [];
  for (const members of byRoot.values()) {
    if (members.length < 2) continue;
    // 같은 세트 안의 중복은 대상이 아니다 — 문항 id가 이미 다르므로 별개 문항으로 다룬다.
    // (현 데이터에는 0건이지만, 생기더라도 세트 내 문항 수를 임의로 줄이지 않는다.)
    if (new Set(members.map((id) => setOf.get(id))).size < 2) continue;
    groups.push([...members].sort());
  }
  groups.sort((a, b) => a[0].localeCompare(b[0]));
  return groups;
}

const index = readJson(indexPath);
const groups = buildGroups(index);

/**
 * 재수록 그룹의 대표 챕터 — 같은 문제가 세트마다 다른 챕터로 태깅된 경우가 있다(현재 3건).
 * 집계에서 "마지막에 푼 회차의 챕터가 이긴다"로 두면 사용자의 풀이 순서에 따라 통계가
 * 달라진다. 원본 데이터는 건드리지 않고, 그룹 대표(첫 id)의 챕터로 결정론적으로 통일한다.
 * 챕터가 갈리지 않는 그룹은 넣지 않는다 — 표만 커지고 얻는 게 없다.
 */
function buildChapters(index, groups) {
  const chapterOf = new Map();
  for (const set of index.sets) {
    const file = path.join(dataRoot, set.path.replace(/^\.\//, ""));
    for (const q of readJson(file).questions || []) {
      if (q.id) chapterOf.set(q.id, q.chapter ?? null);
    }
  }
  const out = {};
  for (const g of groups) {
    const chs = [...new Set(g.map((id) => chapterOf.get(id)))];
    if (chs.length < 2) continue;               // 갈리지 않으면 기록할 것이 없다
    const canonical = chapterOf.get(g[0]);
    if (canonical) out[g[0]] = canonical;
  }
  return out;
}

/**
 * 세트별 문항 수 — 사이드바 드롭다운의 "70문항" 라벨용.
 *
 * 왜 매니페스트에 넣는가: 종전에는 이 숫자 하나를 얻자고 useSetCounts가 제품의 전 세트
 * JSON을 내려받아 파싱했다(CSTS 7파일 526KB). 자격증을 고르는 순간 벌어지는 일이라,
 * 세트 하나만 필요한 연습·시험 모드에서도 그 비용을 전부 치른다. 실측(Safari/WebKit)에서
 * 이 구간 동안 메인 스레드가 붙들려 문항 화면 프레임이 400ms당 2까지 떨어졌다.
 * 길이는 파생 값이라 빌드 타임에 정확히 계산할 수 있고, --check가 낡음을 막는다.
 */
function buildCounts(index) {
  const out = {};
  for (const set of index.sets) {
    const file = path.join(dataRoot, set.path.replace(/^\.\//, ""));
    out[set.id] = (readJson(file).questions || []).length;
  }
  return out;
}

const chapters = buildChapters(index, groups);
const counts = buildCounts(index);
// sets 안에 questionCount로 실어 준다 — 세트 메타는 sets가 단일 원천이라 별도 맵을
// 두면 조회부가 두 곳을 보게 된다.
const setsWithCount = index.sets.map((s) => ({ ...s, questionCount: counts[s.id] }));
const check = process.argv.includes("--check");
const current = index.duplicateGroups;
const same = JSON.stringify(current) === JSON.stringify(groups)
  && JSON.stringify(index.duplicateChapters ?? {}) === JSON.stringify(chapters)
  && JSON.stringify(index.sets) === JSON.stringify(setsWithCount);

const questionCount = groups.reduce((n, g) => n + g.length, 0);

if (check) {
  if (same) {
    console.log(`[dup-groups] 최신 — ${groups.length}그룹 / ${questionCount}문항 · 챕터 통일 ${Object.keys(chapters).length}건 · 세트 문항수 ${Object.keys(counts).length}개`);
    process.exit(0);
  }
  console.error(
    "[dup-groups] index.json의 duplicateGroups가 문항 데이터와 어긋납니다.\n" +
      `  현재: ${(current || []).length}그룹  →  기대: ${groups.length}그룹\n` +
      "  `node scripts/build-duplicate-groups.js` 로 다시 생성한 뒤 커밋하세요.",
  );
  process.exit(1);
}

if (same) {
  console.log(`[dup-groups] 변경 없음 — ${groups.length}그룹 / ${questionCount}문항`);
  process.exit(0);
}

// sets 뒤에 오도록 키 순서를 유지해 diff가 읽기 쉽게 한다.
const next = { ...index, sets: setsWithCount, duplicateGroups: groups, duplicateChapters: chapters };
fs.writeFileSync(indexPath, `${JSON.stringify(next, null, 2)}\n`);
console.log(
  `[dup-groups] 생성 완료 — ${groups.length}그룹 / ${questionCount}문항 → ${path.relative(process.cwd(), indexPath)}`,
);
