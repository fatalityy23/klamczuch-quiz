const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const {
  matchAnswer,
  sortPlayersArray,
  sanitizePlayerName,
  sanitizeAnswer,
  isValidQuestionSet,
  serializePlayer,
  validateVote,
  applyVotingResults
} = require('./lib/gameLogic');
const { getQuestions } = require('./lib/questions');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const VOTING_ROUNDS = [2, 4, 6, 8, 10];

let gameState = {
  phase: 'lobby',
  players: {},
  adminSocketId: null,
  questions: getQuestions('set1'),
  currentRound: 0,
  totalRounds: 11,
  roundData: null,
  liarName: null,
  previousLiarName: null, 
  votes: {},
  votingTimeLeft: 0,
  votingInterval: null,
  roundOrder: [],
  currentTurnIndex: 0,
  turnInterval: null,
  turnTimeLeft: 0,
  revealTimer: null,
  usedQuestions: [],
  liarHistory: [],
  lastWrongAnswer: null,
  top2: [],
  r11Turns: 0,
  speechPlayerName: null,
  isPaused: false,
  lastVotingChanges: {},
  lastVoteScores: {},
  powerupsThisRound: {}, 
  isAnswerLocked: false,
  hiddenLiarPoints: 0,
  lastRecoveredPoints: 0,
  endReason: null,
  finalVotes: null,   
  finalTally: null,
  rulesUnderstood: {},
  
  battlingPlayers: [],
  disqualifiedFromBattle: [],
  spectators: [],
  finalScenario: null,
  finalWinner: null,
  finalTieResolved: false
};

let globalTransitionInterval = null;

function clearTransitions() {
  if (globalTransitionInterval) clearInterval(globalTransitionInterval);
  io.emit('globalCountdown', { timeLeft: 0 });
}

function runTransition(seconds, callback) {
  clearTransitions();
  let t = seconds;
  io.emit('globalCountdown', { timeLeft: t });
  globalTransitionInterval = setInterval(() => {
    if (gameState.isPaused) return;
    t--;
    if (t > 0) {
      io.emit('globalCountdown', { timeLeft: t });
    } else {
      clearTransitions();
      callback();
    }
  }, 1000);
}

function getPlayerList(options = {}) {
  return sortPlayersArray(Object.values(gameState.players)).map(p => serializePlayer(p, options));
}

function broadcastState() {
  const isVotingNext = VOTING_ROUNDS.includes(gameState.currentRound);
  const showDelta = (isVotingNext && gameState.currentRound > 2) || gameState.phase === 'finalSummary' || gameState.phase === 'voting' || gameState.phase === 'finalVoting';

  const base = {
    phase: gameState.phase,
    players: getPlayerList(),
    currentRound: gameState.currentRound,
    totalRounds: gameState.totalRounds,
    liarHistory: gameState.liarHistory,
    isPaused: gameState.isPaused,
    lastVotingChanges: gameState.lastVotingChanges,
    lastRecoveredPoints: gameState.lastRecoveredPoints,
    endReason: gameState.endReason,
    rulesUnderstood: gameState.rulesUnderstood,
    lastVoteScores: gameState.lastVoteScores,
    isVotingNext: isVotingNext,
    showDelta: showDelta,
    
    battlingPlayers: gameState.battlingPlayers,
    disqualifiedFromBattle: gameState.disqualifiedFromBattle,
    spectators: gameState.spectators
  };

  if (gameState.roundData) {
    base.questionText = gameState.roundData.questionText;
    base.revealedAnswers = gameState.roundData.revealedAnswers;
    base.wrongAnswersList = gameState.roundData.wrongAnswersList;
    base.answerCount = gameState.roundData.answers.length;
    base.roundOrder = gameState.roundOrder;
    base.currentTurnIndex = gameState.currentTurnIndex;
    base.currentPlayerName = gameState.roundOrder[gameState.currentTurnIndex] || null;
    base.top2 = gameState.top2;
  }

  if (['roundSummary', 'scoreboard', 'voting', 'votingResults', 'revealingAnswers'].includes(gameState.phase) && gameState.roundData) {
    base.allAnswers = gameState.roundData.answers;
  }

  if (['voting', 'votingResults', 'preFinal', 'finalVoting'].includes(gameState.phase)) {
    base.votingTimeLeft = gameState.votingTimeLeft;
  }

  if (['votingResults', 'finalSummary'].includes(gameState.phase)) {
    base.votes = gameState.votes;
    base.powerupsThisRound = gameState.powerupsThisRound;
  }

  if (gameState.phase === 'finalSummary') {
    base.finalScenario = gameState.finalScenario;
    base.finalWinner = gameState.finalWinner;
    base.finalTieResolved = gameState.finalTieResolved;
    base.finalVotes = gameState.finalVotes;
    base.finalTally = gameState.finalTally;
  }
  
  if (gameState.phase === 'speeches') {
    base.speechPlayerName = gameState.speechPlayerName;
    base.votingTimeLeft = gameState.votingTimeLeft;
  }

  Object.values(gameState.players).forEach(player => {
    if (!player.connected || !player.socketId) return;
    const payload = { ...base, myName: player.name, myPowerupUsed: player.powerupUsed };
    if (player.isLiar && gameState.roundData && ['round', 'revealingAnswers', 'roundSummary', 'scoreboard', 'battlePrep', 'battle'].includes(gameState.phase)) {
      payload.liarAnswers = gameState.roundData.answers;
    }
    io.to(player.socketId).emit('state', payload);
  });

  if (gameState.adminSocketId) {
    const adminPayload = { ...base, players: getPlayerList({ revealLiar: true }), votes: gameState.votes, powerupsThisRound: gameState.powerupsThisRound, allAnswers: gameState.roundData?.answers, liarName: gameState.liarName, lastWrongAnswer: gameState.lastWrongAnswer, finalScenario: gameState.finalScenario, finalWinner: gameState.finalWinner, finalTieResolved: gameState.finalTieResolved, finalVotes: gameState.finalVotes, finalTally: gameState.finalTally };
    io.to(gameState.adminSocketId).emit('state', adminPayload);
  }
}

