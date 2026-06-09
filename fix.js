const fs = require('fs');

const sets = {
  'public/data/istqb/sample-extra.json': [4, 20, 26],
  'public/data/istqb/sample-d.json': [8, 34, 39],
  'public/data/istqb/sample-c.json': [5, 17, 21, 31],
  'public/data/istqb/sample-b.json': [18, 25],
  'public/data/istqb/sample-a.json': [14, 35],
  'public/data/csts/csts-2402-fl.json': [4, 24],
  'public/data/csts/csts-2403-fl.json': [6],
  'public/data/csts/csts-2404-fl.json': [4, 23, 67]
};

for (const [file, nums] of Object.entries(sets)) {
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`\n\n========== ${file} ==========`);
  for (const n of nums) {
    const q = data.questions.find(x => x.number === n);
    if (q) {
      console.log(`\n--- Q${n} ---`);
      console.log(q.stem);
      if (q.choices) {
        q.choices.forEach((o, i) => console.log(`  ${o.id}. ${o.text}`));
      }
    }
  }
}
