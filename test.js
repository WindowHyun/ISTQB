function splitDenseQuestionText(text) {
  return String(text || "")
    .replace(/\s+(?=TC\d+\s*:)/g, "\n")
    .replace(/\s+(?=AC\d+\s*:)/g, "\n")
    .replace(/(사용한다\.)\s+(?=(?:\b(?:E|A|AA|EE)|[𝐸𝐴]{1,2})\s*\()/g, "$1\n")
    .replace(/\s+(?=\b(?:E|A|AA|EE)\s*\([^)]*\)\s*=)/g, "\n")
    .replace(/\s+(?=[𝐸𝐴]{1,2}\s*\([^)]*\)\s*=)/g, "\n")
    .replace(/\s+([0-9]+)\s+(?=그래프는)/g, " / $1\n")
    .replace(/\s+(?=다음\s+중\b)/g, "\n")
    .replace(/\s+(?=다음과\s+같은\b)/g, "\n")
    .replace(/\s+(?=테스트\s+케이스로\b)/g, "\n")
    .replace(/\s+(?=그래프는\b)/g, "\n")
    .split("\n")
    .map((part) => part.trim());
}

function splitFormulaIntro(text) {
  const value = String(text || "").trim();
  const index = value.search(/(?:\b(?:E|A|AA|EE)|[𝐸𝐴]{1,2})\s*\([^)]*\)\s*[=＝]/);
  if (index <= 24 || !/[=＝]/.test(value.slice(index))) return [value];
  return [value.slice(0, index).trim(), value.slice(index).trim()].filter(Boolean);
}

const text = "<보기>의 프로그램 코드에서 (a=250) 테스트 케이스를 통해 수행되는 경로로 올바른 것은?";
console.log(splitDenseQuestionText(text).flatMap(splitFormulaIntro));
