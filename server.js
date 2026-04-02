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

let gameState = {
  phase: 'lobby',
  players: {},
  adminSocketId: null,
  questions: defaultQuestions(),
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
  lastVotingChanges: {},
  isAnswerLocked: false
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

function defaultQuestions() {
  return [
    {
      text: "Co robimy rano zaraz po przebudzeniu?",
      answers: [
        { text: "Telefon", points: 1000 }, { text: "Kawa", points: 900 }, { text: "Toaleta", points: 800 },
        { text: "Mycie zebow", points: 700 }, { text: "Prysznic", points: 600 }, { text: "Sniadanie", points: 500 },
        { text: "Ubieranie sie", points: 400 }, { text: "Scielenie lozka", points: 300 }, { text: "Budzik", points: 200 }, { text: "Picie wody", points: 100 }
      ]
    },
    {
      text: "Popularne polskie danie obiadowe",
      answers: [
        { text: "Schabowy", points: 1000 }, { text: "Pierogi", points: 900 }, { text: "Rosol", points: 800 },
        { text: "Zupa pomidorowa", points: 700 }, { text: "Mielony", points: 600 }, { text: "Bigos", points: 500 },
        { text: "Golabki", points: 400 }, { text: "Ryba", points: 300 }, { text: "Kopytka", points: 200 }, { text: "Placki ziemniaczane", points: 100 }
      ]
    },
    {
      text: "Co kojarzy sie z wakacjami nad morzem?",
      answers: [
        { text: "Piasek", points: 1000 }, { text: "Parawan", points: 900 }, { text: "Slonce", points: 800 },
        { text: "Ryba", points: 700 }, { text: "Lody", points: 600 }, { text: "Mewy", points: 500 },
        { text: "Gofry", points: 400 }, { text: "Muszelki", points: 300 }, { text: "Statek", points: 200 }, { text: "Latarnia", points: 100 }
      ]
    },
    {
      text: "Zawod, w ktorym trzeba nosic mundur",
      answers: [
        { text: "Policjant", points: 1000 }, { text: "Strazak", points: 900 }, { text: "Zolnierz", points: 800 },
        { text: "Straznik graniczny", points: 700 }, { text: "Pilot", points: 600 }, { text: "Pielegniarka", points: 500 },
        { text: "Kucharz", points: 400 }, { text: "Konduktor", points: 300 }, { text: "Marynarz", points: 200 }, { text: "Listonosz", points: 100 }
      ]
    },
    {
      text: "Co robimy, gdy stoimy w dlugim korku?",
      answers: [
        { text: "Sluchanie muzyki", points: 1000 }, { text: "Patrzenie w telefon", points: 900 }, { text: "Spiewanie", points: 800 },
        { text: "Dlubanie w nosie", points: 700 }, { text: "Rozmawianie", points: 600 }, { text: "Przeklinanie", points: 500 },
        { text: "Rozgladanie sie", points: 400 }, { text: "Jedzenie", points: 300 }, { text: "Myslenie", points: 200 }, { text: "GPS", points: 100 }
      ]
    },
    {
      text: "Co mozna znalezc w damskiej torebce?",
      answers: [
        { text: "Telefon", points: 1000 }, { text: "Portfel", points: 900 }, { text: "Klucze", points: 800 },
        { text: "Chusteczki", points: 700 }, { text: "Szminka", points: 600 }, { text: "Lusterko", points: 500 },
        { text: "Perfumy", points: 400 }, { text: "Krem do rak", points: 300 }, { text: "Dlugopis", points: 200 }, { text: "Tabletki", points: 100 }
      ]
    },
    {
      text: "Urzadzenie domowe, ktore psuje sie najczesciej",
      answers: [
        { text: "Pralka", points: 1000 }, { text: "Lodowka", points: 900 }, { text: "Czajnik", points: 800 },
        { text: "Telewizor", points: 700 }, { text: "Zmywarka", points: 600 }, { text: "Odkurzacz", points: 500 },
        { text: "Zarowka", points: 400 }, { text: "Kran", points: 300 }, { text: "Pilot", points: 200 }, { text: "Router", points: 100 }
      ]
    },
    {
      text: "Gdzie musimy zachowac absolutna cisze?",
      answers: [
        { text: "Biblioteka", points: 1000 }, { text: "Kosciol", points: 900 }, { text: "Szpital", points: 800 },
        { text: "Kino", points: 700 }, { text: "Teatr", points: 600 }, { text: "Muzeum", points: 500 },
        { text: "Pogrzeb", points: 400 }, { text: "Egzamin", points: 300 }, { text: "Sad", points: 200 }, { text: "Sypialnia", points: 100 }
      ]
    },
    {
      text: "Co kupujemy na stacji benzynowej poza paliwem?",
      answers: [
        { text: "Kawa", points: 1000 }, { text: "Hot-dog", points: 900 }, { text: "Plyn do spryskiwaczy", points: 800 },
        { text: "Papierosy", points: 700 }, { text: "Napoje", points: 600 }, { text: "Chipsy", points: 500 },
        { text: "Alkohol", points: 400 }, { text: "Gazeta", points: 300 }, { text: "Olej", points: 200 }, { text: "Zapalniczka", points: 100 }
      ]
    },
    {
      text: "Przedmiot, ktory czesto gubimy w domu",
      answers: [
        { text: "Klucze", points: 1000 }, { text: "Telefon", points: 900 }, { text: "Pilot", points: 800 },
        { text: "Portfel", points: 700 }, { text: "Skarpetki", points: 600 }, { text: "Okulary", points: 500 },
        { text: "Sluchawki", points: 400 }, { text: "Ladowarka", points: 300 }, { text: "Dlugopis", points: 200 }, { text: "Gumka do wlosow", points: 100 }
      ]
    },
    {
      text: "Co robimy, gdy nie mozemy zasnac w nocy?",
      answers: [
        { text: "Liczenie owiec", points: 1000 }, { text: "Czytanie", points: 900 }, { text: "Telefon", points: 800 },
        { text: "Myslenie", points: 700 }, { text: "Picie melisy", points: 600 }, { text: "Muzyka", points: 500 },
        { text: "Sprzatanie", points: 400 }, { text: "Jedzenie", points: 300 }, { text: "Telewizja", points: 200 }, { text: "Przewracanie sie", points: 100 }
      ]
    }
  ];
}

function testQuestions() {
  const q = [];
  for (let i = 1; i <= 11; i++) {
    q.push({
      text: `[TEST] Pytanie testowe ${i}`,
      answers: [
        { text: "A", points: 1000 }, { text: "B", points: 900 }, { text: "C", points: 800 },
        { text: "D", points: 700 }, { text: "E", points: 600 }, { text: "F", points: 500 },
        { text: "G", points: 400 }, { text: "H", points: 300 }, { text: "I", points: 200 }, { text: "J", points: 100 },
      ]
    });
  }
  return q;
}

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
    lastVotingChanges: gameState.lastVotingChanges
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

  if (['roundSummary', 'voting', 'votingResults', 'revealingAnswers'].includes(gameState.phase) && gameState.roundData) {
    base.allAnswers = gameState.roundData.answers;
  }

  if (['voting', 'votingResults', 'finalVoting'].includes(gameState.phase)) {
    base.votes = gameState.votes;
    base.votingTimeLeft = gameState.votingTimeLeft;
  }
  
  if (gameState.phase === 'speeches') {
    base.speechPlayerName = gameState.speechPlayerName;
    base.votingTimeLeft = gameState.votingTimeLeft;
  }

  Object.values(gameState.players).forEach(player => {
    if (!player.connected || !player.socketId) return;
    const payload = { ...base, myName: player.name };
    if (player.isLiar && gameState.roundData && ['round', 'revealingAnswers', 'roundSummary'].includes(gameState.phase)) {
      payload.liarAnswers = gameState.roundData.answers;
    }
    io.to(player.socketId).emit('state', payload);
  });

  if (gameState.adminSocketId) {
    const adminPayload = { ...base, votes: gameState.votes, allAnswers: gameState.roundData?.answers, liarName: gameState.liarName, lastWrongAnswer: gameState.lastWrongAnswer };
    io.to(gameState.adminSocketId).emit('state', adminPayload);
  }
}

