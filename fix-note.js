const fs = require('fs');
let script = fs.readFileSync('script.js', 'utf8');

const oldPlainBlock = `        if (block.type === "table") {`;
const newPlainBlock = `        if (block.type === "note") {
          const noteNode = document.createElement("span");
          noteNode.className = "text-line note-line";
          noteNode.textContent = block.text;
          target.appendChild(noteNode);
          return;
        }
        if (block.type === "table") {`;

script = script.replace(oldPlainBlock, newPlainBlock);
script = script.replace('className: block.type === "note" ? "note-line" : "",', 'className: "",');

fs.writeFileSync('script.js', script);
console.log('script.js patched for note block');
