const test = require('node:test');
const assert = require('node:assert/strict');
const { getVotingStatus, resolveFinalWinner, tallyFinalVotes, sanitizeLiarHistory, sanitizeEventLog } = require('../lib/gameFlow');
const { getQuestions, getQuestionSetIds, validateQuestionSet } = require('../lib/questions');

test('getVotingStatus reports missing regular votes', () => {
  const state = {
    phase: 'voting',
    votes: { Ala: 'Ola' },
    players: {
      Ala: { name: 'Ala', connected: true },
      Ola: { name: 'Ola', connected: true },
      Jan: { name: 'Jan', connected: false }
    },
    top2: []
  };

  assert.deepEqual(getVotingStatus(state), {
    eligibleVoters: ['Ala', 'Ola'],
    votedNames: ['Ala'],
    missingVotes: ['Ola'],
    voteCount: 1,
    expectedVoteCount: 2
  });
});

test('getVotingStatus excludes finalists from final voting', () => {
  const state = {
    phase: 'finalVoting',
    votes: { Jan: 'Ala' },
    top2: ['Ala', 'Ola'],
    players: {
      Ala: { name: 'Ala', connected: true },
      Ola: { name: 'Ola', connected: true },
      Jan: { name: 'Jan', connected: true },
      Ewa: { name: 'Ewa', connected: true }
    }
  };

  const status = getVotingStatus(state);
  assert.deepEqual(status.eligibleVoters, ['Jan', 'Ewa']);
  assert.deepEqual(status.missingVotes, ['Ewa']);
});

test('final tally and winner prefer fewer accusations, then points on tie', () => {
  const top2 = ['Ala', 'Ola'];
  const tally = tallyFinalVotes({ Jan: 'Ala', Ewa: 'Ola' }, top2);
  assert.deepEqual(tally, { Ala: 1, Ola: 1 });

  const result = resolveFinalWinner({
    top2,
    tally,
    players: { Ala: { score: 1200 }, Ola: { score: 900 } }
  });
  assert.deepEqual(result, { winnerName: 'Ala', tieResolvedByPoints: true });
});

test('question loader exposes JSON sets and returns clones', () => {
  assert.deepEqual(getQuestionSetIds(), ['set1', 'set2', 'set3', 'set4', 'set5', 'test']);
  const first = getQuestions('set1');
  const second = getQuestions('set1');
  first[0].answers[0].text = 'MUTATED';
  assert.notEqual(second[0].answers[0].text, 'MUTATED');
  assert.equal(getQuestions('unknown').length, 11);
});

test('all playable JSON question sets have enough final-round data', () => {
  for (const setId of getQuestionSetIds()) {
    const validation = validateQuestionSet(getQuestions(setId));
    assert.equal(validation.ok, true, `${setId}: ${validation.errors.join(', ')}`);
  }
});

test('sanitizeLiarHistory hides uncaught liar names from player payloads', () => {
  const history = [
    { round: 2, liarName: 'Ala', caught: false, accusedName: 'Ola' },
    { round: 4, liarName: 'Jan', caught: true, accusedName: 'Jan' },
    { round: 11, liarName: 'Ola', caught: false, accusedName: null }
  ];

  assert.deepEqual(sanitizeLiarHistory(history), [
    { round: 2, liarName: null, caught: false, accusedName: 'Ola' },
    { round: 4, liarName: 'Jan', caught: true, accusedName: 'Jan' },
    { round: 11, liarName: 'Ola', caught: false, accusedName: null }
  ]);
});

test('sanitizeEventLog removes private details from player payloads', () => {
  const events = [
    { message: 'Klamczuch nie zostal wykryty.', details: { changes: { Ala: 500 } }, sensitive: true, publicMessage: 'Klamczuch nie zostal wykryty.' },
    { message: 'Start rundy.', details: { questionId: 1 } }
  ];

  assert.deepEqual(sanitizeEventLog(events), [
    { message: 'Klamczuch nie zostal wykryty.', details: {}, sensitive: true, publicMessage: 'Klamczuch nie zostal wykryty.' },
    { message: 'Start rundy.', details: {} }
  ]);
});