function startTurnTimer() {
  clearTransitions();
  clearTimeout(gameState.turnTimer);
  gameState.isAnswerLocked = false;
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
  gameState.isAnswerLocked = true;
  
  if (gameState.currentRound === 11 && gameState.players[playerName]) {
    gameState.players[playerName].wrongAnswers++;
    if (gameState.players[playerName].wrongAnswers >= 2) {
      endGameInstantly(playerName);
      return;
    }
  }
  io.emit('timerStart', { duration: 4, phase: 'reveal', correct: false, message: 'Czas minal! Brak odpowiedzi.' });
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
  clearTransitions(); // ZMIANA: Usunięto widoczne odliczanie!
  
  // Zwykłe przeczekanie 3 sekund "w ukryciu" przed odsłonięciem
  setTimeout(() => { if (!gameState.isPaused) startRevealSequence(); }, 3000);
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
      // Gdy skończą odkrywać się odpowiedzi, to odliczamy do następnej fazy
      runTransition(5, () => { postRoundRouting(); });
    }
  }
  revealNext();
}

function postRoundRouting() {
  if (VOTING_ROUNDS.includes(gameState.currentRound)) {
    startVoting();
  } else {
    startNextRound();
  }
}

function startVoting() {
  gameState.phase = 'voting';
  gameState.votes = {};
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

  const tally = {};
  Object.values(gameState.votes).forEach(vName => { tally[vName] = (tally[vName] || 0) + 1; });

  let maxVotes = 0, accusedName = null;
  for (const [name, count] of Object.entries(tally)) {
    if (count > maxVotes) { maxVotes = count; accusedName = name; }
  }

  const changes = {};
  let liarCaught = (accusedName === gameState.liarName && maxVotes >= 3);
  
  if (liarCaught) {
    if (gameState.players[gameState.liarName]) {
        gameState.players[gameState.liarName].score = Math.max(0, gameState.players[gameState.liarName].score - 300);
        changes[gameState.liarName] = -300;
    }
  }

  Object.entries(gameState.votes).forEach(([voterName, votedFor]) => {
    if (voterName === gameState.liarName) return; 
    const p = gameState.players[voterName];
    if (!p) return;
    if (votedFor === gameState.liarName) {
        p.score += 300;
        changes[voterName] = 300;
    } else {
        p.score = Math.max(0, p.score - 100);
        changes[voterName] = -100;
    }
  });

  gameState.lastVotingChanges = changes;
  gameState.liarHistory.push({ round: gameState.currentRound, liarName: gameState.liarName, caught: liarCaught, accusedName: accusedName || 'Brak' });

  if (liarCaught) {
    Object.values(gameState.players).forEach(p => p.isLiar = false);
    gameState.liarName = pickNewLiar(null);
  }

  broadcastState();
  runTransition(12, () => {
    if (gameState.phase === 'votingResults') startNextRound();
  });
}

