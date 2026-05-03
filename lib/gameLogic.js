const { GAME_CONFIG } = require('./config');

const FORBIDDEN_WORDS = GAME_CONFIG.forbiddenWords;
const VALID_QUESTION_SETS = new Set(GAME_CONFIG.validQuestionSets);

function normalize(str) {
  return String(str || '').toLowerCase().replace(/\u0142/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function matchAnswer(input, answers, revealedIdxs = []) {
  const normInput = normalize(input);
  if (!normInput) return -1;
  const revealed = new Set(revealedIdxs);

  for (let i = 0; i < answers.length; i++) {
    if (revealed.has(i)) continue;
    const normAnswer = normalize(answers[i].text);

    if (normAnswer === normInput) return i;

    if (normInput.length >= 3 && (normAnswer.startsWith(normInput) || normAnswer.split(' ').some(w => w.startsWith(normInput)))) return i;

    if (normInput.length >= 3) {
      const threshold = Math.min(2, Math.max(1, Math.floor(Math.min(normInput.length, normAnswer.length) * 0.25)));
      const dist = levenshtein(normInput, normAnswer);

      if (dist <= threshold) {
        if (dist === 2 && normInput[0] !== normAnswer[0]) continue;
        return i;
      }
    }
  }
  return -1;
}

function sortPlayersArray(playersArr) {
  return [...playersArr].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    for (let pts = 1000; pts >= 100; pts -= 100) {
      const aC = a.pointsHistory ? (a.pointsHistory[pts] || 0) : 0;
      const bC = b.pointsHistory ? (b.pointsHistory[pts] || 0) : 0;
      if (aC !== bC) return bC - aC;
    }
    return 0;
  });
}

function sanitizePlayerName(rawName) {
  if (typeof rawName !== 'string') return { ok: false, error: 'Nieprawidlowa nazwa gracza.' };
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: 'Podaj nazwe gracza.' };
  if (name.length > 20) return { ok: false, error: 'Nazwa moze miec maksymalnie 20 znakow.' };
  const lowerName = name.toLowerCase();
  if (FORBIDDEN_WORDS.some(word => lowerName.includes(word))) {
    return { ok: false, error: 'To bardzo nie?adna nazwa. Nie mozesz takiej ustawic!' };
  }
  return { ok: true, name };
}

function sanitizeAnswer(rawAnswer) {
  if (typeof rawAnswer !== 'string') return null;
  const answer = rawAnswer.trim().replace(/\s+/g, ' ');
  if (!answer || answer.length > 80) return null;
  return answer;
}

function isValidQuestionSet(setId) {
  return VALID_QUESTION_SETS.has(setId);
}

function serializePlayer(player, { revealLiar = false } = {}) {
  const payload = {
    name: player.name,
    score: player.score,
    connected: player.connected,
    wrongAnswers: player.wrongAnswers,
    powerupUsed: player.powerupUsed,
    pointsSinceLastVote: player.pointsSinceLastVote
  };
  if (revealLiar) payload.isLiar = player.isLiar;
  return payload;
}

function getValidVoteTargets({ phase, playerName, votedName, players, top2 = [] }) {
  if (phase === 'finalVoting') {
    if (top2.includes(playerName)) return [];
    return top2.filter(name => players[name]);
  }
  if (phase === 'voting') {
    const targets = Object.keys(players).filter(name => name !== playerName);
    targets.push('ABSTAIN');
    return targets;
  }
  return [];
}

function validateVote({ phase, playerName, votedName, players, top2 = [] }) {
  if (!['voting', 'finalVoting'].includes(phase)) return { ok: false, error: 'Glosowanie nie jest aktywne.' };
  if (!players[playerName]) return { ok: false, error: 'Nie znaleziono gracza.' };
  if (typeof votedName !== 'string') return { ok: false, error: 'Nieprawidlowy glos.' };
  const targets = getValidVoteTargets({ phase, playerName, votedName, players, top2 });
  if (!targets.includes(votedName)) return { ok: false, error: 'Nie mozesz odda? takiego g?osu.' };
  return { ok: true };
}

