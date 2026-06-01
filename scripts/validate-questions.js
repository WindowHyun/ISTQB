const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataRoot = path.join(root, "www", "data");
const publicDataRoot = path.join(root, "public", "data");
const allowedBlockTypes = new Set([
  "paragraph",
  "note",
  "prompt",
  "list",
  "table",
  "code",
  "formula",
  "image",
]);

function fail(message) {
  throw new Error(message);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Invalid JSON: ${path.relative(root, filePath)} (${error.message})`);
  }
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing ${label}: ${path.relative(root, filePath)}`);
  }
}

function textOfBlock(block) {
  if (!block || typeof block !== "object") return "";
  if (typeof block.text === "string") return block.text;
  if (Array.isArray(block.lines)) return block.lines.join(" ");
  if (Array.isArray(block.items)) {
    return block.items
      .map((item) => (typeof item === "string" ? item : item.text || ""))
      .join(" ");
  }
  return "";
}

function validateBlocks(blocks, label, errors) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    errors.push(`${label}: missing blocks`);
    return;
  }
  blocks.forEach((block, index) => {
    const blockLabel = `${label}[${index}]`;
    if (!block || typeof block !== "object") {
      errors.push(`${blockLabel}: block must be an object`);
      return;
    }
    if (!allowedBlockTypes.has(block.type)) {
      errors.push(`${blockLabel}: unsupported block type "${block.type}"`);
    }
    const text = textOfBlock(block);
    if (["paragraph", "note", "prompt", "formula"].includes(block.type)) {
      if (!String(block.text || "").trim()) {
        errors.push(`${blockLabel}: text is empty`);
      }
      if (/[\r\n]/.test(block.text || "")) {
        errors.push(`${blockLabel}: manual newline in text`);
      }
    }
    if (block.type === "code") {
      if (!Array.isArray(block.lines) || block.lines.length === 0) {
        errors.push(`${blockLabel}: code lines are empty`);
      }
    }
    if (block.type === "list") {
      if (!Array.isArray(block.items) || block.items.length === 0) {
        errors.push(`${blockLabel}: list items are empty`);
      }
    }
    if (block.type === "table") {
      if (!Array.isArray(block.rows) || block.rows.length === 0) {
        errors.push(`${blockLabel}: table rows are empty`);
      }
    }
    if (!text.trim() && !["table", "image"].includes(block.type)) {
      errors.push(`${blockLabel}: block content is empty`);
    }
  });
}

function validateDataRoot(baseDir, label) {
  const indexPath = path.join(baseDir, "index.json");
  assertFile(indexPath, `${label} index.json`);
  const index = readJson(indexPath);
  const errors = [];
  const questionIds = new Set();
  const setIds = new Set();
  let total = 0;

  if (!Array.isArray(index.sets) || index.sets.length === 0) {
    errors.push(`${label}: index.sets is empty`);
  }

  for (const item of index.sets || []) {
    if (!item.id) errors.push(`${label}: catalog item missing id`);
    if (!item.certification) errors.push(`${item.id}: missing certification`);
    if (!item.title) errors.push(`${item.id}: missing title`);
    if (!item.path) errors.push(`${item.id}: missing path`);
    if (setIds.has(item.id)) errors.push(`${item.id}: duplicate set id`);
    setIds.add(item.id);

    const setPath = path.join(baseDir, item.path.replace(/^\.\//, ""));
    assertFile(setPath, `${item.id} set file`);
    const payload = readJson(setPath);
    const meta = payload.meta || {};
    if (meta.id !== item.id) {
      errors.push(`${item.id}: meta.id does not match index id`);
    }
    if (!Array.isArray(payload.questions) || payload.questions.length === 0) {
      errors.push(`${item.id}: questions are empty`);
      continue;
    }

    const numbers = new Set();
    for (const question of payload.questions) {
      total += 1;
      const qLabel = `${item.id}-${question.number}`;
      if (!question.id) errors.push(`${qLabel}: missing id`);
      if (question.id && !question.id.startsWith(`${item.id}-`)) {
        errors.push(`${qLabel}: id must start with set id`);
      }
      if (questionIds.has(question.id)) errors.push(`${question.id}: duplicate question id`);
      questionIds.add(question.id);
      if (!Number.isInteger(question.number)) errors.push(`${qLabel}: invalid number`);
      if (numbers.has(question.number)) errors.push(`${qLabel}: duplicate number`);
      numbers.add(question.number);
      validateBlocks(question.stem, `${qLabel}.stem`, errors);
      validateBlocks(question.explanation, `${qLabel}.explanation`, errors);

      const type = question.type || "multiple_choice";
      if (!Array.isArray(question.answer) || question.answer.length === 0) {
        errors.push(`${qLabel}: missing answer`);
      }
      if (type === "multiple_choice") {
        if (!Array.isArray(question.options) || question.options.length === 0) {
          errors.push(`${qLabel}: multiple_choice options are empty`);
        }
        const optionKeys = new Set();
        for (const option of question.options || []) {
          if (!option.key) errors.push(`${qLabel}: option missing key`);
          if (optionKeys.has(option.key)) errors.push(`${qLabel}: duplicate option key ${option.key}`);
          optionKeys.add(option.key);
          if (!String(option.text || "").trim()) errors.push(`${qLabel}: option ${option.key} text is empty`);
          if (/[\r\n]/.test(option.text || "")) errors.push(`${qLabel}: option ${option.key} has manual newline`);
        }
        for (const answer of question.answer || []) {
          if (!optionKeys.has(answer)) errors.push(`${qLabel}: answer ${answer} is not in options`);
        }
      }
      if (question.figure) {
        const figurePath = path.join(root, "www", question.figure);
        if (!fs.existsSync(figurePath)) errors.push(`${qLabel}: missing figure ${question.figure}`);
      }
    }
  }

  if (errors.length > 0) fail(errors.join("\n"));
  return { sets: setIds.size, questions: total };
}

const wwwResult = validateDataRoot(dataRoot, "www/data");
const publicResult = validateDataRoot(publicDataRoot, "public/data");

if (
  wwwResult.sets !== publicResult.sets ||
  wwwResult.questions !== publicResult.questions
) {
  fail("public/data and www/data question counts do not match");
}

console.log(
  `Validated ${wwwResult.questions} questions across ${wwwResult.sets} sets.`,
);
