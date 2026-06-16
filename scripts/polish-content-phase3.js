const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataRoots = [path.join(root, "www", "data"), path.join(root, "public", "data")];

const phase3Files = [
  "istqb/sample-a.json",
  "istqb/sample-b.json",
  "istqb/sample-c.json",
  "istqb/sample-d.json",
  "csts/csts-2402-fl.json",
  "csts/csts-2403-fl.json",
  "csts/csts-2404-fl.json",
  "csts/csts-2405-fl.json",
  "csts/csts-2018-general.json",
  "csts/csts-2019-general.json",
  "csts/csts-example-answer-included.json",
];

const figureFixes = new Map([
  ["CSTS-FL-2403:60", "csts-figures/2403FL-60.png"],
  ["CSTS-EL-SW-EXAMPLE:7", "csts-figures/SW-CSTS-7.png"],
]);

const blockImageFixes = new Map([
  ["CSTS-FL-2402:27", ["csts-figures/2402FL-27.png", "csts-figures/2402FL-27-2.png", "csts-figures/2402FL-27-3.png", "csts-figures/2402FL-27-4.png"]],
  ["CSTS-FL-2403:11", ["csts-figures/2403FL-11.png", "csts-figures/2403FL-11-2.png", "csts-figures/2403FL-11-3.png", "csts-figures/2403FL-11-4.png"]],
  ["CSTS-FL-2405:30", ["csts-figures/2405FL-30.png", "csts-figures/2405FL-30-2.png", "csts-figures/2405FL-30-3.png", "csts-figures/2405FL-30-4.png"]],
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u0001/g, "")
    .replace(/\bTTA\b/g, "")
    .replace(/한국정보통신기술협회\(TTA\)/g, "")
    .replace(/CSTS\s*시험\s*예제\s*\(일반\)/g, "")
    .replace(/\b-\s*\d+\s*-\b/g, "")
    .replace(/\b\d+\s*\/\s*\d+\b/g, "")
    .replace(/횟\s+수/g, "횟수")
    .replace(/절\s+차/g, "절차")
    .replace(/방법으\s+로/g, "방법으로")
    .replace(/커버리지\s+는/g, "커버리지는")
    .replace(/사이\s+의/g, "사이의")
    .replace(/수행하\s+는/g, "수행하는")
    .replace(/검증하\s+기/g, "검증하기")
    .replace(/요구사항을\s+충족함을\s+검증하\s+기/g, "요구사항을 충족함을 검증하기")
    .replace(/발견되\s+었다/g, "발견되었다")
    .replace(/테스트\s*하였을/g, "테스트하였을")
    .replace(/\s+([,.:;?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripInlineImageMarkers(value) {
  return cleanText(value).replace(/\s*__IMAGE__:\S+/g, "").trim();
}

function normalizeOptionText(value) {
  return cleanText(value)
    .replace(/^\s*[①②③④]\s*/, "")
    .replace(/^\s*[A-D][.)]\s+(?=\S)/i, "")
    .trim();
}

function collectText(block) {
  if (!block || typeof block !== "object") return "";
  if (typeof block.text === "string") return block.text;
  if (Array.isArray(block.lines)) return block.lines.join(" ");
  if (Array.isArray(block.items)) {
    return block.items.map((item) => (typeof item === "string" ? item : item.text || "")).join(" ");
  }
  return "";
}

function plainBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .map(collectText)
    .filter(Boolean)
    .join(" ");
}

function splitWithMarkers(text) {
  return stripInlineImageMarkers(text)
    .replace(/\s+(?=<보기>|<제어 흐름 그래프>|<보기>의|<보기\s*>)/g, "\n")
    .replace(/\s+(?=아래 입력 데이터를 사용해|아래 그래프는|그래프에서|테스트 그룹에서는|시스템의 반응을|이를 위한|이 리뷰방법에서는)/g, "\n")
    .replace(/\s+(?=다음 중|다음 보기|다음 입력|다음 프로그램|다음 CFG|다음 사례|다음의 정보|어떤 품질|커버리지 간의|명세기반 테스트와|기술 리뷰|워크쓰루|인스펙션|모델기반 테스트)/g, "\n")
    .replace(/\s+(?=\bTC\d+\s*:)/g, "\n")
    .replace(/\s+(?=\(\d+\)\s)/g, "\n")
    .replace(/\s+(?=\([가-힣]\)\s)/g, "\n")
    .replace(/\s+(?=[A-H]\.\s)/g, "\n")
    .replace(/\s+(?=[①②③④]\s)/g, "\n")
    .replace(/\s+(?=∙\s)/g, "\n")
    .replace(/\s+(?=(?:IF|ELSE|END|RETURN|READ|PRINT)\b)/g, "\n")
    .replace(/\s+(?=(?:int|Bool|boolean|String|float|double)\s+\w)/g, "\n")
    .replace(/\s+(?=[{}]\s*$)/g, "\n")
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isPrompt(text) {
  return /(?:무엇인가|무엇인지|어느 것|올바른 것은|올바르지 않은 것은|해당하지 않는 것은|가장 적절한 것은|고르시오|기재하시오|기술하시오|작성하시오|계산한 값은)\??$/.test(text);
}

function parseListItem(text) {
  const match = text.match(/^(\d+\.|\(\d+\)|\([가-힣]\)|[A-H]\.|[①②③④]|∙)\s*(.+)$/);
  if (!match) return null;
  return { marker: match[1], text: cleanText(match[2]) };
}

function isCodeLine(text) {
  return (
    /^[{}]$/.test(text) ||
    /[;{}]/.test(text) ||
    /^(?:RETURN|Z\s*=)\b/.test(text) ||
    /^(?:int|Bool|boolean|String|float|double|char|void|if|else|return|for|while|switch|IF|ELSE|THEN|END|ENDIF|READ|PRINT)\b/.test(text) ||
    /^[A-Za-z_]\w*\s*=/.test(text)
  );
}

function isFormulaLine(text) {
  return /(?:Edge\s*-\s*Node|E\s*\(|A\s*\(|AA\s*\(|EE\s*\(|\bZ\s*=|\bN\s*=|\bM\/D\b|coverage|Coverage)/i.test(text);
}

function flushList(target, list) {
  if (list.length) {
    target.push({ type: "list", items: list.splice(0) });
  }
}

function flushCode(target, code) {
  if (code.length) {
    target.push({ type: "code", lines: code.splice(0).map(cleanText).filter(Boolean) });
  }
}

function buildBlocksFromText(text) {
  const parts = splitWithMarkers(text);
  const result = [];
  const list = [];
  const code = [];

  for (const part of parts) {
    if (/^__IMAGE__:\s*/.test(part)) {
      flushCode(result, code);
      flushList(result, list);
      result.push({ type: "image", src: part.replace(/^__IMAGE__:\s*/, "").trim() });
      continue;
    }
    if (/^<.*>$/.test(part) || /^※/.test(part)) {
      flushCode(result, code);
      flushList(result, list);
      result.push({ type: "note", text: part });
      continue;
    }
    const listItem = parseListItem(part);
    if (listItem) {
      flushCode(result, code);
      list.push(listItem);
      continue;
    }
    if (isCodeLine(part)) {
      flushList(result, list);
      code.push(part);
      continue;
    }
    flushCode(result, code);
    flushList(result, list);
    result.push({
      type: isPrompt(part) ? "prompt" : isFormulaLine(part) ? "formula" : "paragraph",
      text: part,
    });
  }

  flushCode(result, code);
  flushList(result, list);
  return result.length ? result : [{ type: "paragraph", text: cleanText(text) }];
}

function addImageBlocks(setId, question) {
  const images = blockImageFixes.get(`${setId}:${question.number}`);
  if (!images) return question.stem;

  const withoutImageMarkers = question.stem.filter(
    (block) => !(block.type === "image" || /^__IMAGE__:\s*/.test(block.text || "")),
  );
  const imageBlocks = images.map((src, index) => [
    { type: "note", text: `그림 ${index + 1}` },
    { type: "image", src },
  ]).flat();
  return [...withoutImageMarkers, ...imageBlocks];
}

function p(text) {
  return { type: "paragraph", text: cleanText(text) };
}

function prompt(text) {
  return { type: "prompt", text: cleanText(text) };
}

function note(text) {
  return { type: "note", text: cleanText(text) };
}

function image(src) {
  return { type: "image", src };
}

function code(lines) {
  return { type: "code", lines: lines.map(cleanText).filter(Boolean) };
}

function list(items) {
  return {
    type: "list",
    items: items.map(([marker, text]) => ({ marker, text: cleanText(text) })),
  };
}

function applySpecificBlocks(setId, question) {
  const key = `${setId}:${question.number}`;
  if (key === "ISTQB-FL-V4-B:22") {
    question.stem = [
      p("다음 결정 테이블은 동맥경화증의 위험 수준을 판단하는 규칙을 보여준다:"),
      image("source-visuals/B22-artery-table.png"),
      p("아래 입력 데이터를 사용해 테스트 케이스를 설계했다:"),
      list([
        ["TC1:", "콜레스테롤 = 125mg/dl, 혈압 = 141mmHg"],
        ["TC2:", "콜레스테롤 = 200mg/dl, 혈압 = 201mmHg"],
        ["TC3:", "콜레스테롤 = 124mg/dl, 혈압 = 201mmHg"],
        ["TC4:", "콜레스테롤 = 109mg/dl, 혈압 = 200mmHg"],
        ["TC5:", "콜레스테롤 = 201mg/dl, 혈압 = 141mmHg"],
      ]),
      prompt("다음 중 위에 주어진 테스트 케이스로 달성한 결정 테이블 커버리지는?"),
    ];
  }
  if (key === "ISTQB-FL-V4-B:31") {
    question.stem = [
      p("비율 기반 추정을 사용해 새 프로젝트의 테스트 노력을 추정하려고 한다."),
      p("새로운 프로젝트와 유사한 과거 4개 프로젝트의 평균 개발 노력과 테스트 노력 데이터를 가지고 테스트 대 개발(Test-to-Development) 노력의 비율을 계산한다."),
      image("source-visuals/B31-project-effort.png"),
      p("새 프로젝트의 예상 개발 노력은 $800,000 이다."),
      prompt("이 프로젝트의 테스트 노력은 어느 정도로 예상되는가?"),
    ];
  }
  if (key === "ISTQB-FL-V4-C:31") {
    question.stem = [
      p("각 반복주기가 시작될 때 팀은 반복주기 중에 완료해야 하는 작업량(M/D)을 추정한다."),
      p("E(n)이 반복주기 n의 예상 작업량이고 A(n)은 반복주기 n에서 수행한 실제 작업량을 나타낸다고 하자."),
      p("세 번째 반복주기부터 팀은 외삽법(extrapolation)을 기반으로 한 추정 모델을 사용한다."),
      { type: "formula", text: "E(n) = (3 * A(n - 1) + A(n - 2)) / 4" },
      p("그래프는 처음 4번 반복주기의 예상 작업량과 실제 작업량을 보여주고 있다."),
      prompt("다음 중 반복주기 #5의 예상 작업량으로 올바른 것은?"),
    ];
  }
  if (key === "ISTQB-FL-V4-D:22") {
    question.stem = [
      p("다음 결정 테이블은 분류 규칙을 보여준다."),
      image("source-visuals/D22-classification-table.png"),
      prompt("다음 중 테스트 케이스로 달성할 수 있는 커버리지로 올바른 것은?"),
    ];
  }
  if (key === "ISTQB-FL-V4-D:23") {
    question.stem = [
      p("저장 시스템은 최대 3개의 요소를 저장할 수 있으며 다음 상태 전이 다이어그램으로 모델링된다."),
      image("source-visuals/D23-hotel-transition.png"),
      prompt("이벤트 순서로 표현된 다음 테스트 케이스 중 유효 전이 커버리지가 가장 높은 것은?"),
    ];
  }
  if (key === "CSTS-FL-2403:27") {
    question.stem = [
      p("다음 프로그램에 (X=10, Y=5), (X=15, Y=0)의 테스트 케이스를 실행하였을 때 조건 커버리지는?"),
      note("(※ 단, short circuit evaluation은 없다고 가정한다.)"),
      code([
        "IF ((X >= 6) || (Y > 14))",
        "  Z = X + Y",
        "IF ((X < Z) && (Y > 14))",
        "  Z = X",
        "IF (X <= Z)",
        "  RETURN 0",
      ]),
    ];
  }
  if (key === "CSTS-FL-2403:56") {
    question.stem = [
      p("<보기>의 프로그램에 x=0, y=1 을 입력하여 테스트한다면, 문장 커버리지 100%를 달성할 수 있다. (O/X)"),
      note("<보기>"),
      code([
        "int foo(int x, int y)",
        "{",
        "  int z = 0;",
        "  if ((x > 0) && (y > 0))",
        "  {",
        "    z = x;",
        "  }",
        "  return z;",
        "}",
      ]),
    ];
  }
  if (key === "CSTS-FL-2405:25" || key === "CSTS-EL-SW-EXAMPLE:22") {
    question.stem = [
      prompt("<보기> 코드를 정적 분석했을 때 발견되는 문제점의 유형은 무엇인가?"),
      note("<보기>"),
      code([
        "Bool p;",
        "if (p)",
        "  puts(\"p is true\");",
        "if (!p)",
        "  puts(\"p is false\");",
      ]),
    ];
  }
  if (key === "CSTS-EL-SW-EXAMPLE:28") {
    question.stem = [
      p("<보기>의 프로그램 코드를 다중 조건 커버리지를 만족시키기 위해 2개의 테스트 케이스를 도출하였다."),
      prompt("이러한 테스트 케이스로 실행되는 조건의 조합에 해당되지 않은 것은?"),
      note("<보기>"),
      code([
        "if ((x > 1) and (y == 0)) {",
        "  z = z / x;",
        "}",
        "if ((x == 2) or (z > 1)) {",
        "  z = z + 1;",
        "}",
      ]),
      list([
        ["TC1", "(x=2, y=0, z=4)"],
        ["TC2", "(x=2, y=1, z=1)"],
      ]),
    ];
  }
  return question;
}

function polishQuestion(setId, question) {
  const key = `${setId}:${question.number}`;
  const figure = figureFixes.get(key);
  if (figure) question.figure = figure;

  question.stem = buildBlocksFromText(plainBlocks(question.stem));
  question.stem = addImageBlocks(setId, question);
  question.explanation = buildBlocksFromText(plainBlocks(question.explanation));

  if (Array.isArray(question.options)) {
    question.options = question.options.map((option) => ({
      ...option,
      text: normalizeOptionText(option.text),
    }));
  }

  return applySpecificBlocks(setId, question);
}

for (const baseDir of dataRoots) {
  for (const rel of phase3Files) {
    const filePath = path.join(baseDir, rel);
    if (!fs.existsSync(filePath)) continue;
    const payload = readJson(filePath);
    const setId = payload.meta && payload.meta.id;
    payload.questions = payload.questions.map((question) => polishQuestion(setId, question));
    writeJson(filePath, payload);
    console.log(`polished ${path.relative(root, filePath)}`);
  }
}
