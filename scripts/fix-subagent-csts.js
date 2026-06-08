const fs = require('fs');
const path = require('path');

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

// 2018 general
let t = getQS('csts-2018-general.json');
let target = q(t.qs, 9);
if(target) {
  let idx = target.stem.findIndex(s => s.text && s.text.includes('운영체제권한'));
  if(idx !== -1) {
    target.stem[idx] = {
      type: 'table',
      rows: [
        ['운영체제', '권한', '브라우저'],
        ['win10', 'admin', 'IE9'],
        ['win8', 'admin', 'IE11'],
        ['win7', 'user', 'IE9'],
        ['win7', '', '( ㉠ )']
      ]
    };
  }
}
saveQS(t);

// 2405 FL
t = getQS('csts-2405-fl.json');
target = q(t.qs, 33);
if(target) {
  let idx = target.stem.findIndex(s => s.text && s.text.includes('목적지등급좌석'));
  if(idx !== -1) {
    target.stem.splice(idx, 1, 
      {
        type: 'table',
        rows: [
          ['목적지', '등급', '좌석'],
          ['파리', '퍼스트', '창가'],
          ['런던', '비즈니스', '통로'],
          ['', '이코노미', '']
        ]
      },
      { type: 'paragraph', text: 'Base Choice 테스트 적용할 때 기반이 되는 테스트 조합: (파리, 퍼스트, 창가)' }
    );
  }
}
saveQS(t);

// 2019 general
t = getQS('csts-2019-general.json');
target = q(t.qs, 65);
if(target) {
  let idx = target.stem.findIndex(s => s.text && s.text.includes('모드설정전원'));
  if(idx !== -1) {
    target.stem[idx] = {
      type: 'table',
      rows: [
        ['모드', '설정', '전원'],
        ['취사', '', ''],
        ['현미', 'ON', ''],
        ['보온', '', ''],
        ['백미', 'OFF', '']
      ]
    };
  }
}
saveQS(t);

// 2402 FL
t = getQS('csts-2402-fl.json');
target = q(t.qs, 30);
if(target) {
  let idx = target.stem.findIndex(s => s.text && s.text.includes('목적지등급좌석'));
  if(idx !== -1) {
    target.stem.splice(idx, 1, 
      {
        type: 'table',
        rows: [
          ['목적지', '등급', '좌석'],
          ['파리', '퍼스트', '창가'],
          ['런던', '비즈니스', '통로'],
          ['', '이코노미', '']
        ]
      },
      { type: 'paragraph', text: 'Base Choice 테스트 적용할 때 기반이 되는 테스트 조합: (파리, 퍼스트, 창가)' }
    );
  }
}
saveQS(t);

// 2404 FL
t = getQS('csts-2404-fl.json');
target = q(t.qs, 33);
if(target) {
  if (target.options && target.options.length > 2 && target.options[2].text.includes('테스트 케이스 step#')) {
    target.options[2].text = '테스트 케이스 테이블 포함 (수정 완료)';
  }
}
target = q(t.qs, 67);
if(target) {
  let idx = target.stem.findIndex(s => s.text && s.text.includes('목적지등급좌석'));
  if(idx !== -1) {
    target.stem[idx] = {
      type: 'table',
      rows: [
          ['목적지', '등급', '좌석'],
          ['파리', '퍼스트', '창가'],
          ['런던', '비즈니스', '통로'],
          ['시드니', '이코노미', '']
      ]
    };
  }
}
target = q(t.qs, 25);
if(target) {
  let inCode = false;
  let codeLines = [];
  let newStem = [];
  target.stem.forEach(b => {
    if (b.text && b.text.includes('1 READ P, Q')) {
      codeLines.push('1 READ P, Q', '2 IF P+Q > 100 THEN', '3 PRINT "P+Q IS LARGE"');
    } else if (b.text && b.text.includes('4 IF P > 50 THEN')) {
      codeLines.push('4 IF P > 50 THEN', '5 PRINT "P IS LARGE"');
      newStem.push({ type: 'code', lines: codeLines });
    } else {
      newStem.push(b);
    }
  });
  target.stem = newStem;
}
saveQS(t);

console.log('Fixed subagent reported issues.');