function startTurnTimer() {
  clearTransitions();
  clearInterval(gameState.turnInterval);
  gameState.isAnswerLocked = false;
  
  if (gameState.isPaused) {
    setTimeout(startTurnTimer, 1000);
    return;
  }

  const currentName = gameState.roundOrder[gameState.currentTurnIndex];
  if (!currentName) {
    startRoundSummary();
    return;
  }
  
  gameState.turnTimeLeft = gameState.currentTurnIndex === 0 ? 35 : 25;
  io.emit('timerStart', { duration: gameState.turnTimeLeft, phase: 'answer' });
  
  gameState.turnInterval = setInterval(() => {
    if (gameState.isPaused) return; 
    gameState.turnTimeLeft--;
    if (gameState.turnTimeLeft <= 0) {
      clearInterval(gameState.turnInterval);
      showNoAnswer(currentName);
    }
  }, 1000);
}

function showNoAnswer(playerName) {
  clearInterval(gameState.turnInterval);
  gameState.isAnswerLocked = true;
  io.emit('timerStart', { duration: 4, phase: 'reveal', correct: false, message: 'Czas minął! Brak odpowiedzi.' });
  gameState.revealTimer = setTimeout(() => { nextTurn(); }, 4000);
}

function startBattlePrep(battlers) {
    gameState.phase = 'battlePrep';
    gameState.battlingPlayers = battlers;
    gameState.disqualifiedFromBattle = [];
    gameState.spectators = Object.keys(gameState.players).filter(p => !battlers.includes(p));
    gameState.isAnswerLocked = true;

    broadcastState();

    io.emit('timerStart', { duration: 5, phase: 'battlePrep', message: 'Walka o 10. haslo! Przygotuj sie!' });

    runTransition(5, () => {
      if (gameState.phase === 'battlePrep') startBattle();
    });
}

function startBattle() {
    gameState.phase = 'battle';
    gameState.isAnswerLocked = false;
    gameState.turnTimeLeft = 25; 
    broadcastState();
    
    io.emit('timerStart', { duration: 25, phase: 'battle' });
    
    gameState.turnInterval = setInterval(() => {
        if (gameState.isPaused) return;
        gameState.turnTimeLeft--;
        if (gameState.turnTimeLeft <= 0) {
            clearInterval(gameState.turnInterval);
            startRoundSummary();
        }
    }, 1000);
}

