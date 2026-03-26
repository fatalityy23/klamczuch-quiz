const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const VOTING_ROUNDS = [2, 4, 6, 8, 9, 10];

// ZMIANA: Definicja zestawów pytań
const questionsSets = {
  zestaw1: [
    { text: "Wymień popularne batony", answers: [{ text: "Snickers", points: 1000 }, { text: "Twix", points: 900 }, { text: "Mars", points: 800 }, { text: "Kinder Bueno", points: 700 }, { text: "Bounty", points: 600 }, { text: "Lion", points: 500 }, { text: "Pawełek", points: 400 }, { text: "KitKat", points: 300 }, { text: "Milky Way", points: 200 }, { text: "3Bit", points: 100 }] },
    { text: "Co ludzie często udają, że rozumieją?", answers: [{ text: "Podatki", points: 1000 }, { text: "Politykę", points: 900 }, { text: "Kryptowaluty", points: 800 }, { text: "Sztukę współczesną", points: 700 }, { text: "Instrukcję leku", points: 600 }, { text: "Umowę kredytu", points: 500 }, { text: "Memy", points: 400 }, { text: "Excela", points: 300 }, { text: "AI", points: 200 }, { text: "Spalony", points: 100 }] },
    { text: "Państwo, którego nazwa kończy się na \"NIA\"", answers: [{ text: "Hiszpania", points: 1000 }, { text: "Dania", points: 900 }, { text: "Rumunia", points: 800 }, { text: "Albania", points: 700 }, { text: "Estonia", points: 600 }, { text: "Kenia", points: 500 }, { text: "Słowenia", points: 400 }, { text: "Armenia", points: 300 }, { text: "Jordania", points: 200 }, { text: "Tanzania", points: 100 }] },
    { text: "Do jakiego kraju Polacy jeżdżą/latają na wakacje?", answers: [{ text: "Grecja", points: 1000 }, { text: "Hiszpania", points: 900 }, { text: "Włochy", points: 800 }, { text: "Egipt", points: 700 }, { text: "Turcja", points: 600 }, { text: "Chorwacja", points: 500 }, { text: "Bułgaria", points: 400 }, { text: "Portugalia", points: 300 }, { text: "Albania", points: 200 }, { text: "Tunezja", points: 100 }] },
    { text: "Co ludzie najczęściej mają przy łóżku?", answers: [{ text: "Telefon", points: 1000 }, { text: "Lampkę", points: 900 }, { text: "Ładowarkę", points: 800 }, { text: "Prezerwatywę", points: 700 }, { text: "Książkę", points: 600 }, { text: "Chusteczki", points: 500 }, { text: "Pilot", points: 400 }, { text: "Zegarek", points: 300 }, { text: "Szklankę", points: 200 }, { text: "Okulary", points: 100 }] },
    { text: "Popularny superbohater", answers: [{ text: "Batman", points: 1000 }, { text: "Spider-Man", points: 900 }, { text: "Superman", points: 800 }, { text: "Hulk", points: 700 }, { text: "Iron Man", points: 600 }, { text: "Thor", points: 500 }, { text: "Kapitan Ameryka", points: 400 }, { text: "Wonder Woman", points: 300 }, { text: "Wolverine", points: 200 }, { text: "Flash", points: 100 }] },
    { text: "Sport bez bezpośredniego kontaktu", answers: [{ text: "Tenis", points: 1000 }, { text: "Tenis stołowy", points: 900 }, { text: "Siatkówka", points: 800 }, { text: "Badminton", points: 700 }, { text: "Szachy", points: 600 }, { text: "Squash", points: 500 }, { text: "Bilard", points: 400 }, { text: "Golf", points: 300 }, { text: "Dart", points: 200 }, { text: "Kręgle", points: 100 }] },
    { text: "Popularne polskie nazwisko", answers: [{ text: "Kowalski", points: 1000 }, { text: "Nowak", points: 900 }, { text: "Lewandowski", points: 800 }, { text: "Wiśniewski", points: 700 }, { text: "Kowalczyk", points: 600 }, { text: "Kamiński", points: 500 }, { text: "Wójcik", points: 400 }, { text: "Zieliński", points: 300 }, { text: "Szymański", points: 200 }, { text: "Woźniak", points: 100 }] },
    { text: "Co można powiedzieć podczas gry w karty?", answers: [{ text: "Wchodzę", points: 1000 }, { text: "Nie kończ jeszcze", points: 900 }, { text: "Tasuj porządnie", points: 800 }, { text: "Nie patrz", points: 700 }, { text: "Odsłaniasz?", points: 600 }, { text: "Masz układ", points: 500 }, { text: "Teraz ja", points: 400 }, { text: "Po kolei", points: 300 }, { text: "Przebiłeś mnie", points: 200 }, { text: "Idzie ci", points: 100 }] },
    { text: "Co golimy?", answers: [{ text: "Jaja", points: 1000 }, { text: "Broda", points: 900 }, { text: "Nogi", points: 800 }, { text: "Pachy", points: 700 }, { text: "Wąsy", points: 600 }, { text: "Cipka", points: 500 }, { text: "Klatka", points: 400 }, { text: "Dupa", points: 300 }, { text: "Ręce", points: 200 }, { text: "Brwi", points: 100 }] },
    { text: "Słowo kończące się na OWIEC", answers: [{ text: "Naukowiec", points: 1000 }, { text: "Fachowiec", points: 900 }, { text: "Biurowiec", points: 800 }, { text: "Sportowiec", points: 700 }, { text: "Śmigłowiec", points: 600 }, { text: "Zawodowiec", points: 500 }, { text: "Pokrowiec", points: 400 }, { text: "Szybowiec", points: 300 }, { text: "Drogowiec", points: 200 }, { text: "Związkowiec", points: 100 }] }
  ],
  testowy: Array.from({ length: 11 }, (_, i) => ({
    text: `Pytanie testowe ${i + 1} (Wpisz A, B, C...)`,
    answers: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].map((l, idx) => ({ text: l, points: 1000 - (idx * 100) }))
  }))
};

