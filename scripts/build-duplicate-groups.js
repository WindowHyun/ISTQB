#!/usr/bin/env node
/**
 * 세트 간 재수록 문항 그룹 표를 www/data/index.json에 생성한다.
 *
 * 왜 필요한가: 같은 문제가 여러 세트에 실려 있는데(기출 재출제) id는 세트마다 다르다.
 * id 기준으로는 걸러낼 수 없어, 2404를 풀고 2405를 풀면 같은 문제가 챕터 통계 분모에
 * 두 번 들어간다. 앱이 "이 둘은 같은 문제"임을 알려면 표가 필요하다.
 *
 * 왜 빌드 타임인가: 런타임에 만들려면 통계 화면을 열 때마다 제품의 전 세트를 내려받아
 * 지문을 정규화해야 한다. 표는 45그룹뿐이라 index.json에 실어 두면 조회만으로 끝난다.
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
const { stemKeyOf } = require("./lib/stemKey.cjs");

const dataRoot = path.join(__dirname, "..", "www", "data");
const indexPath = path.join(dataRoot, "index.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * 재수록 그룹 목록. 각 그룹은 문항 id 배열이며, 그룹·그룹 내 모두 정렬해
 * 같은 입력이면 항상 같은 출력이 나오게 한다(--check가 순서 차이로 오탐하지 않도록).
 */
function buildGroups(index) {
  const byKey = new Map();
  for (const set of index.sets) {
    const payload = readJson(path.join(dataRoot, set.path.replace(/^\.\//, "")));
    for (const q of payload.questions || []) {
      const key = stemKeyOf(q);
      if (!key || !q.id) continue;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push({ id: q.id, setId: set.id });
    }
  }

  const groups = [];
  for (const members of byKey.values()) {
    if (members.length < 2) continue;
    // 같은 세트 안의 중복은 대상이 아니다 — 문항 id가 이미 다르므로 별개 문항으로 다룬다.
    // (현 데이터에는 0건이지만, 생기더라도 세트 내 문항 수를 임의로 줄이지 않는다.)
    if (new Set(members.map((m) => m.setId)).size < 2) continue;
    groups.push(members.map((m) => m.id).sort());
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

const chapters = buildChapters(index, groups);
const check = process.argv.includes("--check");
const current = index.duplicateGroups;
const same = JSON.stringify(current) === JSON.stringify(groups)
  && JSON.stringify(index.duplicateChapters ?? {}) === JSON.stringify(chapters);

const questionCount = groups.reduce((n, g) => n + g.length, 0);

if (check) {
  if (same) {
    console.log(`[dup-groups] 최신 — ${groups.length}그룹 / ${questionCount}문항 · 챕터 통일 ${Object.keys(chapters).length}건`);
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
const next = { ...index, duplicateGroups: groups, duplicateChapters: chapters };
fs.writeFileSync(indexPath, `${JSON.stringify(next, null, 2)}\n`);
console.log(
  `[dup-groups] 생성 완료 — ${groups.length}그룹 / ${questionCount}문항 → ${path.relative(process.cwd(), indexPath)}`,
);
