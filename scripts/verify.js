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

// 레거시 바닐라 앱(루트/www의 index.html·script.js) 문법 검사는 앱 제거(C8)와 함께 삭제됨.
run("node", [path.join("scripts", "validate-questions.js")]);
run("node", [path.join("scripts", "audit-phase3-content.js")]);
run("node", [path.join("scripts", "audit-classification-markers.js")]);