function nextTurn() {
  if (gameState.isPaused) {
      setTimeout(nextTurn, 1000);
      return;
  }
  gameState.currentTurnIndex++;
  
  if (gameState.currentRound === 11) {
    if (gameState.currentTurnIndex >= 6 || gameState.roundData.revealedAnswers.length >= 10) {
        startRoundSummary();
    }
    else { broadcastState(); startTurnTimer(); }
    return;
  } 
  
  const remaining = [...new Set(gameState.roundOrder.slice(gameState.currentTurnIndex))];
  
  if (gameState.roundData.revealedAnswers.length === 9 && remaining.length > 0 && !['battlePrep', 'battle'].includes(gameState.phase)) {
      if (remaining.length === 1) {
      } else {
          startBattlePrep(remaining);
          return;
      }
  }

  if (gameState.currentTurnIndex >= gameState.roundOrder.length || gameState.roundData.revealedAnswers.length >= 10) startRoundSummary();
  else { broadcastState(); startTurnTimer(); }
}

function startRoundSummary() {
  gameState.phase = 'roundSummary';
  broadcastState();
  clearTransitions(); 
  
  let ticks = 3;
  function hiddenTick() {
     if (gameState.isPaused) { setTimeout(hiddenTick, 1000); return; }
     ticks--;
     if (ticks <= 0) startRevealSequence();
     else setTimeout(hiddenTick, 1000);
  }
  setTimeout(hiddenTick, 1000);
}

function startRevealSequence() {
  const rd = gameState.roundData;
  let unrevealed = rd.answers.map((a, i) => ({ ...a, index: i }))
    .filter(a => !rd.revealedAnswers.some(r => r.index === a.index))
    .sort((a, b) => a.points - b.points); 

  let step = 0;
  function revealNext() {
    if (gameState.isPaused) { setTimeout(revealNext, 1000); return; }
    if (step < unrevealed.length) {
      const currentAns = unrevealed[step];
      rd.revealedAnswers.push({ index: currentAns.index, text: currentAns.text, points: currentAns.points, byName: 'System' });
      broadcastState();
      step++;
      setTimeout(revealNext, 2000);
    } else {
      gameState.phase = 'scoreboard';
      broadcastState();
      runTransition(15, () => { postRoundRouting(); });
    }
  }
  revealNext();
}

function postRoundRouting() {
  if (gameState.currentRound === 11) {
    endRound11();
  } else if (VOTING_ROUNDS.includes(gameState.currentRound)) {
    startVoting();
  } else {
    startNextRound();
  }
}

function startVoting() {
  gameState.phase = 'voting';
  gameState.votes = {};
  gameState.powerupsThisRound = {}; 
  gameState.votingTimeLeft = 90;
  broadcastState();
  if (gameState.votingInterval) clearInterval(gameState.votingInterval);
  gameState.votingInterval = setInterval(() => {
    if (gameState.isPaused) return;
    gameState.votingTimeLeft--;
    io.emit('votingTimer', { timeLeft: gameState.votingTimeLeft });
    if (gameState.votingTimeLeft <= 0) {
      resolveVoting();
    }
  }, 1000);
}

function resolveVoting() {
  if (gameState.phase !== 'voting') return;
  clearInterval(gameState.votingInterval);
  gameState.phase = 'votingResults';

  const { accusedName, liarCaught, recovered, changes } = applyVotingResults(gameState);

  gameState.lastRecoveredPoints = recovered;
  gameState.lastVotingChanges = changes;
  gameState.liarHistory.push({ round: gameState.currentRound, liarName: gameState.liarName, caught: liarCaught, accusedName: accusedName || 'Brak' });

  if (liarCaught) {
    const previousLiar = gameState.liarName;
    Object.values(gameState.players).forEach(p => p.isLiar = false);
    gameState.liarName = pickNewLiar(previousLiar);
  }

  gameState.lastVoteScores = {};
  Object.values(gameState.players).forEach(p => {
      gameState.lastVoteScores[p.name] = p.score;
      p.pointsSinceLastVote = 0;
  });

  broadcastState();
  runTransition(12, () => {
    if (gameState.phase === 'votingResults') startNextRound();
  });
}

