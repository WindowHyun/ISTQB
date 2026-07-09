#!/usr/bin/env node
/**
 * tag-questions.js — 문항 챕터(대단원) 자동 태깅 (Phase 0: 약점 분석 토대)
 *
 * 동작:
 *   1) www/data/taxonomy.json 의 자격증별 chapter + keywords 표를 읽는다.
 *   2) 각 문항의 stem + explanation 텍스트에서 챕터별 키워드 히트를 세어 점수화한다.
 *   3) 최고 점수 챕터의 점수가 임계값 이상이고 2등과 차이가 충분하면 그 챕터로 태깅한다.
 *      (애매하면 태깅하지 않고 리뷰 대상으로 남긴다 — 틀린 태그를 넣지 않는다.)
 *   4) scripts/chapter-overrides.json 이 있으면 { "문항ID": "챕터명" } 로 자동 추론을 덮어쓴다(수동 검수).
 *   5) 각 문항에 chapter(문자열 또는 null) 필드를 기록하고, 커버리지 리포트를 출력한다.
 *
 * 멱등: 다시 실행해도 같은 입력이면 같은 결과. --dry 로 파일을 쓰지 않고 리포트만 볼 수 있다.
 *
 * 정본은 www/data — sync-assets 가 public/dist 로 복제하므로 여기만 수정한다.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataRoot = path.join(root, "www", "data");
const DRY = process.argv.includes("--dry");

// 자동 추론 임계값: 최고 점수 챕터가 MIN_SCORE 이상이고, 2등과 MARGIN 이상 벌어져야 확정.
// MIN_SCORE=1·MARGIN=1 → "경쟁 챕터 없이 유일하게 맞는 키워드가 하나라도 있으면" 태깅하고,
// 두 챕터가 동점(애매)이면 태깅하지 않는다. 자동 태깅은 리뷰용 드래프트이며 오버라이드로 보정한다.
const MIN_SCORE = 1;
const MARGIN = 1;

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// stem/explanation 블록에서 평문 텍스트를 뽑는다(문자열 또는 ContentBlock[] 모두 지원).
function blockText(block) {
  if (typeof block === "string") return block;
  if (!block || typeof block !== "object") return "";
  if (typeof block.text === "string") return block.text;
  if (Array.isArray(block.lines)) return block.lines.join(" ");
  if (Array.isArray(block.items)) {
    return block.items
      .map((it) => (typeof it === "string" ? it : `${it.marker || ""} ${it.text || ""}`))
      .join(" ");
  }
  return "";
}

function questionText(q) {
  const stem = Array.isArray(q.stem) ? q.stem : [q.stem];
  const expl = Array.isArray(q.explanation) ? q.explanation : [q.explanation];
  const opts = (q.options || []).map((o) => o.text || "");
  return [...stem, ...expl, ...opts].map(blockText).join(" ");
}

// 챕터별 키워드 히트 점수. 서로 다른 키워드가 맞을 때마다 +1(같은 키워드 중복은 1회만).
function scoreChapters(text, chapters) {
  return chapters.map((ch) => {
    let score = 0;
    for (const kw of ch.keywords) {
      if (text.includes(kw)) score += 1;
    }
    return { name: ch.name, score };
  });
}

function inferChapter(text, chapters) {
  const scored = scoreChapters(text, chapters).sort((a, b) => b.score - a.score);
  const top = scored[0];
  const second = scored[1] || { score: 0 };
  if (top.score >= MIN_SCORE && top.score - second.score >= MARGIN) {
    return top.name;
  }
  return null; // 애매 — 리뷰 대상
}

function main() {
  const taxonomy = readJson(path.join(dataRoot, "taxonomy.json"));
  const index = readJson(path.join(dataRoot, "index.json"));
  const overridePath = path.join(__dirname, "chapter-overrides.json");
  const overrides = fs.existsSync(overridePath) ? readJson(overridePath) : {};

  const totals = { total: 0, tagged: 0, inferred: 0, overridden: 0, review: 0 };
  const perCert = {};

  for (const set of index.sets) {
    const cert = set.certification;
    const certTax = taxonomy.certifications[cert];
    if (!certTax) {
      console.warn(`⚠️  taxonomy에 ${cert} 정의 없음 — 세트 ${set.id} 건너뜀`);
      continue;
    }
    const chapters = certTax.chapters;
    const filePath = path.join(dataRoot, set.path.replace(/^\.\//, ""));
    const doc = readJson(filePath);
    const cell = (perCert[cert] ||= { total: 0, tagged: 0, review: 0, byChapter: {} });

    for (const q of doc.questions) {
      totals.total += 1;
      cell.total += 1;
      const override = overrides[q.id];
      let chapter;
      if (override) {
        chapter = override;
        totals.overridden += 1;
      } else {
        chapter = inferChapter(questionText(q), chapters);
        if (chapter) totals.inferred += 1;
      }
      q.chapter = chapter || null;
      if (chapter) {
        totals.tagged += 1;
        cell.tagged += 1;
        cell.byChapter[chapter] = (cell.byChapter[chapter] || 0) + 1;
      } else {
        totals.review += 1;
        cell.review += 1;
      }
    }

    if (!DRY) {
      fs.writeFileSync(filePath, JSON.stringify(doc, null, 2) + "\n", "utf8");
    }
  }

  // ── 리포트 ────────────────────────────────────────────────
  console.log(`\n=== 챕터 태깅 ${DRY ? "(dry-run — 미저장)" : "완료"} ===`);
  console.log(`총 ${totals.total}문항 · 태깅 ${totals.tagged} · 리뷰 필요 ${totals.review}`);
  console.log(`  (자동 추론 ${totals.inferred} · 수동 오버라이드 ${totals.overridden})`);
  const pct = totals.total ? Math.round((totals.tagged / totals.total) * 100) : 0;
  console.log(`  커버리지: ${pct}%`);

  for (const [cert, cell] of Object.entries(perCert)) {
    console.log(`\n[${cert}] ${cell.tagged}/${cell.total} 태깅 · 리뷰 ${cell.review}`);
    for (const [ch, n] of Object.entries(cell.byChapter).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${ch}: ${n}`);
    }
  }
  console.log(
    `\n리뷰 필요 문항은 chapter:null 로 남습니다. scripts/chapter-overrides.json 에 { "문항ID": "챕터명" } 을 추가해 보정하세요.`,
  );
}

main();
