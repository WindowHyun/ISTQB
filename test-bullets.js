const fs = require('fs');
const script = fs.readFileSync('script.js', 'utf8');
const q = require('./questions.json');
const c = require('./csts-questions.json');

// Extract the parsing functions from script.js
const extractFn = (name) => {
  const match = script.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n      }`));
  return match ? match[0] : '';
};

let functions = `
${extractFn('isBulletMarker')}
${extractFn('plainMarker')}
${extractFn('isQuestionPromptLine')}
${extractFn('isFormulaLine')}
${extractFn('normalizeFormulaDisplay')}
${extractFn('isTableLikeLine')}
${extractFn('stripPdfNoise')}
${extractFn('normalizeReadableCharacters')}
${extractFn('splitKnownSectionHeadings')}
${extractFn('splitStructuralMarkers')}
function formatReadableText(text) {
  return splitStructuralMarkers(
    splitKnownSectionHeadings(
      normalizeReadableCharacters(stripPdfNoise(text)),
    ),
  );
}
`;

eval(functions);

const allSets = [...q.sets, ...c.sets];
let emptyBullets = [];

allSets.forEach(s => {
  s.questions.forEach(qn => {
    const text = qn.stem || "";
    const blocks = formatReadableText(text).split('\n');
    blocks.forEach(block => {
      block = block.trim();
      if (!block) return;
      // If block exactly matches a bullet marker, or starts with one and the rest is empty
      const firstToken = block.split(/\s+/)[0];
      if (isBulletMarker(firstToken) && block === firstToken) {
        emptyBullets.push(`${s.title} Q${qn.number || qn.id} : Empty bullet found`);
      }
    });
  });
});

console.log("Empty Bullets Found:");
console.log(emptyBullets.join('\n'));

// Let's specifically print D 22 parsed blocks
const d22 = q.sets.find(s=>s.title==='샘플문제 D').questions.find(qn=>qn.number===22);
console.log("\\nD 22 Blocks:");
formatReadableText(d22.stem).split('\n').forEach((b, i) => console.log(`[${i}] ${b}`));
