const path = require('path');

const QUESTIONS_PATH = path.join(__dirname, '..', 'data', 'questions.json');
let questionSets = require(QUESTIONS_PATH);
const { GAME_CONFIG } = require('./config');

function testQuestions() {
  const q = [];
  for (let i = 1; i <= 11; i++) {
    q.push({
      text: `[TEST] Pytanie testowe ${i}`,
      answers: [
        { text: 'J', points: 1000 }, { text: 'I', points: 900 }, { text: 'H', points: 800 },
        { text: 'G', points: 700 }, { text: 'F', points: 600 }, { text: 'E', points: 500 },
        { text: 'D', points: 400 }, { text: 'C', points: 300 }, { text: 'B', points: 200 }, { text: 'A', points: 100 }
      ]
    });
  }
  return q;
}

function cloneQuestions(questions) {
  return JSON.parse(JSON.stringify(questions));
}

function getQuestions(setId) {
  if (setId === 'test') return testQuestions();
  return cloneQuestions(questionSets[setId] || questionSets.set1);
}

function getQuestionSetIds() {
  return [...Object.keys(questionSets), 'test'];
}

function reloadQuestionSets() {
  delete require.cache[require.resolve(QUESTIONS_PATH)];
  questionSets = require(QUESTIONS_PATH);
  return questionSets;
}

function validateQuestionSet(questions, options = {}) {
  const requiredQuestionCount = options.requiredQuestionCount || GAME_CONFIG.requiredQuestionCount;
  const requiredAnswersPerQuestion = options.requiredAnswersPerQuestion || GAME_CONFIG.requiredAnswersPerQuestion;
  const errors = [];

  if (!Array.isArray(questions)) {
    return { ok: false, errors: ['Zestaw musi byc tablica pytan.'] };
  }

  if (questions.length < requiredQuestionCount) {
    errors.push(`Zestaw ma ${questions.length} pytan, wymagane minimum to ${requiredQuestionCount}.`);
  }

  questions.forEach((question, index) => {
    const label = `Pytanie ${index + 1}`;
    if (!question || typeof question.text !== 'string' || !question.text.trim()) {
      errors.push(`${label}: brakuje tresci pytania.`);
    }

    if (!Array.isArray(question?.answers) || question.answers.length < requiredAnswersPerQuestion) {
      errors.push(`${label}: wymagane jest minimum ${requiredAnswersPerQuestion} odpowiedzi.`);
      return;
    }

    question.answers.forEach((answer, answerIndex) => {
      if (!answer || typeof answer.text !== 'string' || !answer.text.trim()) {
        errors.push(`${label}, odpowiedz ${answerIndex + 1}: brakuje tekstu.`);
      }
      if (!Number.isFinite(Number(answer?.points))) {
        errors.push(`${label}, odpowiedz ${answerIndex + 1}: punkty musza byc liczba.`);
      }
      if (answer?.aliases !== undefined && !Array.isArray(answer.aliases)) {
        errors.push(`${label}, odpowiedz ${answerIndex + 1}: aliases musi byc tablica tekstow.`);
      }
    });
  });

  return { ok: errors.length === 0, errors };
}

module.exports = {
  getQuestions,
  getQuestionSetIds,
  testQuestions,
  validateQuestionSet,
  reloadQuestionSets
};