let gameState = {
  phase: 'lobby',
  players: {},
  adminSocketId: null,
  questions: questionsSets.zestaw1,
  selectedSet: 'zestaw1',
  currentRound: 0,
  totalRounds: 11,
  roundData: null,
  liarName: null,
  votes: {},
  votingTimeLeft: 0,
  votingInterval: null,
  roundOrder: [],
  currentTurnIndex: 0,
  turnTimer: null,
  revealTimer: null,
  usedQuestions: [],
  liarHistory: [],
  lastWrongAnswer: null,
  top2: [],
  r11Turns: 0,
  speechPlayerName: null,
  isPaused: false,
  lastVotingChanges: {}
};

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function normalize(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
}

function matchAnswer(input, answers, revealedIdxs) {
  const normInput = normalize(input);
  for (let i = 0; i < answers.length; i++) {
    if (revealedIdxs.includes(i)) continue;
    const normAnswer = normalize(answers[i].text);
    if (normAnswer === normInput || normAnswer.includes(normInput) || normInput.includes(normAnswer)) return i;
    const threshold = Math.min(3, Math.max(1, Math.floor(Math.min(normInput.length, normAnswer.length) * 0.3)));
    if (levenshtein(normInput, normAnswer) <= threshold) return i;
  }
  return -1;
}

function getPlayerList() {
  return Object.values(gameState.players).map(p => ({
    name: p.name, score: p.score, connected: p.connected, isLiar: p.isLiar, wrongAnswers: p.wrongAnswers
  }));
}

