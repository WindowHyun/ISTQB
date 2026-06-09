const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="questionStem"></div></body></html>');
global.document = dom.window.document;
global.window = dom.window;
const fs = require('fs');

let script = fs.readFileSync('script.js', 'utf8');
script = script.replace('document.addEventListener("DOMContentLoaded", () => {', 'window.buildRichBlocks = buildRichBlocks; window.renderRichText = renderRichText;');
script = script.replace(/}\);\s*$/, '');

eval(script);

const data = JSON.parse(fs.readFileSync('public/data/csts/csts-example-answer-included.json', 'utf8'));
const q = data.questions.find(x => x.number === 26);
const blocks = window.buildRichBlocks(q.stem);
console.log("Q26 blocks:");
console.log(JSON.stringify(blocks, null, 2));

const target = document.getElementById("questionStem");
window.renderRichText(target, q.stem, { plainContent: true });
console.log("HTML:", target.innerHTML);
