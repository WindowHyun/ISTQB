const fs = require('fs');
const glob = require('glob');

const files = glob.sync('public/data/**/*.json');

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
