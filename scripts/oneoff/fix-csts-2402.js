const fs = require('fs');

const targetFile = 'd:/Coding/ISTQB/WindowHyun-ISTQB/public/data/csts/csts-2402-fl.json';
const content = JSON.parse(fs.readFileSync(targetFile, 'utf8'));

const qs = content.questions || content;

function findQ(num) {
  return qs.find(q => q.number === num || q.number === String(num));
}

// Fix Q2
const q2 = findQ(2);
if (q2) {
  const merged = q2.stem.filter(s => s.type !== 'paragraph' || !s.text.includes('위를 가짐을 의미한다.'));
  const noteBlock = merged.find(s => s.text && s.text.includes('※ A ＜ B'));
  if (noteBlock) {
    noteBlock.text = '※ A < B는 A의 개념보다 B가 더 광범위한 용어임을 의미한다. A = B는 A와 B가 동일한 범위를 가짐을 의미한다.';
  }
  q2.stem = merged;
}

fs.writeFileSync(targetFile, JSON.stringify(content, null, 2));
console.log('Fixed csts-2402-fl.json');
