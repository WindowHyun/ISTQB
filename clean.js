const fs = require('fs');
let code = fs.readFileSync('www/script.js', 'utf8');

// Remove DOM variables
code = code.replace(/const cstsPage = document\.querySelector\("#cstsPage"\);\n/g, '');
code = code.replace(/const cstsBackBtn[\s\S]*?const cstsNextBtn = document\.querySelector\("#cstsNextBtn"\);\n/g, '');

// Remove cstsState
code = code.replace(/const cstsState = {[\s\S]*?};\n/g, '');

// Remove functions
code = code.replace(/function currentCstsSet\(\) {[\s\S]*?}\n/g, '');
code = code.replace(/function renderCstsSelect\(\) {[\s\S]*?}\n/g, '');
code = code.replace(/function renderCstsFigure\(question\) {[\s\S]*?}\n/g, '');
code = code.replace(/function renderCstsOptions\(question\) {[\s\S]*?}\n/g, '');
code = code.replace(/function renderCstsPage\(\) {[\s\S]*?}\n/g, '');

// Remove event listeners
code = code.replace(/cstsBackBtn\?\.addEventListener\("click", \(\) => {[\s\S]*?}\);\n/g, '');
code = code.replace(/cstsSetSelect\?\.addEventListener\("change", \(\) => {[\s\S]*?}\);\n/g, '');
code = code.replace(/cstsPrevBtn\?\.addEventListener\("click", \(\) => {[\s\S]*?}\);\n/g, '');
code = code.replace(/cstsNextBtn\?\.addEventListener\("click", \(\) => {[\s\S]*?}\);\n/g, '');

// Remove cstsPage from showActiveProductApp
code = code.replace(/cstsPage\?\.classList\.add\("is-product-hidden"\);\n/g, '');
code = code.replace(/cstsPage\?\.setAttribute\("hidden", ""\);\n/g, '');
code = code.replace(/        \n        \n/g, '');

fs.writeFileSync('www/script.js', code);
