const fs = require('fs');

let script = fs.readFileSync('script.js', 'utf8');

// 1. Fix parseStructuredItem
const oldParse = `/^(\\d+\\.|\\(\\d+\\)|[A-E]\\.|[a-e]\\)|(?:viii|vii|vi|iv|iii|ii|ix|x|v|i)\\.|[\\u2022\\uF06C\\uF0A1\\uF0A7\\uF0B7])\\s*(.+)$/i`;
const newParse = `/^(\\d+\\.(?!\\d)|\\(\\d+\\)|[A-E]\\.|[a-e]\\)|(?:viii|vii|vi|iv|iii|ii|ix|x|v|i)\\.|[\\u2022\\uF06C\\uF0A1\\uF0A7\\uF0B7])\\s*(.+)$/i`;
script = script.replace(oldParse, newParse);

// 2. Fix normalizeReadableCharacters
const oldRegex = `/([가-힣a-zA-Z0-9])\\s*(?:등(?:과|이|은)?\\s*)?(\\([^)]+\\))\\s*(?=[가-힣A-Z\\[<“"‘'])/g`;
const newRegex = `/([가-힣a-zA-Z0-9])\\s*(?:등(?:과|이|은)?\\s*)?(\\([^)=]+\\))\\s*(?=[가-힣A-Z\\[<“"‘'])/g`;
script = script.replace(oldRegex, newRegex);

fs.writeFileSync('script.js', script);
console.log('Fixed regex in script.js');