function pickNewLiar(excludeName, pool) {
  const names = pool || Object.keys(gameState.players).filter(n => n !== excludeName);
  const finalNames = names.length > 0 ? names : Object.keys(gameState.players);
  const chosen = finalNames[Math.floor(Math.random() * finalNames.length)];
  if (gameState.players[chosen]) gameState.players[chosen].isLiar = true;
  return chosen;
}

function startNextRound() {
  clearTransitions();
  if (gameState.currentRound >= gameState.totalRounds) return;
  
  gameState.currentRound++;
  gameState.lastVotingChanges = {};
  gameState.battlingPlayers = [];
  gameState.disqualifiedFromBattle = [];
  gameState.spectators = [];
  
  Object.values(gameState.players).forEach(p => p.wrongAnswers = 0);

  if (gameState.currentRound === 1) {
    Object.values(gameState.players).forEach(p => {
        p.isLiar = false;
        p.powerupUsed = false; 
        p.pointsSinceLastVote = 0; 
    });
    gameState.liarName = pickNewLiar(null);
    gameState.hiddenLiarPoints = 0;

    gameState.lastVoteScores = {};
    Object.values(gameState.players).forEach(p => { gameState.lastVoteScores[p.name] = 0; });
  }

  if (gameState.currentRound === 11) {
    gameState.phase = 'preFinal';
    gameState.rulesUnderstood = {}; 
    broadcastState();
    return;
  }

  const qIndex = gameState.currentRound - 1;
  const question = gameState.questions[qIndex] || gameState.questions[0];
  
  let baseOrder = sortPlayersArray(Object.values(gameState.players))
    .reverse() 
    .map(p => p.name);
    
  if (gameState.currentRound === 1) {
      for (let i = baseOrder.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [baseOrder[i], baseOrder[j]] = [baseOrder[j], baseOrder[i]];
      }
  }
    
  gameState.roundOrder = [...baseOrder, ...baseOrder];

  gameState.currentTurnIndex = 0;
  gameState.roundData = { questionText: question.text, answers: question.answers, revealedAnswers: [], wrongAnswersList: [] };
  gameState.phase = 'round';
  broadcastState();
  startTurnTimer();
}

function setupRound11() {
  const sorted = sortPlayersArray(Object.values(gameState.players));
  gameState.top2 = sorted.slice(0, 2).map(p => p.name);
  
  Object.values(gameState.players).forEach(p => p.isLiar = false);
  
  const scenarios = ['0_liars', '1_liar', '2_liars'];
  gameState.finalScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  
  if (gameState.finalScenario === '1_liar') {
      gameState.liarName = pickNewLiar(null, gameState.top2);
  } else if (gameState.finalScenario === '2_liars') {
      gameState.players[gameState.top2[0]].isLiar = true;
      gameState.players[gameState.top2[1]].isLiar = true;
      gameState.liarName = "Obaj"; 
  } else {
      gameState.liarName = null;
  }

  const qIndex = 10;
  const question = gameState.questions[qIndex];

  const starter = gameState.top2[1];
  const second = gameState.top2[0];
  
  gameState.roundOrder = [starter, second, starter, second, starter, second]; 
  gameState.currentTurnIndex = 0;
  gameState.roundData = { questionText: question.text, answers: question.answers, revealedAnswers: [], wrongAnswersList: [] };
  gameState.phase = 'round';
  broadcastState();
  startTurnTimer();
}

function endRound11() {
  gameState.phase = 'speeches';
  
  const sortedFinalists = sortPlayersArray([gameState.players[gameState.top2[0]], gameState.players[gameState.top2[1]]]);
  const firstSpeaker = sortedFinalists[0].name;
  
  gameState.speechPlayerName = firstSpeaker;
  gameState.votingTimeLeft = 45;
  broadcastState();

  if (gameState.votingInterval) clearInterval(gameState.votingInterval);
  
  gameState.votingInterval = setInterval(() => {
    if (gameState.isPaused) return;
    gameState.votingTimeLeft--;
    io.emit('votingTimer', { timeLeft: gameState.votingTimeLeft });
    
    if (gameState.votingTimeLeft <= 0) {
      const secondSpeaker = sortedFinalists[1].name;
      if (gameState.speechPlayerName === firstSpeaker) {
        gameState.speechPlayerName = secondSpeaker;
        gameState.votingTimeLeft = 45;
        broadcastState();
      } else {
        clearInterval(gameState.votingInterval);
        startFinalVoting();
      }
    }
  }, 1000);
}

