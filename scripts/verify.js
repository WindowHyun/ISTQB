const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "www", "index.html");
const dataPath = path.join(root, "www", "questions.json");
const dataScriptPath = path.join(root, "www", "questions.js");
const html = fs.readFileSync(htmlPath, "utf8");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

function fail(message) {
  throw new Error(message);
}

function assertFile(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) fail(`Missing file: ${relativePath}`);
}

function stripVisiblePdfNoise(value) {
  return String(value || "")
    .replace(/Korean Software Testing Qualifications Board[^\n]*/gi, "")
    .replace(/www\.kstqb\.org\s+I\s+info@kstqb\.org(?:\s+\d+\s+of\s+\d+)?/gi, "")
    .replace(/www\.kstqb\.org\s*/gi, "")
    .replace(/info@kstqb\.org\s*/gi, "")
    .replace(/\b\d+\s+of\s+\d+\b/gi, "");
}

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
scripts.forEach((script, index) => {
  try {
    new Function(script);
  } catch (error) {
    fail(`Script ${index + 1} has a syntax error: ${error.message}`);
  }
});
new Function(fs.readFileSync(dataScriptPath, "utf8"));

const expectedSets = new Map([
  ["A", 40],
  ["B", 40],
  ["C", 40],
  ["D", 40],
  ["EXTRA", 26],
]);

if (data.sets.length !== expectedSets.size) {
  fail(`Expected ${expectedSets.size} sets, found ${data.sets.length}`);
}

let total = 0;
const errors = [];
data.sets.forEach((set) => {
  const expectedCount = expectedSets.get(set.id);
  if (expectedCount === undefined) errors.push(`Unexpected set id: ${set.id}`);
  if (set.questions.length !== expectedCount) {
    errors.push(`${set.id} should have ${expectedCount} questions, found ${set.questions.length}`);
  }
  total += set.questions.length;

  set.questions.forEach((question) => {
    const label = `${set.id}-${question.number}`;
    if (!String(question.stem || "").trim()) errors.push(`${label}: missing stem`);
    if (!Array.isArray(question.options) || question.options.length < 4) errors.push(`${label}: missing options`);
    if (!Array.isArray(question.answer) || question.answer.length === 0) errors.push(`${label}: missing answer`);
    if (!String(question.explanation || "").trim()) errors.push(`${label}: missing explanation`);
    const visibleQuestionText = stripVisiblePdfNoise([
      question.stem,
      ...question.options.map((option) => option.text),
      question.explanation,
    ].join("\n"));
    if (/kstqb|info@kstqb|Korean Software Testing Qualifications Board/i.test(visibleQuestionText)) {
      errors.push(`${label}: visible PDF footer text remains`);
    }
  });
});

if (total !== 186) fail(`Expected 186 questions, found ${total}`);
if (errors.length > 0) fail(errors.join("\n"));

["A23", "B23", "C23", "C24", "C31", "C32"].forEach((name) => {
  assertFile(path.join("www", "figures", `${name}.png`));
});

console.log(`Verified ${total} questions across ${data.sets.length} sets.`);