function pickNewLiar(excludeName, pool) {
  const names = pool || Object.keys(gameState.players).filter(n => n !== excludeName);
  if (names.length === 0) return Object.keys(gameState.players)[0];
  const chosen = names[Math.floor(Math.random() * names.length)];
  if (gameState.players[chosen]) gameState.players[chosen].isLiar = true;
  return chosen;
}

function startNextRound() {
  clearTransitions();
  if (gameState.currentRound >= gameState.totalRounds) return;
  gameState.currentRound++;
  gameState.lastVotingChanges = {};
  Object.values(gameState.players).forEach(p => p.wrongAnswers = 0);

  if (gameState.currentRound === 1) {
    Object.values(gameState.players).forEach(p => p.isLiar = false);
    gameState.liarName = pickNewLiar(null);
  }

  if (gameState.currentRound === 11) {
    setupRound11();
    return;
  }

  const qIndex = gameState.currentRound - 1;
  const question = gameState.questions[qIndex] || gameState.questions[0];
  
  gameState.roundOrder = Object.values(gameState.players)
    .sort((a, b) => a.score - b.score)
    .map(p => p.name);

  gameState.currentTurnIndex = 0;
  gameState.roundData = { questionText: question.text, answers: question.answers, revealedAnswers: [], wrongAnswersList: [] };
  gameState.phase = 'round';
  broadcastState();
  startTurnTimer();
}

