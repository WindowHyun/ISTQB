const fs = require('fs');
const path = require('path');

const targetFile = 'd:/Coding/ISTQB/WindowHyun-ISTQB/public/data/csts/csts-example-answer-included.json';
const content = JSON.parse(fs.readFileSync(targetFile, 'utf8'));

const qs = content.questions || content;

function findQ(num) {
  return qs.find(q => q.number === num || q.number === String(num));
}

// Fix Q3
const q3 = findQ(3);
if (q3) {
  const merged = q3.stem.filter(s => s.type !== 'paragraph' || !s.text.includes('위를 가짐을 의미한다.'));
  const noteBlock = merged.find(s => s.text && s.text.includes('※ A ＜ B'));
  if (noteBlock) {
    noteBlock.text = '※ A < B는 A의 개념보다 B가 더 광범위한 용어임을 의미한다. A = B는 A와 B가 동일한 범위를 가짐을 의미한다.';
  }
  q3.stem = merged;
}

// Fix Q22
const q22 = findQ(22);
if (q22) {
  const newStem = [];
  let inCode = false;
  let codeLines = [];
  
  q22.stem.forEach(b => {
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
  q22.stem = newStem;
}

// Fix Q28
const q28 = findQ(28);
if (q28) {
  // Just moving the list into the stem paragraph or leaving it as list is fine.
  // Actually, let's leave it, but maybe remove "테스트 케이스" and make it a prompt before the list?
  const idx = q28.stem.findIndex(b => b.text === '테스트 케이스');
  if (idx !== -1) {
    q28.stem[idx].type = 'prompt';
  }
}

// Fix Q32
const q32 = findQ(32);
if (q32) {
  const tableIdx = q32.stem.findIndex(b => b.text && b.text.includes('MachineOS ProtocolIBM'));
  if (tableIdx !== -1) {
    q32.stem[tableIdx] = {
      type: 'table',
      rows: [
        ['Machine', 'OS', 'Protocol'],
        ['IBM', 'Windows', 'TCP'],
        ['HP', 'Unix', 'UDP']
      ]
    };
  }
}

// Fix Q33
const q33 = findQ(33);
if (q33) {
  const tableIdx = q33.stem.findIndex(b => b.text && b.text.includes('규칙12345678조건'));
  if (tableIdx !== -1) {
    q33.stem[tableIdx] = {
      type: 'table',
      rows: [
        ['규칙', '1', '2', '3', '4', '5', '6', '7', '8'],
        ['조건', '', '', '', '', '', '', '', ''],
        ['B등급 이상', 'Y', 'Y', 'Y', 'Y', 'N', 'N', 'N', 'N'],
        ['10년차 이상', 'Y', 'Y', 'N', 'N', 'Y', 'Y', 'N', 'N'],
        ['공로상 수상', 'Y', 'N', 'Y', 'N', 'Y', 'N', 'Y', 'N'],
        ['행위', '', '', '', '', '', '', '', ''],
        ['프랑스', 'Y', 'Y', 'F', 'F', 'F', 'F', 'F', 'F'],
        ['싱가포르', 'F', 'F', 'Y', 'Y', 'F', 'F', 'F', 'F'],
        ['스페인', 'Y', 'F', 'Y', 'F', 'F', 'F', 'F', 'F']
      ]
    };
  }
}

// Fix Q65
const q65 = findQ(65);
if (q65) {
  const newStem = [];
  let currentList = null;
  q65.stem.forEach(b => {
    if (b.type === 'list') {
      currentList = b.items[0].text;
    } else if (b.type === 'paragraph' && b.text.startsWith('태를 평가하여')) {
      newStem.push({
        type: 'list',
        items: [{ marker: '-', text: currentList + b.text }]
      });
      currentList = null;
    } else {
      if (currentList) {
        newStem.push({ type: 'list', items: [{ marker: '-', text: currentList }] });
        currentList = null;
      }
      newStem.push(b);
    }
  });
  if (currentList) {
    newStem.push({ type: 'list', items: [{ marker: '-', text: currentList }] });
  }
  q65.stem = newStem;
}

fs.writeFileSync(targetFile, JSON.stringify(content, null, 2));
console.log('Fixed csts-example-answer-included.json');