function broadcastState() {
  const base = {
    phase: gameState.phase,
    players: getPlayerList(),
    currentRound: gameState.currentRound,
    totalRounds: gameState.totalRounds,
    liarHistory: gameState.liarHistory,
    isPaused: gameState.isPaused,
    lastVotingChanges: gameState.lastVotingChanges,
    selectedSet: gameState.selectedSet
  };

  if (gameState.roundData) {
    base.questionText = gameState.roundData.questionText;
    base.revealedAnswers = gameState.roundData.revealedAnswers;
    base.roundOrder = gameState.roundOrder;
    base.currentTurnIndex = gameState.currentTurnIndex;
    base.currentPlayerName = gameState.roundOrder[gameState.currentTurnIndex] || null;
    base.top2 = gameState.top2;
  }

  // Admin zawsze widzi wszystko
  if (gameState.adminSocketId) {
    const adminPayload = { ...base, votes: gameState.votes, allAnswers: gameState.roundData?.answers, liarName: gameState.liarName, lastWrongAnswer: gameState.lastWrongAnswer };
    io.to(gameState.adminSocketId).emit('state', adminPayload);
  }

  // Wysłanie stanu do graczy
  Object.values(gameState.players).forEach(player => {
    if (!player.connected || !player.socketId) return;
    const payload = { ...base, myName: player.name };
    if (gameState.phase === 'round' || gameState.phase === 'roundSummary' || gameState.phase === 'revealingAnswers') {
        payload.allAnswers = gameState.roundData.answers;
    }
    if (player.isLiar && gameState.roundData && (gameState.phase === 'round' || gameState.phase === 'revealingAnswers' || gameState.phase === 'roundSummary')) {
      payload.liarAnswers = gameState.roundData.answers;
    }
    io.to(player.socketId).emit('state', payload);
  });
}

function startTurnTimer() {
  clearTimeout(gameState.turnTimer);
  if (gameState.isPaused) return;

  const currentName = gameState.roundOrder[gameState.currentTurnIndex];
  if (!currentName) {
    if (gameState.currentRound === 11) endRound11(); else startRoundSummary();
    return;
  }
  
  const duration = gameState.currentTurnIndex === 0 ? 35 : 25;
  io.emit('timerStart', { duration, phase: 'answer' });
  gameState.turnTimer = setTimeout(() => { showNoAnswer(currentName); }, duration * 1000);
}

function showNoAnswer(playerName) {
  clearTimeout(gameState.turnTimer);
  if (gameState.currentRound === 11 && gameState.players[playerName]) {
    gameState.players[playerName].wrongAnswers++;
    if (gameState.players[playerName].wrongAnswers >= 2) { endGameInstantly(playerName); return; }
  }
  io.emit('timerStart', { duration: 4, phase: 'reveal', correct: false, message: 'Czas minął! Brak odpowiedzi.' });
  gameState.revealTimer = setTimeout(() => { nextTurn(); }, 4000);
}

function nextTurn() {
  if (gameState.isPaused) return;
  gameState.currentTurnIndex++;
  if (gameState.currentRound === 11) {
    if (gameState.currentTurnIndex >= 6 || gameState.roundData.revealedAnswers.length >= 10) endRound11();
    else { broadcastState(); startTurnTimer(); }
  } else {
    if (gameState.currentTurnIndex >= gameState.roundOrder.length || gameState.roundData.revealedAnswers.length >= 10) startRoundSummary();
    else { broadcastState(); startTurnTimer(); }
  }
}

function startRoundSummary() {
  gameState.phase = 'roundSummary';
  broadcastState();
  setTimeout(() => { if (!gameState.isPaused) startRevealSequence(); }, 3000);
}

function startRevealSequence() {
  gameState.phase = 'revealingAnswers';
  broadcastState();
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
      setTimeout(() => { postRoundRouting(); }, 4000);
    }
  }
  revealNext();
}

function postRoundRouting() {
  if (VOTING_ROUNDS.includes(gameState.currentRound)) startVoting();
  else startNextRound();
}