function setupRound11() {
  const sorted = Object.values(gameState.players).sort((a, b) => b.score - a.score);
  gameState.top2 = sorted.slice(0, 2).map(p => p.name);
  
  Object.values(gameState.players).forEach(p => p.isLiar = false);
  gameState.liarName = pickNewLiar(null, gameState.top2);

  const qIndex = 10;
  const question = gameState.questions[qIndex];

  const starter = gameState.players[gameState.top2[0]].score < gameState.players[gameState.top2[1]].score ? gameState.top2[0] : gameState.top2[1];
  const second = starter === gameState.top2[0] ? gameState.top2[1] : gameState.top2[0];
  
  gameState.roundOrder = [starter, second, starter, second, starter, second]; 
  gameState.currentTurnIndex = 0;
  gameState.roundData = { questionText: question.text, answers: question.answers, revealedAnswers: [], wrongAnswersList: [] };
  gameState.phase = 'round';
  broadcastState();
  startTurnTimer();
}

function endRound11() {
  gameState.phase = 'speeches';
  const firstSpeaker = gameState.players[gameState.top2[0]].score >= gameState.players[gameState.top2[1]].score ? gameState.top2[0] : gameState.top2[1];
  gameState.speechPlayerName = firstSpeaker;
  gameState.votingTimeLeft = 45;
  broadcastState();

  if (gameState.votingInterval) clearInterval(gameState.votingInterval);
  gameState.votingInterval = setInterval(() => {
    if (gameState.isPaused) return;
    gameState.votingTimeLeft--;
    io.emit('votingTimer', { timeLeft: gameState.votingTimeLeft });
    if (gameState.votingTimeLeft <= 0) {
      clearInterval(gameState.votingInterval);
      const secondSpeaker = gameState.top2.find(n => n !== firstSpeaker);
      if (gameState.speechPlayerName === firstSpeaker) {
        gameState.speechPlayerName = secondSpeaker;
        gameState.votingTimeLeft = 45;
        broadcastState();
        gameState.votingInterval = setInterval(() => {
          if (gameState.isPaused) return;
          gameState.votingTimeLeft--;
          io.emit('votingTimer', { timeLeft: gameState.votingTimeLeft });
          if (gameState.votingTimeLeft <= 0) {
            clearInterval(gameState.votingInterval);
            startFinalVoting();
          }
        }, 1000);
      }
    }
  }, 1000);
}

