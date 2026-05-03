const questionSets = require('../data/questions.json');

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

module.exports = {
  getQuestions,
  getQuestionSetIds,
  testQuestions
};
