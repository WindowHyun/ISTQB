const fs = require('fs');
const path = require('path');

function getFiles(dir, files = []) {
  const list = fs.readdirSync(dir);
  for (let file of list) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getFiles(fullPath, files);
    } else if (fullPath.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = getFiles('public/data');

files.forEach(file => {
  if (file.includes('index.json')) return;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let modified = false;

  data.questions.forEach(q => {
    if (!q.stem || !Array.isArray(q.stem)) return;
    
    const newStem = [];
    let currentCodeBlock = null;

    q.stem.forEach(block => {
      if (block.type === 'code') {
        if (!currentCodeBlock) {
          currentCodeBlock = { type: 'code', lines: [...block.lines] };
          newStem.push(currentCodeBlock);
        } else {
          currentCodeBlock.lines.push('', ...block.lines);
          modified = true;
        }
      } else {
        currentCodeBlock = null;
        newStem.push(block);
      }
    });

    if (modified) {
      q.stem = newStem;
    }
  });

  if (modified) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`Consolidated code blocks in ${file}`);
  }
});
