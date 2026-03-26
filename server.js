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
  players: {}, // Kluczem jest teraz imię gracza
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
  speechPlayerName: null
};

function defaultQuestions() {
  return [
    {
      text: "Wymień popularne batony",
      answers: [
        { text: "Snickers", points: 1000 },
        { text: "Twix", points: 900 },
        { text: "Mars", points: 800 },
        { text: "Kinder Bueno", points: 700 },
        { text: "Bounty", points: 600 },
        { text: "Lion", points: 500 },
        { text: "Pawełek", points: 400 },
        { text: "KitKat", points: 300 },
        { text: "Milky Way", points: 200 },
        { text: "3Bit", points: 100 },
      ]
    },
    {
      text: "Co ludzie często udają, że rozumieją, choć nie rozumieją?",
      answers: [
        { text: "Podatki", points: 1000 },
        { text: "Politykę", points: 900 },
        { text: "Kryptowaluty", points: 800 },
        { text: "Sztukę współczesną", points: 700 },
        { text: "Instrukcję leku", points: 600 },
        { text: "Umowę kredytu", points: 500 },
        { text: "Memy", points: 400 },
        { text: "Excela", points: 300 },
        { text: "AI", points: 200 },
        { text: "Spalony", points: 100 },
      ]
    },
    {
      text: "Państwo, którego nazwa kończy się na \"NIA\"",
      answers: [
        { text: "Hiszpania", points: 1000 },
        { text: "Dania", points: 900 },
        { text: "Rumunia", points: 800 },
        { text: "Albania", points: 700 },
        { text: "Estonia", points: 600 },
        { text: "Kenia", points: 500 },
        { text: "Słowenia", points: 400 },
        { text: "Armenia", points: 300 },
        { text: "Jordania", points: 200 },
        { text: "Tanzania", points: 100 },
      ]
    },
    {
      text: "Do jakiego kraju Polacy jeżdżą/latają na wakacje?",
      answers: [
        { text: "Grecja", points: 1000 },
        { text: "Hiszpania", points: 900 },
        { text: "Włochy", points: 800 },
        { text: "Egipt", points: 700 },
        { text: "Turcja", points: 600 },
        { text: "Chorwacja", points: 500 },
        { text: "Bułgaria", points: 400 },
        { text: "Portugalia", points: 300 },
        { text: "Albania", points: 200 },
        { text: "Tunezja", points: 100 },
      ]
    },
    {
      text: "Co ludzie najczęściej mają przy łóżku?",
      answers: [
        { text: "Telefon", points: 1000 },
        { text: "Lampkę", points: 900 },
        { text: "Ładowarkę", points: 800 },
        { text: "Prezerwatywę", points: 700 },
        { text: "Książkę", points: 600 },
        { text: "Chusteczki", points: 500 },
        { text: "Pilot", points: 400 },
        { text: "Zegarek", points: 300 },
        { text: "Szklankę", points: 200 },
        { text: "Okulary", points: 100 },
      ]
    },
    {
      text: "Popularny superbohater",
      answers: [
        { text: "Batman", points: 1000 },
        { text: "Spider-Man", points: 900 },
        { text: "Superman", points: 800 },
        { text: "Hulk", points: 700 },
        { text: "Iron Man", points: 600 },
        { text: "Thor", points: 500 },
        { text: "Kapitan Ameryka", points: 400 },
        { text: "Wonder Woman", points: 300 },
        { text: "Wolverine", points: 200 },
        { text: "Flash", points: 100 },
      ]
    },
    {
      text: "Wymień sport, w którym rywalizujesz bez bezpośredniego kontaktu fizycznego",
      answers: [
        { text: "Tenis", points: 1000 },
        { text: "Tenis stołowy", points: 900 },
        { text: "Siatkówka", points: 800 },
        { text: "Badminton", points: 700 },
        { text: "Szachy", points: 600 },
        { text: "Squash", points: 500 },
        { text: "Bilard", points: 400 },
        { text: "Golf", points: 300 },
        { text: "Dart", points: 200 },
        { text: "Kręgle", points: 100 },
      ]
    },
    {
      text: "Popularne polskie nazwisko",
      answers: [
        { text: "Kowalski", points: 1000 },
        { text: "Nowak", points: 900 },
        { text: "Lewandowski", points: 800 },
        { text: "Wiśniewski", points: 700 },
        { text: "Kowalczyk", points: 600 },
        { text: "Kamiński", points: 500 },
        { text: "Wójcik", points: 400 },
        { text: "Zieliński", points: 300 },
        { text: "Szymański", points: 200 },
        { text: "Woźniak", points: 100 },
      ]
    },
    {
      text: "Co można powiedzieć podczas gry w karty?",
      answers: [
        { text: "Wchodzę", points: 1000 },
        { text: "Nie kończ jeszcze", points: 900 },
        { text: "Tasuj porządnie", points: 800 },
        { text: "Nie patrz", points: 700 },
        { text: "Odsłaniasz czy czekasz?", points: 600 },
        { text: "Masz niezły układ", points: 500 },
        { text: "Teraz ja", points: 400 },
        { text: "Spokojnie, po kolei", points: 300 },
        { text: "Ale mnie przebiłeś", points: 200 },
        { text: "Dzisiaj wyjątkowo ci idzie", points: 100 },
      ]
    },
    {
      text: "Co golimy?",
      answers: [
        { text: "Jaja", points: 1000 },
        { text: "Broda", points: 900 },
        { text: "Nogi", points: 800 },
        { text: "Pachy", points: 700 },
        { text: "Wąsy", points: 600 },
        { text: "Cipka", points: 500 },
        { text: "Klatka piersiowa", points: 400 },
        { text: "Dupa", points: 300 },
        { text: "Ręce", points: 200 },
        { text: "Brwi", points: 100 },
      ]
    },
    {
      text: "Słowo, którego nazwa kończy się na \"owiec\"",
      answers: [
        { text: "Naukowiec", points: 1000 },
        { text: "Fachowiec", points: 900 },
        { text: "Biurowiec", points: 800 },
        { text: "Sportowiec", points: 700 },
        { text: "Śmigłowiec", points: 600 },
        { text: "Zawodowiec", points: 500 },
        { text: "Pokrowiec", points: 400 },
        { text: "Szybowiec", points: 300 },
        { text: "Drogowiec", points: 200 },
        { text: "Związkowiec", points: 100 },
      ]
    }
  ];
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
  };

  if (gameState.roundData) {
    base.questionText = gameState.roundData.questionText;
    base.revealedAnswers = gameState.roundData.revealedAnswers;
    base.roundOrder = gameState.roundOrder;
    base.currentTurnIndex = gameState.currentTurnIndex;
    base.currentPlayerName = gameState.roundOrder[gameState.currentTurnIndex] || null;
    base.top2 = gameState.top2;
  }

  if (['roundSummary', 'voting', 'votingResults'].includes(gameState.phase) && gameState.roundData) {
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
  clearTimeout(gameState.turnTimer);
  clearTimeout(gameState.revealTimer);
  gameState.lastWrongAnswer = null;
  const currentName = gameState.roundOrder[gameState.currentTurnIndex];
  if (!currentName) {
    if (gameState.currentRound === 11) endRound11(); else startRevealSequence();
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
    if (gameState.players[playerName].wrongAnswers >= 2) {
      endGameInstantly(playerName);
      return;
    }
  }
  io.emit('timerStart', { duration: 5, phase: 'reveal', correct: false, message: 'Czas minął! Brak odpowiedzi.' });
  gameState.revealTimer = setTimeout(() => { nextTurn(); }, 5000);
}

