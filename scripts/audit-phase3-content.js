const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataRoot = path.join(root, "www", "data");

const targetQuestions = {
  "istqb/sample-a.json": [20, 38],
  "istqb/sample-b.json": [18, 20, 21, 22, 23, 28, 30, 34],
  "istqb/sample-c.json": [29, 31],
  "istqb/sample-d.json": [4, 22, 38],
  "csts/csts-2402-fl.json": [4, 23, 24, 26, 27, 30, 56],
  "csts/csts-2403-fl.json": [2, 6, 11, 17, 20, 27, 28, 31, 56, 60, 63, 68],
  "csts/csts-2404-fl.json": [3, 4, 10, 11, 12, 13, 22, 25, 27, 29, 30, 40, 62, 69],
  "csts/csts-2405-fl.json": [3, 9, 15, 25, 28, 30, 33, 38, 42, 43, 55, 63, 65, 67, 68, 69],
  "csts/csts-2018-general.json": [2, 5, 7, 9, 10, 12, 17, 18, 19, 20],
  "csts/csts-2019-general.json": [4, 15, 32, 36, 68],
  "csts/csts-example-answer-included.json": [7, 13, 18, 22, 28, 31, 32, 57, 62, 63, 67],
};

const imageRequired = new Set([
  "CSTS-FL-2402:27",
  "CSTS-FL-2403:11",
  "CSTS-FL-2403:60",
  "CSTS-FL-2405:30",
  "CSTS-EL-SW-EXAMPLE:7",
]);

const codeRequired = new Set([
  "CSTS-FL-2403:27",
  "CSTS-FL-2403:56",
  "CSTS-FL-2405:25",
  "CSTS-EL-SW-EXAMPLE:22",
  "CSTS-EL-SW-EXAMPLE:28",
]);

const tableOrImageRequired = new Set([
  "ISTQB-FL-V4-B:22",
  "ISTQB-FL-V4-B:31",
  "ISTQB-FL-V4-C:31",
  "ISTQB-FL-V4-D:22",
  "ISTQB-FL-V4-D:23",
]);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(dataRoot, relativePath), "utf8"));
}

function allBlocks(question) {
  return [...(question.stem || []), ...(question.explanation || [])];
}

function blockText(block) {
  if (!block || typeof block !== "object") return "";
  if (typeof block.text === "string") return block.text;
  if (Array.isArray(block.lines)) return block.lines.join(" ");
  if (Array.isArray(block.items)) {
    return block.items.map((item) => (typeof item === "string" ? item : item.text || "")).join(" ");
  }
  return "";
}

const errors = [];
let checked = 0;

for (const [relativePath, numbers] of Object.entries(targetQuestions)) {
  const payload = readJson(relativePath);
  const setId = payload.meta.id;
  for (const number of numbers) {
    checked += 1;
    const question = payload.questions.find((item) => item.number === number);
    const key = `${setId}:${number}`;
    if (!question) {
      errors.push(`${key}: missing question`);
      continue;
    }

    const blocks = allBlocks(question);
    const text = JSON.stringify(question);
    if (/__IMAGE__|CSTS\s*시험\s*예제\s*\(일반\)|한국정보통신기술협회\(TTA\)/.test(text)) {
      errors.push(`${key}: noisy source text remains`);
    }
    if (blocks.some((block) => /[\r\n]/.test(block.text || ""))) {
      errors.push(`${key}: manual newline remains in text block`);
    }
    if (imageRequired.has(key)) {
      const hasImage = Boolean(question.figure) || blocks.some((block) => block.type === "image");
      if (!hasImage) errors.push(`${key}: expected image block or figure`);
    }
    if (codeRequired.has(key) && !blocks.some((block) => block.type === "code")) {
      errors.push(`${key}: expected code block`);
    }
    if (tableOrImageRequired.has(key)) {
      const hasVisualBlock = blocks.some((block) => ["image", "table", "formula"].includes(block.type));
      if (!hasVisualBlock) errors.push(`${key}: expected visual/formula block`);
    }
    if (blocks.length === 1 && blockText(blocks[0]).length > 220) {
      errors.push(`${key}: long issue question is still a single dense block`);
    }
  }
}

if (errors.length) {
  throw new Error(errors.join("\n"));
}

console.log(`Audited ${checked} Phase3 content targets.`);
