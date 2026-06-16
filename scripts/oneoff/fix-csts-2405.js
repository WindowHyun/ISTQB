const fs = require('fs');

const targetFile = 'd:/Coding/ISTQB/WindowHyun-ISTQB/public/data/csts/csts-2405-fl.json';
const content = JSON.parse(fs.readFileSync(targetFile, 'utf8'));

const qs = content.questions || content;

function findQ(num) {
  return qs.find(q => q.number === num || q.number === String(num));
}

// Fix Q25
const q25 = findQ(25);
if (q25) {
  const newStem = [];
  let inCode = false;
  let codeLines = [];
  
  q25.stem.forEach(b => {
    if (b.text === '<보기>') {
      newStem.push(b);
      inCode = true;
    } else if (inCode) {
      if (b.type === 'code') {
        codeLines = codeLines.concat(b.lines || []);
      } else if (b.type === 'paragraph' && b.text.includes('puts(')) {
        codeLines.push('    ' + b.text);
      }
    } else {
      newStem.push(b);
    }
  });
  if (inCode && codeLines.length > 0) {
    newStem.push({ type: 'code', lines: codeLines });
  }
  q25.stem = newStem;
}

fs.writeFileSync(targetFile, JSON.stringify(content, null, 2));
console.log('Fixed csts-2405-fl.json');