function nextTurn() {
  gameState.currentTurnIndex++;
  if (gameState.currentRound === 11) {
    if (gameState.currentTurnIndex >= 6 || gameState.roundData.revealedAnswers.length >= 10) endRound11();
    else { broadcastState(); startTurnTimer(); }
  } else {
    if (gameState.currentTurnIndex >= gameState.roundOrder.length || gameState.roundData.revealedAnswers.length >= 10) startRevealSequence();
    else { broadcastState(); startTurnTimer(); }
  }
}

function endGameInstantly(failedPlayerName) {
  const winner = gameState.top2.find(n => n !== failedPlayerName);
  io.emit('timerStart', { duration: 5, phase: 'reveal', correct: false, message: `${failedPlayerName} odpada! Wygrywa ${winner}!` });
  setTimeout(() => {
    gameState.phase = 'finalSummary';
    gameState.liarHistory.push({ round: 11, liarName: gameState.liarName, caught: false, notes: `${failedPlayerName} pomylił się 2 razy.` });
    broadcastState();
  }, 5000);
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
    if (step < unrevealed.length) {
      io.emit('revealSingle', unrevealed[step]);
      step++;
      setTimeout(revealNext, 5000);
    } else {
      io.emit('revealDone');
      setTimeout(() => { postRoundRouting(); }, 10000);
    }
  }
  revealNext();
}

function postRoundRouting() {
  if (VOTING_ROUNDS.includes(gameState.currentRound)) {
    startVoting();
  } else {
    gameState.phase = 'roundSummary';
    broadcastState();
  }
}

function startVoting() {
  gameState.phase = 'voting';
  gameState.votes = {};
  gameState.votingTimeLeft = 90;
  broadcastState();
  gameState.votingInterval = setInterval(() => {
    gameState.votingTimeLeft--;
    io.emit('votingTimer', { timeLeft: gameState.votingTimeLeft });
    if (gameState.votingTimeLeft <= 0) {
      clearInterval(gameState.votingInterval);
      resolveVoting();
    }
  }, 1000);
}