function startFinalVoting() {
  gameState.phase = 'finalVoting';
  gameState.votes = {};
  gameState.votingTimeLeft = 45;
  broadcastState();
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
  
  const tally = {};
  Object.values(gameState.votes).forEach(vName => { tally[vName] = (tally[vName] || 0) + 1; });
  let maxVotes = 0, accusedName = null;
  for (const [name, count] of Object.entries(tally)) {
    if (count > maxVotes) { maxVotes = count; accusedName = name; }
  }
  gameState.liarHistory.push({ round: 11, liarName: gameState.liarName, caught: accusedName === gameState.liarName, accusedName: accusedName || 'Brak' });
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

  socket.on('joinGame', ({ name }) => {
    const normName = name.trim();
    if (!normName) return;
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
      gameState.players[normName] = { name: normName, socketId: socket.id, score: 0, isLiar: false, connected: true, wrongAnswers: 0 };
      broadcastState();
    }
  });

  socket.on('togglePause', () => {
    if (socket.id !== gameState.adminSocketId) return; 
    gameState.isPaused = !gameState.isPaused;
    broadcastState();
    if (!gameState.isPaused && gameState.phase === 'round') startTurnTimer();
  });

  socket.on('stopGame', () => {
    if (socket.id !== gameState.adminSocketId) return;
    clearTransitions();
    gameState.phase = 'lobby';
    gameState.currentRound = 0;
    gameState.isPaused = false;
    Object.values(gameState.players).forEach(p => { p.score = 0; p.isLiar = false; p.wrongAnswers = 0; });
    broadcastState();
  });

  socket.on('startGame', ({ questionSet }) => {
    if (socket.id !== gameState.adminSocketId) return;
    if (Object.keys(gameState.players).length < 2) { socket.emit('error', 'Potrzeba co najmniej 2 graczy.'); return; }
    
    gameState.questions = questionSet === 'test' ? testQuestions() : defaultQuestions();
    
    gameState.currentRound = 0;
    gameState.liarHistory = [];
    startNextRound();
  });

  socket.on('startNextRound', () => {
    if (socket.id !== gameState.adminSocketId) return;
    startNextRound();
  });

  socket.on('submitAnswer', ({ answer }) => {
    if (gameState.phase !== 'round' || gameState.isPaused || gameState.isAnswerLocked) return;
    
    const currentName = gameState.roundOrder[gameState.currentTurnIndex];
    const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
    if (!player || player.name !== currentName) return;
    
    gameState.isAnswerLocked = true;
    clearTimeout(gameState.turnTimer);

    const rd = gameState.roundData;
    const idx = matchAnswer(answer, rd.answers, rd.revealedAnswers.map(r => r.index));

    if (idx >= 0) {
      const ans = rd.answers[idx];
      player.score += ans.points;
      rd.revealedAnswers.push({ index: idx, text: ans.text, points: ans.points, byName: player.name });
      io.emit('timerStart', { duration: 4, phase: 'reveal', correct: true, message: `Trafiles! +${ans.points} pkt` });
      gameState.revealTimer = setTimeout(() => nextTurn(), 4000);
    } else {
      gameState.lastWrongAnswer = { playerName: player.name, text: answer };
      rd.wrongAnswersList.push({ text: answer, byName: player.name });
      io.emit('timerStart', { duration: 4, phase: 'reveal', correct: false, message: 'Zla odpowiedz!' });
      broadcastState();
      gameState.revealTimer = setTimeout(() => {
        if (gameState.currentRound === 11) {
          player.wrongAnswers++;
          if (player.wrongAnswers >= 2) { endGameInstantly(player.name); return; }
        }
        nextTurn();
      }, 4000);
    }
  });

  socket.on('adminOverride', ({ answerIndex }) => {
    if (socket.id !== gameState.adminSocketId || !gameState.lastWrongAnswer || gameState.phase !== 'round') return;
    clearTimeout(gameState.revealTimer);
    const playerName = gameState.lastWrongAnswer.playerName;
    const player = gameState.players[playerName];
    const rd = gameState.roundData;
    const ans = rd.answers[answerIndex];
    if (player && ans && !rd.revealedAnswers.some(r => r.index === answerIndex)) {
      player.score += ans.points;
      rd.revealedAnswers.push({ index: answerIndex, text: ans.text, points: ans.points, byName: playerName });
      
      const wIdx = rd.wrongAnswersList.findIndex(w => w.text === gameState.lastWrongAnswer.text && w.byName === playerName);
      if (wIdx !== -1) rd.wrongAnswersList.splice(wIdx, 1);

      io.emit('timerStart', { duration: 3, phase: 'reveal', correct: true, message: `Korekta Admina: Trafiles! +${ans.points} pkt` });
      gameState.lastWrongAnswer = null;
      gameState.revealTimer = setTimeout(() => nextTurn(), 3000);
    }
  });

  socket.on('vote', ({ votedName }) => {
    if (!['voting', 'finalVoting'].includes(gameState.phase)) return;
    const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
    if (!player) return;
    
    gameState.votes[player.name] = votedName;
    broadcastState();

    const expectedVotes = Object.values(gameState.players).filter(p => p.connected).length;
    const currentVotes = Object.keys(gameState.votes).length;

    if (currentVotes >= expectedVotes) {
       if (gameState.phase === 'voting') resolveVoting();
       else if (gameState.phase === 'finalVoting') resolveFinalVoting();
    }
  });

  socket.on('disconnect', () => {
    if (gameState.adminSocketId === socket.id) gameState.adminSocketId = null;
    const p = Object.values(gameState.players).find(x => x.socketId === socket.id);
    if (p) { p.connected = false; broadcastState(); }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serwer dziala na porcie ${PORT}`));