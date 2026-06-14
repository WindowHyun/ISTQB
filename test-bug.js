const fs = require('fs');

const d = JSON.parse(fs.readFileSync('./www/data/istqb/sample-a.json', 'utf8'));
const q = d.questions[0];

const state = {
  mode: "exam",
  setId: "sample-a",
  answers: {},
  reviewIds: {},
  examGraded: {}
};

function answerKey(question, mode) {
  if (question.id) return `${question.id}-${mode}`;
  return 'legacy';
}

function answerMode() { return state.mode === "review" ? "exam" : state.mode; }

function selectedFor(question, mode = answerMode()) {
  const current = answerKey(question, mode);
  return state.answers[current] || [];
}

function sameChoices(left, right) {
  return [...left].sort().join(",") === [...right].sort().join(",");
}

function isCorrect(question, mode = answerMode()) {
  return sameChoices(selectedFor(question, mode), question.answer);
}

// simulate user answering question 0 correctly
state.answers[answerKey(q, 'exam')] = ['c'];

console.log("Before Grade - isCorrect:", isCorrect(q, "exam"));

// Grade!
const missedExamQuestions = () => d.questions.filter(q => !isCorrect(q, "exam"));
state.examGraded[state.setId] = true;
state.reviewIds[state.setId] = missedExamQuestions().map(q => q.number);

console.log("Missed questions count:", state.reviewIds[state.setId].length);

// Switch to review mode!
state.mode = "review";

// reviewRetake is false initially
const isReviewRetake = false;

function currentQuestions() {
  const questions = d.questions;
  if (state.mode !== "review") return questions;
  if (!state.examGraded[state.setId]) return [];
  if (isReviewRetake) {
    const ids = state.reviewIds[state.setId] || [];
    return questions.filter((question) => ids.includes(question.number));
  }
  return questions.filter((question) => !isCorrect(question, "exam"));
}

console.log("Review mode current questions:", currentQuestions().length);