function resolveVoting() {
  clearInterval(gameState.votingInterval);
  const tally = {};
  Object.values(gameState.votes).forEach(vName => { tally[vName] = (tally[vName] || 0) + 1; });

  let maxVotes = 0, accusedName = null;
  for (const [name, count] of Object.entries(tally)) {
    if (count > maxVotes) { maxVotes = count; accusedName = name; }
  }

  let liarCaught = false;
  if (accusedName === gameState.liarName && maxVotes >= 3) {
    liarCaught = true;
    if (gameState.players[gameState.liarName]) gameState.players[gameState.liarName].score -= 300;
  }

  Object.entries(gameState.votes).forEach(([voterName, votedFor]) => {
    if (voterName === gameState.liarName) return; 
    const p = gameState.players[voterName];
    if (!p) return;
    if (votedFor === gameState.liarName) p.score += 300;
    else p.score -= 100;
  });

  gameState.liarHistory.push({
    round: gameState.currentRound,
    liarName: gameState.liarName,
    caught: liarCaught,
    accusedName: accusedName || 'Brak'
  });

  if (liarCaught) {
    Object.values(gameState.players).forEach(p => p.isLiar = false);
    gameState.liarName = pickNewLiar(null);
  }

  gameState.phase = 'votingResults';
  broadcastState();
}

function pickNewLiar(excludeName, pool) {
  const names = pool || Object.keys(gameState.players).filter(n => n !== excludeName);
  if (names.length === 0) return Object.keys(gameState.players)[0];
  const chosen = names[Math.floor(Math.random() * names.length)];
  if (gameState.players[chosen]) gameState.players[chosen].isLiar = true;
  return chosen;
}

function startNextRound() {
  gameState.currentRound++;
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
  
  // Kolejność: od najmniejszej liczby punktów do największej
  gameState.roundOrder = Object.values(gameState.players)
    .sort((a, b) => a.score - b.score)
    .map(p => p.name);

  gameState.currentTurnIndex = 0;
  gameState.roundData = {
    questionText: question.text,
    answers: question.answers,
    revealedAnswers: [],
  };
  gameState.phase = 'round';
  broadcastState();
  startTurnTimer();
}

function setupRound11() {
  const sorted = Object.values(gameState.players).sort((a, b) => b.score - a.score);
  gameState.top2 = sorted.slice(0, 2).map(p => p.name);
  
  Object.values(gameState.players).forEach(p => p.isLiar = false);
  if (gameState.top2.includes(gameState.liarName)) {
    gameState.players[gameState.liarName].isLiar = true;
  } else {
    gameState.liarName = pickNewLiar(null, gameState.top2);
  }

  const qIndex = 10;
  const question = gameState.questions[qIndex];

  // Zaczyna gracz z MNIEJSZĄ ilością punktów spośród Top 2
  const starter = gameState.players[gameState.top2[0]].score < gameState.players[gameState.top2[1]].score ? gameState.top2[0] : gameState.top2[1];
  const second = starter === gameState.top2[0] ? gameState.top2[1] : gameState.top2[0];
  
  gameState.roundOrder = [starter, second, starter, second, starter, second]; // 3 tury naprzemiennie
  gameState.currentTurnIndex = 0;
  gameState.roundData = { questionText: question.text, answers: question.answers, revealedAnswers: [] };
  gameState.phase = 'round';
  broadcastState();
  startTurnTimer();
}

