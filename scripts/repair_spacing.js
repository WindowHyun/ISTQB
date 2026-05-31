const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = [
  path.join(root, "questions.json"),
  path.join(root, "www", "questions.json"),
  path.join(root, "csts-questions.json"),
];

const replacements = new Map([
  ["기 능", "기능"],
  ["테스트 하기", "테스트하기"],
  ["테스팅 하기", "테스팅하기"],
  ["추 정", "추정"],
  ["요 구사항", "요구사항"],
  ["요구사 항", "요구사항"],
  ["애플리케 이션", "애플리케이션"],
  ["케이 스", "케이스"],
  ["테스트 케 이스", "테스트 케이스"],
  ["프 로젝트", "프로젝트"],
  ["프로 젝트", "프로젝트"],
  ["프로 세스", "프로세스"],
  ["소프트 웨어", "소프트웨어"],
  ["소 프트웨어", "소프트웨어"],
  ["컴 포넌트", "컴포넌트"],
  ["비 즈니스", "비즈니스"],
  ["시 스템", "시스템"],
  ["리 그레션", "리그레션"],
  ["테 스트웨어", "테스트웨어"],
  ["테 스트", "테스트"],
  ["테스 트", "테스트"],
  ["테 스팅", "테스팅"],
  ["테스 팅", "테스팅"],
  ["동 등분할", "동등분할"],
  ["경 계값", "경계값"],
  ["커 버리지", "커버리지"],
  ["인 수 조건", "인수 조건"],
  ["사용 자", "사용자"],
  ["개 발자", "개발자"],
  ["관리 자", "관리자"],
  ["참 조", "참조"],
  ["결 함", "결함"],
  ["장 애인", "장애인"],
  ["장 애", "장애"],
  ["입 력", "입력"],
  ["출 력", "출력"],
  ["실 패", "실패"],
  ["합 격", "합격"],
  ["문 제", "문제"],
  ["다 음", "다음"],
  ["가 장", "가장"],
  ["적 절", "적절"],
  ["정 답", "정답"],
  ["오 답", "오답"],
  ["설 명", "설명"],
  ["분 류", "분류"],
  ["유 형", "유형"],
  ["위 험", "위험"],
  ["리 스크", "리스크"],
  ["의미하 는가", "의미하는가"],
  ["재 구성", "재구성"],
]);