function startVoting() {
  gameState.phase = 'voting';
  gameState.votes = {};
  gameState.votingTimeLeft = 60;
  broadcastState();
  if (gameState.votingInterval) clearInterval(gameState.votingInterval);
  gameState.votingInterval = setInterval(() => {
    if (gameState.isPaused) return;
    gameState.votingTimeLeft--;
    io.emit('votingTimer', { timeLeft: gameState.votingTimeLeft });
    if (gameState.votingTimeLeft <= 0) { clearInterval(gameState.votingInterval); resolveVoting(); }
  }, 1000);
}

function resolveVoting() {
  clearInterval(gameState.votingInterval);
  const tally = {};
  Object.values(gameState.votes).forEach(vName => { tally[vName] = (tally[vName] || 0) + 1; });
  let maxVotes = 0, accusedName = null;
  for (const [name, count] of Object.entries(tally)) { if (count > maxVotes) { maxVotes = count; accusedName = name; } }

  const changes = {};
  let liarCaught = (accusedName === gameState.liarName && maxVotes >= 2);
  
  if (liarCaught && gameState.players[gameState.liarName]) {
    gameState.players[gameState.liarName].score = Math.max(0, gameState.players[gameState.liarName].score - 300);
    changes[gameState.liarName] = -300;
  }

  Object.entries(gameState.votes).forEach(([voterName, votedFor]) => {
    if (voterName === gameState.liarName) return; 
    const p = gameState.players[voterName];
    if (!p) return;
    if (votedFor === gameState.liarName) { p.score += 300; changes[voterName] = 300; } 
    else { p.score = Math.max(0, p.score - 100); changes[voterName] = -100; }
  });

  gameState.lastVotingChanges = changes;
  gameState.liarHistory.push({ round: gameState.currentRound, liarName: gameState.liarName, caught: liarCaught, accusedName: accusedName || 'Brak' });
  if (liarCaught) {
    Object.values(gameState.players).forEach(p => p.isLiar = false);
    gameState.liarName = pickNewLiar(null);
  }
  gameState.phase = 'votingResults';
  broadcastState();
  setTimeout(() => { if (gameState.phase === 'votingResults' && !gameState.isPaused) startNextRound(); }, 12000);
}

function pickNewLiar(excludeName, pool) {
  const names = pool || Object.keys(gameState.players).filter(n => n !== excludeName);
  const chosen = names[Math.floor(Math.random() * names.length)];
  if (gameState.players[chosen]) { gameState.players[chosen].isLiar = true; gameState.liarName = chosen; }
  return chosen;
}

function startNextRound() {
  if (gameState.currentRound >= gameState.totalRounds) return;
  gameState.currentRound++;
  gameState.lastVotingChanges = {};
  Object.values(gameState.players).forEach(p => p.wrongAnswers = 0);
  if (gameState.currentRound === 1) {
    Object.values(gameState.players).forEach(p => p.isLiar = false);
    pickNewLiar(null);
  }
  if (gameState.currentRound === 11) { setupRound11(); return; }
  const q = gameState.questions[gameState.currentRound - 1] || gameState.questions[0];
  gameState.roundOrder = Object.values(gameState.players).sort((a, b) => a.score - b.score).map(p => p.name);
  gameState.currentTurnIndex = 0;
  gameState.roundData = { questionText: q.text, answers: q.answers, revealedAnswers: [] };
  gameState.phase = 'round';
  broadcastState();
  startTurnTimer();
}

function setupRound11() {
  const sorted = Object.values(gameState.players).sort((a, b) => b.score - a.score);
  gameState.top2 = sorted.slice(0, 2).map(p => p.name);
  Object.values(gameState.players).forEach(p => p.isLiar = false);
  pickNewLiar(null, gameState.top2);
  const q = gameState.questions[10];
  const starter = gameState.players[gameState.top2[0]].score < gameState.players[gameState.top2[1]].score ? gameState.top2[0] : gameState.top2[1];
  const second = starter === gameState.top2[0] ? gameState.top2[1] : gameState.top2[0];
  gameState.roundOrder = [starter, second, starter, second, starter, second]; 
  gameState.currentTurnIndex = 0;
  gameState.roundData = { questionText: q.text, answers: q.answers, revealedAnswers: [] };
  gameState.phase = 'round';
  broadcastState();
  startTurnTimer();
}

