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
// 재수록 그룹 표가 문항 데이터와 어긋나면 실패시킨다 — 낡은 표는 "중복인데
// 중복이 아니라고 말하는" 상태라 챕터 통계 분모가 다시 부풀어 오른다.
run("node", [path.join("scripts", "build-duplicate-groups.js"), "--check"]);
run("node", [path.join("scripts", "audit-phase3-content.js")]);
run("node", [path.join("scripts", "audit-classification-markers.js")]);
