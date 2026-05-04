function getEligibleVoters(gameState) {
  if (gameState.phase === 'finalVoting') {
    return Object.values(gameState.players)
      .filter(p => p.connected && !gameState.top2.includes(p.name))
      .map(p => p.name);
  }

  if (gameState.phase === 'voting') {
    return Object.values(gameState.players)
      .filter(p => p.connected)
      .map(p => p.name);
  }

  return [];
}

function getVotingStatus(gameState) {
  const eligibleVoters = getEligibleVoters(gameState);
  const votedNames = Object.keys(gameState.votes || {}).filter(name => eligibleVoters.includes(name));
  const missingVotes = eligibleVoters.filter(name => !gameState.votes[name]);

  return {
    eligibleVoters,
    votedNames,
    missingVotes,
    voteCount: votedNames.length,
    expectedVoteCount: eligibleVoters.length
  };
}

function resolveFinalWinner({ top2, players, tally }) {
  const p1 = top2[0];
  const p2 = top2[1];
  let winnerName = null;
  let tieResolvedByPoints = false;

  if (tally[p1] < tally[p2]) {
    winnerName = p1;
  } else if (tally[p2] < tally[p1]) {
    winnerName = p2;
  } else {
    tieResolvedByPoints = true;
    winnerName = players[p1].score > players[p2].score ? p1 : p2;
  }

  return { winnerName, tieResolvedByPoints };
}

function tallyFinalVotes(votes, top2) {
  const tally = {};
  top2.forEach(name => { tally[name] = 0; });

  Object.values(votes).forEach(vName => {
    if (vName !== 'ABSTAIN' && tally[vName] !== undefined) tally[vName]++;
  });

  return tally;
}

function sanitizeLiarHistory(history = [], { revealAll = false } = {}) {
  return history.map(item => {
    if (revealAll || item.caught || item.round === 11) return { ...item };
    return { ...item, liarName: null };
  });
}

function sanitizeEventLog(events = [], { revealSensitive = false } = {}) {
  if (revealSensitive) return events.map(event => ({ ...event }));
  return events.map(event => {
    if (!event.sensitive) return { ...event, details: {} };
    return {
      ...event,
      message: event.publicMessage || 'Ukryte zdarzenie.',
      details: {}
    };
  });
}

module.exports = {
  getEligibleVoters,
  getVotingStatus,
  resolveFinalWinner,
  tallyFinalVotes,
  sanitizeLiarHistory,
  sanitizeEventLog
};