io.on('connection', (socket) => {
  socket.on('joinAdmin', () => { gameState.adminSocketId = socket.id; broadcastState(); });
  socket.on('joinGame', ({ name }) => {
    const normName = name.trim(); if (!normName) return;
    if (gameState.players[normName]) { gameState.players[normName].socketId = socket.id; gameState.players[normName].connected = true; } 
    else { gameState.players[normName] = { name: normName, socketId: socket.id, score: 0, isLiar: false, connected: true, wrongAnswers: 0 }; }
    broadcastState();
  });
  socket.on('togglePause', () => { if (socket.id === gameState.adminSocketId) { gameState.isPaused = !gameState.isPaused; broadcastState(); if (!gameState.isPaused && gameState.phase === 'round') startTurnTimer(); } });
  socket.on('stopGame', () => { if (socket.id === gameState.adminSocketId) { gameState.phase = 'lobby'; gameState.currentRound = 0; Object.values(gameState.players).forEach(p => { p.score = 0; p.isLiar = false; }); broadcastState(); } });
  socket.on('startGame', ({ setKey }) => { 
    if (socket.id === gameState.adminSocketId) { 
      gameState.selectedSet = setKey;
      gameState.questions = questionsSets[setKey] || questionsSets.zestaw1;
      gameState.currentRound = 0; 
      startNextRound(); 
    } 
  });
  socket.on('submitAnswer', ({ answer }) => {
    if (gameState.phase !== 'round' || gameState.isPaused) return;
    const currentName = gameState.roundOrder[gameState.currentTurnIndex];
    const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
    if (!player || player.name !== currentName) return;
    clearTimeout(gameState.turnTimer);
    const idx = matchAnswer(answer, gameState.roundData.answers, gameState.roundData.revealedAnswers.map(r => r.index));
    if (idx >= 0) {
      const a = gameState.roundData.answers[idx];
      player.score += a.points;
      gameState.roundData.revealedAnswers.push({ index: idx, text: a.text, points: a.points, byName: player.name });
      io.emit('timerStart', { duration: 4, phase: 'reveal', correct: true, message: `Trafiłeś! +${a.points} pkt` });
      gameState.revealTimer = setTimeout(() => nextTurn(), 4000);
    } else {
      gameState.lastWrongAnswer = { playerName: player.name, text: answer };
      io.emit('timerStart', { duration: 4, phase: 'reveal', correct: false, message: 'Zła odpowiedź!' });
      broadcastState();
      gameState.revealTimer = setTimeout(() => { nextTurn(); }, 4000);
    }
  });
  socket.on('adminOverride', ({ answerIndex }) => {
    if (socket.id !== gameState.adminSocketId || !gameState.lastWrongAnswer) return;
    clearTimeout(gameState.revealTimer);
    const p = gameState.players[gameState.lastWrongAnswer.playerName];
    const a = gameState.roundData.answers[answerIndex];
    if (p && a) {
      p.score += a.points;
      gameState.roundData.revealedAnswers.push({ index: answerIndex, text: a.text, points: a.points, byName: p.name });
      io.emit('timerStart', { duration: 3, phase: 'reveal', correct: true, message: `Korekta Admina: +${a.points} pkt` });
      gameState.lastWrongAnswer = null;
      gameState.revealTimer = setTimeout(() => nextTurn(), 3000);
    }
  });
  socket.on('vote', ({ votedName }) => {
    const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
    if (player) { gameState.votes[player.name] = votedName; broadcastState(); }
  });
  socket.on('disconnect', () => {
    if (gameState.adminSocketId === socket.id) gameState.adminSocketId = null;
    const p = Object.values(gameState.players).find(x => x.socketId === socket.id);
    if (p) { p.connected = false; broadcastState(); }
  });
});

server.listen(process.env.PORT || 3000, () => console.log(`Serwer na porcie 3000`));