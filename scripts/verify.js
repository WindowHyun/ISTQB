const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function syntaxCheck(relativePath) {
  run("node", ["-c", relativePath]);
}

const html = fs.readFileSync(path.join(root, "www", "index.html"), "utf8");
if (/questions\.js|csts-questions\.js/.test(html)) {
  throw new Error("www/index.html must not load questions.js or csts-questions.js");
}

syntaxCheck("script.js");
syntaxCheck(path.join("www", "script.js"));
run("node", [path.join("scripts", "validate-questions.js")]);
run("node", [path.join("scripts", "audit-phase3-content.js")]);
run("node", [path.join("scripts", "audit-classification-markers.js")]);
