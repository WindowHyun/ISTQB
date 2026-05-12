const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "www", "questions.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const splitTerms = [
  "기 능",
  "테스트 하기",
  "테스팅 하기",
  "추 정",
  "요 구사항",
  "요구사 항",
  "애플리케 이션",
  "케이 스",
  "테스트 케 이스",
  "프 로젝트",
  "프로 젝트",
  "프로 세스",
  "소프트 웨어",
  "소 프트웨어",
  "컴 포넌트",
  "비 즈니스",
  "시 스템",
  "리 그레션",
  "테 스트",
  "테스 트",
  "테 스팅",
  "테스 팅",
  "동 등분할",
  "경 계값",
  "커 버리지",
  "인 수 조건",
  "사용 자",
  "개 발자",
  "관리 자",
  "참 조",
  "결 함",
  "장 애",
  "입 력",
  "출 력",
  "실 패",
  "합 격",
  "문 제",
  "다 음",
  "가 장",
  "적 절",
  "정 답",
  "오 답",
  "설 명",
  "분 류",
  "유 형",
  "위 험",
  "리 스크",
];

const suspiciousRegexes = [
  { name: "replacement_char", pattern: /\uFFFD/ },
  { name: "mojibake", pattern: /(?:Ã|Â|â€|ì|í|ê|ë)[A-Za-z0-9¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿]/ },
  { name: "pdf_private_bullet", pattern: /[\uF06C\uF0A1\uF0A7\uF0B7]/ },
  { name: "double_space", pattern: / {2,}/ },
  { name: "space_before_josa", pattern: /[가-힣]\s+(은|는|이|가|을|를|에|의|와|과|로|으로|도|만|부터|까지|보다|처럼|에게|에서)\b/ },
  { name: "split_question_ending", pattern: /(하|되|있|없|맞|틀|높|낮|많|작|크|좋|나쁘)\s+(는가|은가|인가|것은|것인가|수는|수인가)/ },
];

function fieldsFor(question) {
  const fields = [
    ["stem", question.stem || ""],
    ["explanation", question.explanation || ""],
  ];
  question.options.forEach((option) =>
    fields.push([`option.${option.key}`, option.text || ""]),
  );
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
      suspiciousRegexes.forEach(({ name, pattern }) => {
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
      });
      splitTerms.forEach((term) => {
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
      });
    }
  }
}

const grouped = new Map();
findings.forEach((finding) => {
  const key = `${finding.set}-${finding.number}-${finding.field}`;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(finding);
});

const report = [
  "# Question Text Audit",
  "",
  `Total findings: ${findings.length}`,
  `Affected fields: ${grouped.size}`,
  "",
];

for (const [key, items] of grouped) {
  report.push(`## ${key}`);
  items.slice(0, 12).forEach((item) => {
    report.push(
      `- ${item.type}${item.term ? ` (${item.term})` : ""}: ${item.excerpt}`,
    );
  });
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
fs.writeFileSync(path.join(outDir, "question-text-audit.md"), report.join("\n"), "utf8");
console.log(`findings=${findings.length}`);
console.log(`affected_fields=${grouped.size}`);
console.log(path.join(outDir, "question-text-audit.md"));