function resolveAccused(votes) {
  const tally = {};
  Object.values(votes).forEach(vName => {
    if (vName !== 'ABSTAIN') tally[vName] = (tally[vName] || 0) + 1;
  });

  let maxVotes = 0;
  let accusedName = null;
  let isTie = false;

  for (const [name, count] of Object.entries(tally)) {
    if (count > maxVotes) {
      maxVotes = count;
      accusedName = name;
      isTie = false;
    } else if (count === maxVotes) {
      isTie = true;
    }
  }

  if (isTie) accusedName = null;
  return { tally, maxVotes, accusedName, isTie };
}

function applyVotingResults(gameState) {
  const { maxVotes, accusedName } = resolveAccused(gameState.votes);
  const changes = {};
  const liarCaught = accusedName === gameState.liarName && maxVotes >= GAME_CONFIG.catchThreshold;
  const innocentCaught = accusedName !== null && accusedName !== gameState.liarName && accusedName !== 'ABSTAIN' && maxVotes >= GAME_CONFIG.catchThreshold;
  const isRound10 = gameState.currentRound === 10;
  let recovered = 0;
  const liarMultiplier = gameState.powerupsThisRound[gameState.liarName] ? GAME_CONFIG.powerupMultiplier : 1;

  if (liarCaught) {
    if (gameState.players[gameState.liarName]) {
      if (gameState.hiddenLiarPoints > 0) {
        gameState.players[gameState.liarName].score += gameState.hiddenLiarPoints;
        recovered = gameState.hiddenLiarPoints;
        changes[gameState.liarName] = recovered;
      }

      const penalty = Math.floor((gameState.players[gameState.liarName].pointsSinceLastVote || 0) * GAME_CONFIG.liarCaughtPenaltyFraction);
      gameState.players[gameState.liarName].score = Math.max(0, gameState.players[gameState.liarName].score - penalty);
      changes[gameState.liarName] = (changes[gameState.liarName] || 0) - penalty;
    }

    Object.entries(gameState.votes).forEach(([voterName, votedFor]) => {
      if (votedFor === gameState.liarName && voterName !== gameState.liarName && gameState.players[voterName]) {
        const mult = gameState.powerupsThisRound[voterName] ? GAME_CONFIG.powerupMultiplier : 1;
        gameState.players[voterName].score += GAME_CONFIG.correctVotePoints * mult;
        changes[voterName] = GAME_CONFIG.correctVotePoints * mult;
      }
    });

    gameState.hiddenLiarPoints = 0;
  } else if (innocentCaught) {
    Object.entries(gameState.votes).forEach(([voterName, votedFor]) => {
      if (votedFor === accusedName && gameState.players[voterName]) {
        const mult = gameState.powerupsThisRound[voterName] ? GAME_CONFIG.powerupMultiplier : 1;
        gameState.players[voterName].score = Math.max(0, gameState.players[voterName].score - GAME_CONFIG.wrongAccusationPenalty * mult);
        changes[voterName] = -GAME_CONFIG.wrongAccusationPenalty * mult;
      }
    });
    gameState.hiddenLiarPoints += GAME_CONFIG.hiddenLiarReward * liarMultiplier;
  }

  if (isRound10 && gameState.hiddenLiarPoints > 0 && !liarCaught) {
    if (gameState.players[gameState.liarName]) {
      gameState.players[gameState.liarName].score += gameState.hiddenLiarPoints;
      recovered = gameState.hiddenLiarPoints;
      changes[gameState.liarName] = (changes[gameState.liarName] || 0) + recovered;
    }
    gameState.hiddenLiarPoints = 0;
  }

  return { accusedName, maxVotes, liarCaught, innocentCaught, recovered, changes };
}

module.exports = {
  FORBIDDEN_WORDS,
  normalize,
  levenshtein,
  matchAnswer,
  sortPlayersArray,
  sanitizePlayerName,
  sanitizeAnswer,
  isValidQuestionSet,
  serializePlayer,
  validateVote,
  resolveAccused,
  applyVotingResults
};
