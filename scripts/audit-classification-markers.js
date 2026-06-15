const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataRoot = path.join(root, "www", "data");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function blockText(block) {
  if (!block || typeof block !== "object") return "";
  if (typeof block.text === "string") return block.text;
  if (Array.isArray(block.lines)) return block.lines.join(" ");
  if (Array.isArray(block.items)) {
    return block.items
      .map((item) => (typeof item === "string" ? item : `${item.marker || ""} ${item.text || ""}`))
      .join(" ");
  }
  return "";
}

function questionText(question) {
  return [...(question.stem || []), ...(question.explanation || [])]
    .map(blockText)
    .join(" ");
}

function hasKoreanMarkerOption(question) {
  return (question.options || []).some((option) => /\([가-바]\)/.test(option.text || ""));
}

function structuredMarkerCount(question) {
  let count = 0;
  for (const block of question.stem || []) {
    if (block.type === "list" && Array.isArray(block.items)) {
      count += block.items.filter((item) => {
        const marker = item && typeof item === "object" ? String(item.marker || "").trim() : "";
        return /^(\([가-바]\)|[가-차]\.)$/.test(marker);
      }).length;
    }
    if (block.type === "table" && Array.isArray(block.rows)) {
      count += block.rows.flat().filter((cell) => /^(\([가-바]\)|[가-차]\.)$/.test(String(cell || "").trim())).length;
    }
  }
  return count;
}

function rawMarkerCount(question) {
  return (questionText(question).match(/\([가-바]\)/g) || []).length;
}

const index = readJson(path.join(dataRoot, "index.json"));
const issues = [];

for (const item of index.sets || []) {
  const setPath = path.join(dataRoot, item.path.replace(/^\.\//, ""));
  const payload = readJson(setPath);
  for (const question of payload.questions || []) {
    if (!hasKoreanMarkerOption(question)) continue;
    const structured = structuredMarkerCount(question);
    const raw = rawMarkerCount(question);
    const hasImage = (question.stem || []).some((block) => block.type === "image") || Boolean(question.figure);
    const isTwoBlankFill = raw === 2 && questionText(question).includes("(가)") && questionText(question).includes("(나)");
    if (structured < 2 && !hasImage && !isTwoBlankFill) {
      issues.push({
        setId: payload.meta.id,
        number: question.number,
        id: question.id,
        structured,
        raw,
        stem: questionText(question).slice(0, 220),
        options: (question.options || []).map((option) => `${option.key}: ${option.text}`).join(" | "),
      });
    }
  }
}

if (issues.length) {
  console.error(JSON.stringify(issues, null, 2));
  throw new Error(`Found ${issues.length} questions with unstructured Korean classification markers.`);
}

console.log("Audited Korean classification markers.");
