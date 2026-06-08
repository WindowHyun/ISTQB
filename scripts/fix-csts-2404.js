const fs = require('fs');

const targetFile = 'd:/Coding/ISTQB/WindowHyun-ISTQB/public/data/csts/csts-2404-fl.json';
const content = JSON.parse(fs.readFileSync(targetFile, 'utf8'));

const qs = content.questions || content;

function findQ(num) {
  return qs.find(q => q.number === num || q.number === String(num));
}

// Fix Q27
const q27 = findQ(27);
if (q27) {
  const newStem = [];
  let inCode = false;
  let codeLines = [];
  
  q27.stem.forEach(b => {
    if (b.text === '<보기>') {
      newStem.push(b);
      inCode = true;
    } else if (inCode) {
      if (b.type === 'code') {
        codeLines = codeLines.concat(b.lines || []);
      } else if (b.type === 'paragraph' && b.text.includes('If (')) {
        codeLines.push(b.text);
      } else {
        // Assume anything else in code block after <보기> is code until we decide otherwise?
        // Actually for Q27 it's just code
        if (b.text) codeLines.push(b.text);
      }
    } else {
      newStem.push(b);
    }
  });
  if (inCode && codeLines.length > 0) {
    newStem.push({ type: 'code', lines: codeLines });
  }
  q27.stem = newStem;
}

fs.writeFileSync(targetFile, JSON.stringify(content, null, 2));
console.log('Fixed csts-2404-fl.json');
