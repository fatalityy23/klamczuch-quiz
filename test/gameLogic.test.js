const test = require('node:test');
const assert = require('node:assert/strict');
const {
  matchAnswer,
  sanitizeAnswer,
  sanitizePlayerName,
  serializePlayer,
  validateVote,
  resolveAccused,
  applyVotingResults,
  sortPlayersArray
} = require('../lib/gameLogic');

test('matchAnswer accepts exact, accent-insensitive and close answers', () => {
  const answers = [{ text: 'Ladowarka', points: 300 }, { text: 'Spider-Man', points: 200 }];
  assert.equal(matchAnswer('ladowarka', answers, []), 0);
  assert.equal(matchAnswer('spider man', answers, []), 1);
  assert.equal(matchAnswer('ladwarka', answers, []), 0);
});

test('matchAnswer skips revealed answers and rejects empty input', () => {
  const answers = [{ text: 'Telefon', points: 100 }, { text: 'Pilot', points: 700 }];
  assert.equal(matchAnswer('telefon', answers, [0]), -1);
  assert.equal(matchAnswer('', answers, []), -1);
});

test('input sanitizers reject invalid names and oversized answers', () => {
  assert.equal(sanitizePlayerName('  Ala   Kot  ').name, 'Ala Kot');
  assert.equal(sanitizePlayerName('cwel123').ok, false);
  assert.equal(sanitizeAnswer('  dobra   odpowied? ').length > 0, true);
  assert.equal(sanitizeAnswer('x'.repeat(81)), null);
});

test('serializePlayer hides liar flag unless explicitly requested', () => {
  const player = { name: 'Ala', score: 10, connected: true, isLiar: true, wrongAnswers: 0, powerupUsed: false, pointsSinceLastVote: 0 };
  assert.equal(Object.hasOwn(serializePlayer(player), 'isLiar'), false);
  assert.equal(serializePlayer(player, { revealLiar: true }).isLiar, true);
});

test('validateVote blocks finalist votes and invalid targets', () => {
  const players = { A: {}, B: {}, C: {} };
  assert.equal(validateVote({ phase: 'finalVoting', playerName: 'A', votedName: 'B', players, top2: ['A', 'B'] }).ok, false);
  assert.equal(validateVote({ phase: 'finalVoting', playerName: 'C', votedName: 'B', players, top2: ['A', 'B'] }).ok, true);
  assert.equal(validateVote({ phase: 'voting', playerName: 'A', votedName: 'A', players }).ok, false);
  assert.equal(validateVote({ phase: 'voting', playerName: 'A', votedName: 'ABSTAIN', players }).ok, true);
});

test('resolveAccused requires unique top vote target', () => {
  assert.deepEqual(resolveAccused({ A: 'B', C: 'B', D: 'A' }).accusedName, 'B');
  assert.equal(resolveAccused({ A: 'B', C: 'D' }).accusedName, null);
});

test('applyVotingResults rewards correct voters and changes liar after catch context', () => {
  const state = {
    currentRound: 2,
    liarName: 'B',
    votes: { A: 'B', C: 'B', D: 'B' },
    powerupsThisRound: { A: true },
    hiddenLiarPoints: 0,
    players: {
      A: { score: 100, pointsSinceLastVote: 100 },
      B: { score: 1000, pointsSinceLastVote: 400 },
      C: { score: 100, pointsSinceLastVote: 100 },
      D: { score: 100, pointsSinceLastVote: 100 }
    }
  };
  const result = applyVotingResults(state);
  assert.equal(result.liarCaught, true);
  assert.equal(state.players.B.score, 800);
  assert.equal(state.players.A.score, 1100);
  assert.equal(state.players.C.score, 600);
});

test('sortPlayersArray uses score and high-value answer tiebreakers', () => {
  const sorted = sortPlayersArray([
    { name: 'A', score: 500, pointsHistory: { 100: 5 } },
    { name: 'B', score: 500, pointsHistory: { 1000: 1 } },
    { name: 'C', score: 900, pointsHistory: {} }
  ]);
  assert.deepEqual(sorted.map(p => p.name), ['C', 'B', 'A']);
});