function endRound11() {
  gameState.phase = 'speeches';
  // Mowy: najpierw gracz z większą ilością punktów z Top 2
  const firstSpeaker = gameState.players[gameState.top2[0]].score >= gameState.players[gameState.top2[1]].score ? gameState.top2[0] : gameState.top2[1];
  gameState.speechPlayerName = firstSpeaker;
  gameState.votingTimeLeft = 90;
  broadcastState();

  gameState.votingInterval = setInterval(() => {
    gameState.votingTimeLeft--;
    io.emit('votingTimer', { timeLeft: gameState.votingTimeLeft });
    if (gameState.votingTimeLeft <= 0) {
      clearInterval(gameState.votingInterval);
      const secondSpeaker = gameState.top2.find(n => n !== firstSpeaker);
      if (gameState.speechPlayerName === firstSpeaker) {
        gameState.speechPlayerName = secondSpeaker;
        gameState.votingTimeLeft = 90;
        broadcastState();
        gameState.votingInterval = setInterval(() => {
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
  gameState.votingTimeLeft = 90;
  broadcastState();
  gameState.votingInterval = setInterval(() => {
    gameState.votingTimeLeft--;
    io.emit('votingTimer', { timeLeft: gameState.votingTimeLeft });
    if (gameState.votingTimeLeft <= 0) {
      clearInterval(gameState.votingInterval);
      resolveFinalVoting();
    }
  }, 1000);
}

function resolveFinalVoting() {
  clearInterval(gameState.votingInterval);
  const tally = {};
  Object.values(gameState.votes).forEach(vName => { tally[vName] = (tally[vName] || 0) + 1; });
  let maxVotes = 0, accusedName = null;
  for (const [name, count] of Object.entries(tally)) {
    if (count > maxVotes) { maxVotes = count; accusedName = name; }
  }

  gameState.liarHistory.push({ round: 11, liarName: gameState.liarName, caught: accusedName === gameState.liarName, accusedName: accusedName || 'Brak' });
  gameState.phase = 'finalSummary';
  broadcastState();
}

app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) res.json({ ok: true });
  else res.status(401).json({ ok: false });
});

io.on('connection', (socket) => {
  socket.on('joinAdmin', () => {
    gameState.adminSocketId = socket.id;
    broadcastState();
  });

  socket.on('joinGame', ({ name }) => {
    const normName = name.trim();
    if (gameState.players[normName]) {
      if (gameState.players[normName].connected) {
        socket.emit('error', 'Gracz o tym imieniu jest już w grze.');
        return;
      }
      gameState.players[normName].socketId = socket.id;
      gameState.players[normName].connected = true;
      broadcastState();
    } else {
      if (gameState.phase !== 'lobby') { socket.emit('error', 'Gra już trwa.'); return; }
      if (Object.keys(gameState.players).length >= 7) { socket.emit('error', 'Maksymalna liczba graczy osiągnięta.'); return; }
      gameState.players[normName] = { name: normName, socketId: socket.id, score: 0, isLiar: false, connected: true, wrongAnswers: 0 };
      broadcastState();
    }
  });

  socket.on('startGame', () => {
    if (socket.id !== gameState.adminSocketId) return;
    if (Object.keys(gameState.players).length < 2) { socket.emit('error', 'Potrzeba co najmniej 2 graczy.'); return; }
    gameState.currentRound = 0;
    gameState.liarHistory = [];
    startNextRound();
  });

  socket.on('startNextRound', () => {
    if (socket.id !== gameState.adminSocketId) return;
    startNextRound();
  });

  socket.on('submitAnswer', ({ answer }) => {
    if (gameState.phase !== 'round') return;
    const currentName = gameState.roundOrder[gameState.currentTurnIndex];
    const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
    if (!player || player.name !== currentName) return;
    clearTimeout(gameState.turnTimer);

    const rd = gameState.roundData;
    const idx = matchAnswer(answer, rd.answers, rd.revealedAnswers.map(r => r.index));

    if (idx >= 0) {
      const ans = rd.answers[idx];
      player.score += ans.points;
      rd.revealedAnswers.push({ index: idx, text: ans.text, points: ans.points, byName: player.name });
      io.emit('timerStart', { duration: 5, phase: 'reveal', correct: true, message: `Trafiłeś! +${ans.points} pkt` });
      gameState.revealTimer = setTimeout(() => nextTurn(), 5000);
    } else {
      gameState.lastWrongAnswer = { playerName: player.name, text: answer };
      io.emit('timerStart', { duration: 5, phase: 'reveal', correct: false, message: 'Zła odpowiedź!' });
      broadcastState(); // Update admin state to show wrong answer override
      gameState.revealTimer = setTimeout(() => {
        if (gameState.currentRound === 11) {
          player.wrongAnswers++;
          if (player.wrongAnswers >= 2) { endGameInstantly(player.name); return; }
        }
        nextTurn();
      }, 5000);
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
      io.emit('timerStart', { duration: 4, phase: 'reveal', correct: true, message: `Korekta Admina: Trafiłeś! +${ans.points} pkt` });
      gameState.lastWrongAnswer = null;
      gameState.revealTimer = setTimeout(() => nextTurn(), 4000);
    }
  });

  socket.on('vote', ({ votedName }) => {
    if (!['voting', 'finalVoting'].includes(gameState.phase)) return;
    const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
    if (!player) return;
    if (gameState.phase === 'finalVoting' && gameState.top2.includes(player.name)) return; // Top 2 cannot vote in final
    gameState.votes[player.name] = votedName;
    broadcastState();
  });

  socket.on('disconnect', () => {
    if (gameState.adminSocketId === socket.id) gameState.adminSocketId = null;
    const p = Object.values(gameState.players).find(x => x.socketId === socket.id);
    if (p) { p.connected = false; broadcastState(); }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serwer działa na porcie ${PORT}`));