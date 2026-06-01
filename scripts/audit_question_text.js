const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "www", "questions.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const knownSplitTerms = [
  "반복주기 가",
  "식별되 지",
  "생성되 며",
  "사용되 지",
  "참조하 지",
  "설명하 지",
  "작동하 지",
  "발견하 지",
  "되므 로",
  "컴포 넌트",
  "커버리 지",
  "비즈 니스",
  "소프트웨 어",
  "프로세 스",
  "데이 터",
  "요구사 항",
  "수 준",
  "영 향",
  "조 직",
  "구 조",
  "분 석",
  "관 점",
  "진 행",
  "배 포",
  "별 도로",
  "그 룹화",
  "논 의",
  "모 두",
  "형 태",
  "검 사",
  "초 안",
  "기 존",
];

const suspiciousRegexes = [
  { name: "replacement_char", pattern: /\uFFFD/ },
  { name: "pdf_private_bullet", pattern: /[\uF06C\uF0A1\uF0A7\uF0B7]/ },
  { name: "double_space", pattern: / {2,}/ },
  {
    name: "split_sentence_ending",
    pattern: /(되|하|않|없|있|찾|쓰|보|받|주|늘어나|나타나|제공|검증|수행|작성|커버)\s+(고|며|지|는|도록|므로|합니다|됩니다|않습니다)(?=[^가-힣]|$)/,
  },
];

function fieldsFor(question) {
  const fields = [
    ["stem", question.stem || ""],
    ["explanation", question.explanation || ""],
  ];
  (question.options || []).forEach((option) => {
    fields.push([`option.${option.key}`, option.text || ""]);
  });
  return fields;
}

function excerpt(text, index, size = 42) {
  return text
    .slice(Math.max(0, index - size), Math.min(text.length, index + size))
    .replace(/\n/g, "\\n");
}

const findings = [];
for (const set of data.sets) {
  for (const question of set.questions) {
    for (const [field, text] of fieldsFor(question)) {
      for (const { name, pattern } of suspiciousRegexes) {
        const match = pattern.exec(text);
        if (match) {
          findings.push({
            set: set.id,
            number: question.number,
            field,
            type: name,
            excerpt: excerpt(text, match.index),
          });
        }
      }
      for (const term of knownSplitTerms) {
        const index = text.indexOf(term);
        if (index >= 0) {
          findings.push({
            set: set.id,
            number: question.number,
            field,
            type: "known_split_word",
            term,
            excerpt: excerpt(text, index),
          });
        }
      }
    }
  }
}

const grouped = new Map();
for (const finding of findings) {
  const key = `${finding.set}-${finding.number}-${finding.field}`;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(finding);
}

const report = [
  "# Question Text Audit",
  "",
  `Total findings: ${findings.length}`,
  `Affected fields: ${grouped.size}`,
  "",
];

for (const [key, items] of grouped) {
  report.push(`## ${key}`);
  for (const item of items.slice(0, 12)) {
    report.push(
      `- ${item.type}${item.term ? ` (${item.term})` : ""}: ${item.excerpt}`,
    );
  }
  if (items.length > 12) report.push(`- ... ${items.length - 12} more`);
  report.push("");
}

const outDir = path.join(root, "tmp");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "question-text-audit.json"),
  JSON.stringify(findings, null, 2),
  "utf8",
);
fs.writeFileSync(
  path.join(outDir, "question-text-audit.md"),
  report.join("\n"),
  "utf8",
);
console.log(`findings=${findings.length}`);
console.log(`affected_fields=${grouped.size}`);
console.log(path.join(outDir, "question-text-audit.md"));
