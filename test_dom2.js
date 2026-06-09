const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;
const fs = require('fs');

const script = fs.readFileSync('script.js', 'utf8');
eval(script);

const data = JSON.parse(fs.readFileSync('public/data/csts/csts-example-answer-included.json', 'utf8'));
const q = data.questions.find(x => x.number === 26);
const blocks = buildRichBlocks(q.stem);
console.log("Q26 blocks:");
console.log(JSON.stringify(blocks, null, 2));

const cstsData = JSON.parse(fs.readFileSync('public/data/csts/csts-2404-fl.json', 'utf8'));
const q24 = cstsData.questions.find(x => x.number === 24);
console.log("Q24 options:");
console.log(JSON.stringify(q24.options, null, 2));
