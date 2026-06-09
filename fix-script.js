const fs = require('fs');
let script = fs.readFileSync('script.js', 'utf8');

// 1. Fix gradeBtn pushing empty historyAnswers
script = script.replace(
  'if (key.includes(`-${targetMode}-`)) {',
  'if (key.endsWith(`-${targetMode}`) || key.includes(`-${targetMode}-`)) {'
);

// 2. Fix historyWrongNoteItems using legacy key format
const oldKeyLogic = 'const ansKey = `${question.setId || history.setId}-${history.mode}-${question.number}`;';
const newKeyLogic = 'const ansKey = answerKey(question, history.mode);';
script = script.replace(oldKeyLogic, newKeyLogic);

// 3. Fix sameChoices check in historyWrongNoteItems.
// If selected is [], but question.answer is NOT [], sameChoices returns false. This is correct.
// However, I noticed that `question` in `historyWrongNoteItems` might not have `id` if it was cloned?
// No, the question is just from `data.sets.find(...)`. So it's the exact object, and it has `.id`.

fs.writeFileSync('script.js', script);
console.log('script.js patched');