function startFinalVoting() {
  gameState.phase = 'finalVoting';
  gameState.votes = {};
  gameState.votingTimeLeft = 45; 
  broadcastState();
  if (gameState.votingInterval) clearInterval(gameState.votingInterval);
  gameState.votingInterval = setInterval(() => {
    if (gameState.isPaused) return;
    gameState.votingTimeLeft--;
    io.emit('votingTimer', { timeLeft: gameState.votingTimeLeft });
    if (gameState.votingTimeLeft <= 0) {
      resolveFinalVoting();
    }
  }, 1000);
}

function resolveFinalVoting() {
  if (gameState.phase !== 'finalVoting') return;
  clearInterval(gameState.votingInterval);
  gameState.phase = 'finalSummary';
  gameState.endReason = 'normal_end'; 
  
  Object.values(gameState.players).forEach(p => {
      if (p.connected && !gameState.top2.includes(p.name)) {
          if (!gameState.votes[p.name]) {
              const randomChoice = gameState.top2[Math.floor(Math.random() * 2)];
              gameState.votes[p.name] = randomChoice;
          }
      }
  });

  const tally = {};
  gameState.top2.forEach(name => tally[name] = 0); 
  
  Object.values(gameState.votes).forEach(vName => {
    if(vName !== 'ABSTAIN' && tally[vName] !== undefined) tally[vName]++; 
  });
  
  const p1 = gameState.top2[0];
  const p2 = gameState.top2[1];

  let winnerName = null;
  let tieResolvedByPoints = false;
  if (tally[p1] < tally[p2]) {
      winnerName = p1;
  } else if (tally[p2] < tally[p1]) {
      winnerName = p2;
  } else {
      tieResolvedByPoints = true;
      if (gameState.players[p1].score > gameState.players[p2].score) winnerName = p1;
      else winnerName = p2; 
  }
  
  gameState.finalWinner = winnerName;
  gameState.finalTieResolved = tieResolvedByPoints;
  gameState.finalVotes = gameState.votes;
  gameState.finalTally = tally;

  gameState.liarHistory.push({ round: 11, liarName: gameState.liarName, caught: false, accusedName: null });
  broadcastState();
}

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) res.json({ ok: true });
  else res.status(401).json({ ok: false });
});