[
  ["\uf06c", "\n•"],
  ["\uf0a1", "\n•"],
  ["\uf0a7", "\n•"],
  ["\uf0b7", "\n•"],
  ["E 2", "E2"],
  ["추가하 고", "추가하고"],
  ["한 다", "한다"],
  ["7 개", "7개"],
  ["3 개", "3개"],
  ["4 개", "4개"],
  ["5 개", "5개"],
  ["이벤트 는", "이벤트는"],
  ["상 태", "상태"],
  ["N 을", "N을"],
  ["2 가지", "2가지"],
  ["걱정하 고", "걱정하고"],
  ["제공하 고", "제공하고"],
  ["부여하 고", "부여하고"],
  ["측정합 니다", "측정합니다"],
  ["발생합 니다", "발생합니다"],
  ["수행합 니다", "수행합니다"],
  ["도출합 니다", "도출합니다"],
  ["노출하도록 합 니다", "노출하도록 합니다"],
  ["달성합 니다", "달성합니다"],
  ["해당합 니다", "해당합니다"],
  ["해야 합 니다", "해야 합니다"],
  ["하도록 합 니다", "하도록 합니다"],
  ["합 니다", "합니다"],
  ["아닙 니다", "아닙니다"],
  ["없 습니다", "없습니다"],
  ["됩 니다", "됩니다"],
  ["않습 니다", "않습니다"],
  ["있 습니다", "있습니다"],
  ["것 은", "것은"],
  ["부 분", "부분"],
  ["두 개 를", "두 개를"],
  ["소프 트웨어", "소프트웨어"],
  ["인터페 이스", "인터페이스"],
  ["동 적", "동적"],
  ["오 류", "오류"],
  ["사 용자", "사용자"],
  ["보고 서", "보고서"],
  ["활 동", "활동"],
  ["리그레 션", "리그레션"],
  ["구성되 고", "구성되고"],
  ["완료되 고", "완료되고"],
  ["한다음과 같 은", "한 다음과 같은"],
  ["한다음과 같은", "한 다음과 같은"],
  ["실행한다음", "실행한 다음"],
  ["정의한다음", "정의한 다음"],
  ["확인한다음", "확인한 다음"],
  ["테스트한다음", "테스트한 다음"],
  ["정렬한다음", "정렬한 다음"],
  ["나타 낸다고", "나타낸다고"],
  ["존재함 을", "존재함을"],
  ["대한다음", "대한 다음"],
  ["식별하 는", "식별하는"],
  ["시작하 는", "시작하는"],
  ["수정하 는", "수정하는"],
  ["테스트하 는", "테스트하는"],
  ["수행하 는", "수행하는"],
  ["해야 하 는", "해야 하는"],
  ["야기하 는데", "야기하는데"],
  ["애플리케이 션", "애플리케이션"],
  ["베리피케 이션", "베리피케이션"],
  ["베리피케이 션", "베리피케이션"],
  ["네비게 이션", "네비게이션"],
  ["업데 이트", "업데이트"],
  ["테스\n팅", "테스팅"],
  ["테스 터", "테스터"],
  ["테스터 가", "테스터가"],
  ["테스트 컨디션 을", "테스트 컨디션을"],
  ["상태 의", "상태의"],
  ["개발자 팀 에", "개발자 팀에"],
  ["시스템 의", "시스템의"],
  ["분석 과", "분석과"],
  ["인 한", "인한"],
  ["도출된 다", "도출된다"],
  ["모델링 된다", "모델링된다"],
  ["표시 된 다음", "표시된 다음"],
  ["사 용했", "사용했"],
  ["사 용합니다", "사용합니다"],
  ["보 고서", "보고서"],
  ["기반으 로", "기반으로"],
  ["함수 를", "함수를"],
  ["호 텔", "호텔"],
  ["주 어진", "주어진"],
  ["필 요", "필요"],
  ["확인 하기", "확인하기"],
  ["변경 되지", "변경되지"],
  ["유 지보수", "유지보수"],
  ["재구 성", "재구성"],
  ["모니터링은은", "모니터링은"],
  ["TC1또는", "TC1 또는"],
  ["첫번째", "첫 번째"],
  ["N 은", "N은"],
  ["4. 워크쓰루 그리고 다음과 같은 설명이 있다:", "4. 워크쓰루\n그리고 다음과 같은 설명이 있다:"],
].forEach(([from, to]) => replacements.set(from, to));

function repair(value) {
  if (typeof value !== "string") return value;
  let result = value;
  
  // Remove arbitrary mid-sentence newlines (PDF extraction artifacts)
  // Keeps newlines that follow punctuation (. ? : ! >) or precede lists/tables
  result = result.replace(/([^.?:!\n>])\n(?!\s*(?:[•*\-]|\d+\.|[A-E]\.|[a-e]\)|(?:viii|vii|vi|iv|iii|ii|ix|x|v|i)\.|__IMAGE__|__TABLE__|__CODE__|TC\d+|AC\d+|라운드|기대\s*결과|실제\s*결과|1|2|3|4|5|6|7|8|9|0|A|B|C|D|E|F|단,|참고:))/gi, "$1 ");

  replacements.forEach((to, from) => {
    result = result.replaceAll(from, to);
  });
  return result;
}

function repairQuestion(question) {
  question.stem = repair(question.stem);
  question.explanation = repair(question.explanation);
  question.options.forEach((option) => {
    option.text = repair(option.text);
  });
}

files.forEach((file) => {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  data.sets.forEach((set) => set.questions.forEach(repairQuestion));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
});

const dataScript = `window.ISTQB_DATA = ${fs.readFileSync(files[0], "utf8").trim()};\n`;
fs.writeFileSync(path.join(root, "questions.js"), dataScript, "utf8");
fs.writeFileSync(path.join(root, "www", "questions.js"), dataScript, "utf8");

const cstsDataScript = `window.CSTS_DATA = ${fs.readFileSync(files[2], "utf8").trim()};\n`;
fs.writeFileSync(path.join(root, "csts-questions.js"), cstsDataScript, "utf8");
fs.writeFileSync(path.join(root, "www", "csts-questions.js"), cstsDataScript, "utf8");

console.log("spacing repaired");
