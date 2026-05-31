const fs = require('fs');
const q = require('./questions.json');
let script = fs.readFileSync('script.js', 'utf8');

script = script.replace('return {', 'const exported = {');

// Fake DOM
const window = {
  addEventListener: () => {},
  ISTQB_DATA: { sets: [] },
  CSTS_DATA: { sets: [] }
};
const document = {
  addEventListener: () => {},
  querySelector: () => ({ addEventListener: () => {} }),
  querySelectorAll: () => ([]),
  getElementById: () => ({ addEventListener: () => {} }),
  createElement: () => ({})
};
const location = { hash: '' };
const navigator = {};

eval(script);

const d22 = q.sets.find(s=>s.title==='샘플문제 D').questions.find(qn=>qn.number===22);
console.log("=== D22 HTML ===");
console.log(renderRichText(d22.stem));
