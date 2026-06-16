const fs = require('fs');

function getQS(file) {
  const p = 'd:/Coding/ISTQB/WindowHyun-ISTQB/public/data/csts/' + file;
  const content = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { path: p, content, qs: content.questions || content };
}

function saveQS({path: p, content}) {
  fs.writeFileSync(p, JSON.stringify(content, null, 2));
}

function q(qs, num) {
  return qs.find(x => x.number === num || x.number === String(num));
}

// csts-example-answer-included.json
let t = getQS('csts-example-answer-included.json');
let target = q(t.qs, 32);
if (target) {
  target.options = [
    { key: "a", text: [{ type: "table", rows: [["TC", "Machine", "OS", "Protocol"], ["1", "IBM", "Unix", "UDP"], ["2", "HP", "Windows", "UDP"], ["3", "IBM", "Windows", "TCP"]] }] },
    { key: "b", text: [{ type: "table", rows: [["TC", "Machine", "OS", "Protocol"], ["1", "IBM", "Windows", "TCP"], ["2", "IBM", "Unix", "UDP"], ["3", "HP", "Windows", "TCP"]] }] },
    { key: "c", text: [{ type: "table", rows: [["TC", "Machine", "OS", "Protocol"], ["1", "IBM", "Unix", "TCP"], ["2", "IBM", "Windows", "UDP"], ["3", "HP", "Windows", "UDP"], ["4", "HP", "Unix", "TCP"]] }] },
    { key: "d", text: [{ type: "table", rows: [["TC", "Machine", "OS", "Protocol"], ["1", "IBM", "Windows", "TCP"], ["2", "IBM", "Unix", "UDP"], ["3", "HP", "Windows", "UDP"], ["4", "HP", "Unix", "TCP"]] }] }
  ];
}

target = q(t.qs, 33);
if (target) {
  target.options = [
    { key: "a", text: [{ type: "table", rows: [["테스트케이스", "입력", "", "기대출력"], ["", "인사평점", "근속연수", "공로상 수상"], ["1", "B", "15", "Y", "프랑스/스페인"], ["2", "C", "-", "-", "지원 대상 아님"], ["3", "A", "8", "Y", "싱가포르/스페인"], ["4", "B", "11", "N", "프랑스"]] }] },
    { key: "b", text: [{ type: "table", rows: [["테스트케이스", "입력", "", "기대출력"], ["", "인사평점", "근속연수", "공로상 수상"], ["1", "B", "15", "Y", "프랑스/스페인"], ["2", "A", "8", "N", "싱가포르"], ["3", "B", "11", "N", "프랑스"]] }] },
    { key: "c", text: [{ type: "table", rows: [["테스트케이스", "입력", "", "기대출력"], ["", "인사평점", "근속연수", "공로상 수상"], ["1", "B", "15", "Y", "프랑스/스페인"], ["2", "C", "-", "-", "지원 대상 아님"], ["3", "A", "8", "Y", "싱가포르/스페인"]] }] },
    { key: "d", text: [{ type: "table", rows: [["테스트케이스", "입력", "", "기대출력"], ["", "인사평점", "근속연수", "공로상 수상"], ["1", "B", "15", "Y", "프랑스/스페인"], ["2", "A", "8", "N", "싱가포르"], ["3", "B", "11", "N", "프랑스"], ["4", "A", "8", "Y", "싱가포르/스페인"]] }] }
  ];
}
saveQS(t);

// csts-2404-fl.json
t = getQS('csts-2404-fl.json');
target = q(t.qs, 33);
if (target) {
  target.options = [
    { key: "a", text: [{ type: "table", rows: [["테스트 케이스", "step#", "입력", "예상 출력", "상태"], ["입력값", "1", "노선", "예약됨", "항공사 선택"], ["", "2", "항공사", "예약됨", "결제"], ["", "3", "결제", "결제됨", "E-티켓 발권"]] }] },
    { key: "b", text: [{ type: "table", rows: [["테스트 케이스", "step#", "입력", "예상 출력", "상태"], ["입력값", "1", "결제", "결제됨", "E-티켓 발권"], ["", "2", "결제", "결제됨", "E-티켓 발권"], ["", "3", "노선", "예약됨", "항공사 선택"]] }] },
    { key: "c", text: [{ type: "table", rows: [["테스트 케이스", "step#", "입력", "예상 출력", "상태"], ["입력값", "1", "노선", "예약됨", "항공사 선택"], ["", "2", "항공사", "예약됨", "결제"], ["", "3", "결제", "결제됨", "E-티켓 발권"]] }] },
    { key: "d", text: [{ type: "table", rows: [["테스트 케이스", "step#", "입력", "예상 출력", "상태"], ["입력값", "1", "항공사", "예약됨", "결제"], ["", "2", "노선", "예약됨", "항공사 선택"], ["", "3", "결제", "결제됨", "E-티켓 발권"]] }] }
  ];
}
saveQS(t);

console.log('Fixed options tables');
