const fs = require('fs');

let css = fs.readFileSync('style.css', 'utf8');
css = css.replace(/\/\*[\s\S]*?\*\//g, (match) => {
  if (match.includes('──') || match.includes('Settings')) return match;
  return '';
});
css = css.replace(/\n\s*\n\s*\n/g, '\n\n');
fs.writeFileSync('style.css', css.trim() + '\n');
console.log('Cleaned style.css');

let js = fs.readFileSync('script.js', 'utf8');
// remove commented lines starting with // that aren't JSDoc or within code lines
js = js.replace(/^\s*\/\/.*$/gm, (match) => {
  if (match.includes('TODO') || match.includes('FIXME')) return match;
  return '';
});
// remove multiple empty lines
js = js.replace(/\n\s*\n\s*\n/g, '\n\n');
fs.writeFileSync('script.js', js.trim() + '\n');
console.log('Cleaned script.js');