io.on('connection', (socket) => {
  
  socket.on('joinAdmin', (data) => {
    if (data && data.password === ADMIN_PASSWORD) {
      gameState.adminSocketId = socket.id;
      broadcastState();
    }
  });

  socket.on('joinGame', ({ name } = {}) => {
    const nameResult = sanitizePlayerName(name);
    if (!nameResult.ok) { socket.emit('error', nameResult.error); return; }
    const normName = nameResult.name;

    if (gameState.players[normName]) {
      if (gameState.players[normName].connected) {
        socket.emit('error', 'Gracz o tym imieniu jest juz w grze.');
        return;
      }
      gameState.players[normName].socketId = socket.id;
      gameState.players[normName].connected = true;
      broadcastState();
    } else {
      if (gameState.phase !== 'lobby') { socket.emit('error', 'Gra juz trwa.'); return; }
      if (Object.keys(gameState.players).length >= 7) { socket.emit('error', 'Maksymalna liczba graczy osiagnieta.'); return; }
      gameState.players[normName] = { name: normName, socketId: socket.id, score: 0, isLiar: false, connected: true, wrongAnswers: 0, pointsHistory: {}, powerupUsed: false, pointsSinceLastVote: 0 };
      broadcastState();
    }
  });

  socket.on('togglePause', () => {
    if (socket.id !== gameState.adminSocketId) return; 
    gameState.isPaused = !gameState.isPaused;
    broadcastState();
  });

  socket.on('stopGame', () => {
    if (socket.id !== gameState.adminSocketId) return;
    clearTransitions();
    clearInterval(gameState.turnInterval);
    if (gameState.votingInterval) clearInterval(gameState.votingInterval); 
    gameState.phase = 'lobby';
    gameState.currentRound = 0;
    gameState.hiddenLiarPoints = 0;
    gameState.lastRecoveredPoints = 0;
    gameState.endReason = null; 
    gameState.isPaused = false;
    gameState.rulesUnderstood = {};
    Object.values(gameState.players).forEach(p => { p.score = 0; p.isLiar = false; p.wrongAnswers = 0; p.pointsHistory = {}; p.powerupUsed = false; p.pointsSinceLastVote = 0; });
    broadcastState();
  });

  socket.on('startGame', ({ questionSet } = {}) => {
    if (socket.id !== gameState.adminSocketId) return;
    if (Object.keys(gameState.players).length < 2) { socket.emit('error', 'Potrzeba co najmniej 2 graczy.'); return; }
    if (!isValidQuestionSet(questionSet)) { socket.emit('error', 'Nieprawidlowy zestaw pytan.'); return; }
    
    gameState.questions = getQuestions(questionSet);
    gameState.currentRound = 0;
    gameState.liarHistory = [];
    gameState.endReason = null; 
    startNextRound();
  });

  socket.on('startNextRound', () => {
    if (socket.id !== gameState.adminSocketId) return;
    startNextRound();
  });

  socket.on('rulesUnderstood', () => {
    if (gameState.phase !== 'preFinal') return;
    const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
    if (!player) return;

    gameState.rulesUnderstood[player.name] = true;
    broadcastState();

    const expected = Object.values(gameState.players).filter(p => p.connected).length;
    const currentReady = Object.keys(gameState.rulesUnderstood).filter(n => gameState.players[n] && gameState.players[n].connected).length;

    if (expected > 0 && currentReady >= expected) {
        setupRound11();
    }
  });

  socket.on('submitAnswer', ({ answer } = {}) => {
    const cleanAnswer = sanitizeAnswer(answer);
    if (!cleanAnswer || gameState.isPaused || gameState.isAnswerLocked) return;
    
    const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
    if (!player) return;

    if (gameState.phase === 'battle') {
        if (!gameState.battlingPlayers.includes(player.name) || gameState.disqualifiedFromBattle.includes(player.name)) return;
        
        const rd = gameState.roundData;
        const idx = matchAnswer(cleanAnswer, rd.answers, rd.revealedAnswers.map(r => r.index));
        
        if (idx >= 0) {
            clearInterval(gameState.turnInterval);
            gameState.isAnswerLocked = true;
            const ans = rd.answers[idx];
            
            player.score += ans.points;
            player.pointsHistory[ans.points] = (player.pointsHistory[ans.points] || 0) + 1; 
            player.pointsSinceLastVote = (player.pointsSinceLastVote || 0) + ans.points;
            
            rd.revealedAnswers.push({ index: idx, text: ans.text, points: ans.points, byName: player.name });
            
            io.emit('timerStart', { duration: 4, phase: 'reveal', correct: true, message: `🏆 ${player.name} WYGRYWA BITWĘ! +${ans.points} pkt` });
            broadcastState(); 
            gameState.revealTimer = setTimeout(() => startRoundSummary(), 4000);
        } else {
            gameState.disqualifiedFromBattle.push(player.name);
            socket.emit('timerStart', { duration: 3, phase: 'reveal', correct: false, message: 'Zła odpowiedź! Odpadasz z tej bitwy.' });
            broadcastState(); 
            
            if (gameState.disqualifiedFromBattle.length >= gameState.battlingPlayers.length) {
                clearInterval(gameState.turnInterval);
                gameState.isAnswerLocked = true;
                io.emit('timerStart', { duration: 3, phase: 'reveal', correct: false, message: 'Nikt nie zgadł 10. hasła!' });
                gameState.revealTimer = setTimeout(() => startRoundSummary(), 3000);
            }
        }
        return;
    }

    if (gameState.phase !== 'round') return;

    const currentName = gameState.roundOrder[gameState.currentTurnIndex];
    if (player.name !== currentName) return;
    
    gameState.isAnswerLocked = true;
    clearInterval(gameState.turnInterval);

    const rd = gameState.roundData;
    const idx = matchAnswer(cleanAnswer, rd.answers, rd.revealedAnswers.map(r => r.index));

    if (idx >= 0) {
      const ans = rd.answers[idx];
      player.score += ans.points;
      player.pointsHistory[ans.points] = (player.pointsHistory[ans.points] || 0) + 1; 
      
      player.pointsSinceLastVote = (player.pointsSinceLastVote || 0) + ans.points;
      
      rd.revealedAnswers.push({ index: idx, text: ans.text, points: ans.points, byName: player.name });
      io.emit('timerStart', { duration: 4, phase: 'reveal', correct: true, message: `Trafiłeś! +${ans.points} pkt` });
      gameState.revealTimer = setTimeout(() => nextTurn(), 4000);
    } else {
      gameState.lastWrongAnswer = { playerName: player.name, text: cleanAnswer };
      rd.wrongAnswersList.push({ text: cleanAnswer, byName: player.name });

      io.emit('timerStart', { duration: 4, phase: 'reveal', correct: false, message: 'Zła odpowiedź!' });
      broadcastState();
      gameState.revealTimer = setTimeout(() => { nextTurn(); }, 4000);
    }
  });

  socket.on('adminOverride', ({ answerIndex } = {}) => {
    if (socket.id !== gameState.adminSocketId || !gameState.lastWrongAnswer || !['round', 'battle'].includes(gameState.phase)) return;
    if (!Number.isInteger(answerIndex)) return;
    
    const playerName = gameState.lastWrongAnswer.playerName;
    const player = gameState.players[playerName];
    const rd = gameState.roundData;
    const ans = rd.answers[answerIndex];
    if (player && ans && !rd.revealedAnswers.some(r => r.index === answerIndex)) {
      player.score += ans.points;
      player.pointsHistory[ans.points] = (player.pointsHistory[ans.points] || 0) + 1; 
      player.pointsSinceLastVote = (player.pointsSinceLastVote || 0) + ans.points;
      
      rd.revealedAnswers.push({ index: answerIndex, text: ans.text, points: ans.points, byName: playerName });
      
      const wIdx = rd.wrongAnswersList.findIndex(w => w.text === gameState.lastWrongAnswer.text && w.byName === playerName);
      if (wIdx !== -1) rd.wrongAnswersList.splice(wIdx, 1);

      io.emit('adminNotification', { message: `Host uznał odpowiedź gracza ${playerName}: ${ans.text} (+${ans.points} pkt)` });
      
      gameState.lastWrongAnswer = null;
      broadcastState(); 
    }
  });

  socket.on('vote', ({ votedName, usePowerup } = {}) => {
    if (!['voting', 'finalVoting'].includes(gameState.phase)) return;
    const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
    if (!player) return;
    const voteResult = validateVote({ phase: gameState.phase, playerName: player.name, votedName, players: gameState.players, top2: gameState.top2 });
    if (!voteResult.ok) { socket.emit('error', voteResult.error); return; }
    
    if (usePowerup && !player.powerupUsed && gameState.phase === 'voting') {
        player.powerupUsed = true;
        gameState.powerupsThisRound[player.name] = true;
    }
    
    if (!usePowerup && player.powerupUsed && gameState.phase === 'voting' && gameState.powerupsThisRound[player.name]) {
        player.powerupUsed = false;
        delete gameState.powerupsThisRound[player.name];
    }

    gameState.votes[player.name] = votedName;
    broadcastState();
  });

  socket.on('kickPlayer', ({ playerName } = {}) => {
    if (socket.id !== gameState.adminSocketId) return;
    const p = gameState.players[playerName];
    if (p) {
      if (p.socketId) {
        io.to(p.socketId).emit('kicked', 'Zostałeś wyrzucony z gry przez Hosta.');
      }
      delete gameState.players[playerName];
      broadcastState();
    }
  });

  socket.on('disconnect', () => {
    if (gameState.adminSocketId === socket.id) gameState.adminSocketId = null;
    const p = Object.values(gameState.players).find(x => x.socketId === socket.id);
    if (p) { 
        p.connected = false; 
        broadcastState(); 
        
        const expected = Object.values(gameState.players).filter(pl => pl.connected).length;
        if (expected > 0) {
            if (gameState.phase === 'preFinal') {
                const currentReady = Object.keys(gameState.rulesUnderstood).filter(n => gameState.players[n] && gameState.players[n].connected).length;
                if (currentReady >= expected) setupRound11();
            } 
        }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serwer działa na porcie ${PORT}`));