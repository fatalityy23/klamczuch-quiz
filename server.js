const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

let gameState = {
  phase: 'lobby',
  players: {},
  adminSocketId: null,
  questions: defaultQuestions(),
  currentRound: 0,
  totalRounds: 6,
  roundData: null,
  liarId: null,
  lastLiarId: null,
  votes: {},
  powerupsUsed: {},
  votingTimeLeft: 0,
  votingInterval: null,
  roundOrder: [],
  currentTurnIndex: 0,
  turnTimer: null,
  revealTimer: null,
  usedQuestions: [],
  liarHistory: [],
};

function defaultQuestions() {
  return [
    {
      text: "O czym najczęściej zapominamy wychodząc z domu?",
      answers: [
        { text: "Zamknąć drzwi", points: 10 },
        { text: "Zabrać klucze", points: 9 },
        { text: "Telefon", points: 8 },
        { text: "Klucze od samochodu", points: 7 },
        { text: "Portfel", points: 6 },
        { text: "Ładowarka", points: 5 },
        { text: "Dokumenty", points: 4 },
        { text: "Parasolka", points: 3 },
        { text: "Zakupy", points: 2 },
        { text: "Leki", points: 1 },
      ]
    },
    {
      text: "Co ludzie robią jako pierwsze rano po przebudzeniu?",
      answers: [
        { text: "Sprawdzają telefon", points: 10 },
        { text: "Idą do łazienki", points: 9 },
        { text: "Wyłączają budzik", points: 8 },
        { text: "Piją kawę", points: 7 },
        { text: "Patrzą przez okno", points: 6 },
        { text: "Myją zęby", points: 5 },
        { text: "Biorą prysznic", points: 4 },
        { text: "Jedzą śniadanie", points: 3 },
        { text: "Włączają telewizor", points: 2 },
        { text: "Ćwiczą", points: 1 },
      ]
    },
    {
      text: "Co najczęściej robimy podczas nudy?",
      answers: [
        { text: "Przeglądamy telefon", points: 10 },
        { text: "Oglądamy Netflix", points: 9 },
        { text: "Jemy", points: 8 },
        { text: "Śpimy", points: 7 },
        { text: "Gramy w gry", points: 6 },
        { text: "Słuchamy muzyki", points: 5 },
        { text: "Dzwonimy do znajomych", points: 4 },
        { text: "Sprzątamy", points: 3 },
        { text: "Czytamy", points: 2 },
        { text: "Gotujemy", points: 1 },
      ]
    },
    {
      text: "Co najczęściej tracimy w domu?",
      answers: [
        { text: "Pilot", points: 10 },
        { text: "Klucze", points: 9 },
        { text: "Telefon", points: 8 },
        { text: "Skarpetki", points: 7 },
        { text: "Okulary", points: 6 },
        { text: "Ładowarkę", points: 5 },
        { text: "Portfel", points: 4 },
        { text: "Długopis", points: 3 },
        { text: "Słuchawki", points: 2 },
        { text: "Dokumenty", points: 1 },
      ]
    },
    {
      text: "Co najczęściej zamawiamy w restauracji fast food?",
      answers: [
        { text: "Burgera", points: 10 },
        { text: "Frytki", points: 9 },
        { text: "Colę", points: 8 },
        { text: "Nuggetsy", points: 7 },
        { text: "Pizzę", points: 6 },
        { text: "Hot-doga", points: 5 },
        { text: "Wrap", points: 4 },
        { text: "Sałatkę", points: 3 },
        { text: "Lody", points: 2 },
        { text: "Wodę", points: 1 },
      ]
    },
    {
      text: "Co najczęściej robimy gdy pada deszcz?",
      answers: [
        { text: "Zostajemy w domu", points: 10 },
        { text: "Bierzemy parasolkę", points: 9 },
        { text: "Narzekamy na pogodę", points: 8 },
        { text: "Zakładamy kurtkę", points: 7 },
        { text: "Oglądamy filmy", points: 6 },
        { text: "Pijemy herbatę", points: 5 },
        { text: "Biegniemy do auta", points: 4 },
        { text: "Czytamy książkę", points: 3 },
        { text: "Śpimy", points: 2 },
        { text: "Tańczymy w deszczu", points: 1 },
      ]
    },
  ];
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function normalize(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

function matchAnswer(input, answers, revealedIdxs) {
  const normInput = normalize(input);
  for (let i = 0; i < answers.length; i++) {
    if (revealedIdxs.includes(i)) continue;
    const normAnswer = normalize(answers[i].text);
    if (normAnswer === normInput || normAnswer.includes(normInput) || normInput.includes(normAnswer)) {
      return i;
    }
    const threshold = Math.min(3, Math.max(1, Math.floor(Math.min(normInput.length, normAnswer.length) * 0.3)));
    if (levenshtein(normInput, normAnswer) <= threshold) return i;
    const inputWords = normInput.split(' ').filter(w => w.length > 2);
    const ansWords   = normAnswer.split(' ').filter(w => w.length > 2);
    for (const iw of inputWords) {
      for (const aw of ansWords) {
        const t2 = Math.min(2, Math.max(1, Math.floor(Math.min(iw.length, aw.length) * 0.3)));
        if (levenshtein(iw, aw) <= t2) return i;
      }
    }
  }
  return -1;
}

function calcVotingPoints(playerId, usedPowerup) {
  const score = gameState.players[playerId]?.score || 0;
  const mult = usedPowerup ? 2 : 1;
  const gain = Math.round(score * 0.10 * mult);
  const loss = Math.round(score * 0.10 * mult);
  return { gain, loss };
}

function getPlayerList() {
  return Object.entries(gameState.players).map(([id, p]) => ({
    id, name: p.name, score: p.score, isHost: p.isHost,
    powerupUsed: gameState.powerupsUsed[id] || false,
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
    const rd = gameState.roundData;
    base.questionText = rd.questionText;
    base.revealedAnswers = rd.revealedAnswers;
    base.currentTurnIndex = gameState.currentTurnIndex;
    base.roundOrder = gameState.roundOrder.map(id => ({
      id, name: gameState.players[id]?.name
    }));
    base.currentPlayerId = gameState.roundOrder[gameState.currentTurnIndex] || null;
  }

  if (['roundSummary','voting'].includes(gameState.phase) && gameState.roundData) {
    base.allAnswers = gameState.roundData.answers;
    base.revealedAnswers = gameState.roundData.revealedAnswers;
  }

  if (gameState.phase === 'voting') {
    base.votes = gameState.votes;
    base.votingTimeLeft = gameState.votingTimeLeft;
    base.powerupsUsed = { ...gameState.powerupsUsed };
  }

  Object.entries(gameState.players).forEach(([sid, player]) => {
    const payload = { ...base };
    if (player.isLiar && gameState.roundData && gameState.phase === 'round') {
      payload.liarAnswers = gameState.roundData.answers;
    }
    if (gameState.phase === 'voting') {
      const puUsed = gameState.powerupsUsed[sid] || false;
      payload.myVotingPoints = calcVotingPoints(sid, puUsed);
      payload.myPowerupUsed = puUsed;
    }
    io.to(sid).emit('state', payload);
  });

  if (gameState.adminSocketId) {
    const adminPayload = { ...base, votes: gameState.votes };
    if (gameState.roundData) adminPayload.allAnswers = gameState.roundData.answers;
    adminPayload.liarId = gameState.liarId;
    io.to(gameState.adminSocketId).emit('state', adminPayload);
  }
}

function startTurnTimer() {
  clearTimeout(gameState.turnTimer);
  clearTimeout(gameState.revealTimer);
  const currentId = gameState.roundOrder[gameState.currentTurnIndex];
  if (!currentId) { endRound(); return; }
  io.emit('timerStart', { duration: 15, phase: 'answer' });
  gameState.turnTimer = setTimeout(() => { showNoAnswer(); }, 15000);
}

function showNoAnswer() {
  clearTimeout(gameState.turnTimer);
  io.emit('timerStart', { duration: 5, phase: 'reveal', correct: false, message: 'Czas minął! Brak odpowiedzi.' });
  gameState.revealTimer = setTimeout(() => { nextTurn(); }, 5000);
}

function nextTurn() {
  gameState.currentTurnIndex++;
  if (gameState.currentTurnIndex >= gameState.roundOrder.length) endRound();
  else { broadcastState(); startTurnTimer(); }
}

function endRound() {
  clearTimeout(gameState.turnTimer);
  clearTimeout(gameState.revealTimer);
  gameState.phase = 'roundSummary';
  broadcastState();
}

function startVoting() {
  gameState.phase = 'voting';
  gameState.votes = {};
  gameState.votingTimeLeft = 60;
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
  Object.values(gameState.votes).forEach(vid => {
    tally[vid] = (tally[vid] || 0) + 1;
  });

  let maxVotes = 0, topId = null;
  for (const [id, count] of Object.entries(tally)) {
    if (count > maxVotes) { maxVotes = count; topId = id; }
  }
  const isTie = Object.values(tally).filter(c => c === maxVotes).length > 1;
  const liarCaught = !isTie && topId === gameState.liarId;

  Object.entries(gameState.players).forEach(([sid, player]) => {
    const puUsed = gameState.powerupsUsed[sid] || false;
    const mult = puUsed ? 2 : 1;
    const votedFor = gameState.votes[sid];

    if (sid === gameState.liarId) {
      if (liarCaught) {
        player.score = Math.max(0, player.score - Math.round(player.score * 0.20));
      }
    } else {
      const votedCorrectly = votedFor === gameState.liarId;
      if (votedCorrectly) {
        player.score += Math.round(player.score * 0.10 * mult);
      } else {
        player.score = Math.max(0, player.score - Math.round(player.score * 0.10 * mult));
      }
    }
  });

  if (topId && topId !== gameState.liarId && !isTie) {
    const accused = gameState.players[topId];
    if (accused) {
      accused.score = Math.max(0, accused.score - Math.round(accused.score * 0.10));
    }
  }

  gameState.liarHistory.push({
    round: gameState.currentRound,
    liarId: gameState.liarId,
    liarName: gameState.players[gameState.liarId]?.name || '?',
    caught: liarCaught,
    accusedId: topId,
    accusedName: gameState.players[topId]?.name || '?',
  });

  if (liarCaught) {
    gameState.lastLiarId = gameState.liarId;
    Object.values(gameState.players).forEach(p => p.isLiar = false);
    gameState.liarId = null;
  }

  gameState.phase = gameState.currentRound >= gameState.totalRounds ? 'finalSummary' : 'roundSummary';
  broadcastState();
}

function pickNewLiar() {
  const ids = Object.keys(gameState.players).filter(id => id !== gameState.lastLiarId);
  if (ids.length === 0) return Object.keys(gameState.players)[0];
  return ids[Math.floor(Math.random() * ids.length)];
}

function buildRoundOrder(playerIds, lastFirstId) {
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  if (lastFirstId && shuffled[0] === lastFirstId) {
    const swap = Math.floor(Math.random() * (shuffled.length - 1)) + 1;
    [shuffled[0], shuffled[swap]] = [shuffled[swap], shuffled[0]];
  }
  return shuffled;
}

function startNextRound() {
  gameState.currentRound++;
  if (gameState.currentRound > gameState.totalRounds) {
    gameState.phase = 'finalSummary'; broadcastState(); return;
  }

  if (!gameState.liarId) gameState.liarId = pickNewLiar();
  Object.values(gameState.players).forEach(p => p.isLiar = false);
  if (gameState.players[gameState.liarId]) gameState.players[gameState.liarId].isLiar = true;

  let available = gameState.questions.filter((_, i) => !gameState.usedQuestions.includes(i));
  if (available.length === 0) { gameState.usedQuestions = []; available = gameState.questions; }
  const qIndex = gameState.questions.indexOf(available[0]);
  gameState.usedQuestions.push(qIndex);
  const question = gameState.questions[qIndex];

  const playerIds = Object.keys(gameState.players);
  const lastFirst = gameState.roundData?.roundOrder?.[0] || null;
  gameState.roundOrder = buildRoundOrder(playerIds, lastFirst);
  gameState.currentTurnIndex = 0;
  gameState.roundData = {
    questionText: question.text,
    answers: question.answers,
    revealedAnswers: [],
    roundOrder: [...gameState.roundOrder],
  };
  gameState.phase = 'round';
  broadcastState();
  startTurnTimer();
}

app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) res.json({ ok: true });
  else res.status(401).json({ ok: false });
});

app.post('/admin/questions', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ ok: false });
  if (gameState.phase !== 'lobby') return res.status(400).json({ ok: false, msg: 'Gra już trwa' });
  gameState.questions = req.body.questions;
  res.json({ ok: true });
});

app.get('/admin/questions', (req, res) => res.json(gameState.questions));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

io.on('connection', (socket) => {
  socket.on('joinAdmin', () => {
    gameState.adminSocketId = socket.id;
    socket.emit('adminJoined', { questions: gameState.questions });
    broadcastState();
  });

  socket.on('joinGame', ({ name }) => {
    if (gameState.phase !== 'lobby') { socket.emit('error', 'Gra już trwa.'); return; }
    if (Object.keys(gameState.players).length >= 7) { socket.emit('error', 'Maksymalna liczba graczy osiągnięta.'); return; }
    gameState.players[socket.id] = { name, score: 0, isLiar: false };
    gameState.powerupsUsed[socket.id] = false;
    broadcastState();
  });

  socket.on('startGame', () => {
    if (socket.id !== gameState.adminSocketId) return;
    if (Object.keys(gameState.players).length < 2) { socket.emit('error', 'Potrzeba co najmniej 2 graczy.'); return; }
    gameState.currentRound = 0;
    gameState.lastLiarId = null;
    gameState.liarHistory = [];
    gameState.usedQuestions = [];
    Object.values(gameState.players).forEach(p => p.isLiar = false);
    Object.keys(gameState.players).forEach(id => gameState.powerupsUsed[id] = false);
    startNextRound();
  });

  socket.on('startNextRound', () => {
    if (socket.id !== gameState.adminSocketId) return;
    startNextRound();
  });

  socket.on('startVoting', () => {
    if (socket.id !== gameState.adminSocketId) return;
    startVoting();
  });

  socket.on('submitAnswer', ({ answer }) => {
    if (gameState.phase !== 'round') return;
    const currentId = gameState.roundOrder[gameState.currentTurnIndex];
    if (socket.id !== currentId) return;
    clearTimeout(gameState.turnTimer);

    const rd = gameState.roundData;
    const idx = matchAnswer(answer, rd.answers, rd.revealedAnswers.map(r => r.index));

    if (idx >= 0) {
      const ans = rd.answers[idx];
      gameState.players[socket.id].score += ans.points;
      rd.revealedAnswers.push({ index: idx, text: ans.text, points: ans.points, byName: gameState.players[socket.id].name });
      io.emit('timerStart', { duration: 5, phase: 'reveal', correct: true, message: `Trafiłeś! +${ans.points} pkt` });
      broadcastState();
      gameState.revealTimer = setTimeout(() => nextTurn(), 5000);
    } else {
      io.emit('timerStart', { duration: 5, phase: 'reveal', correct: false, message: 'Zła odpowiedź!' });
      broadcastState();
      gameState.revealTimer = setTimeout(() => nextTurn(), 5000);
    }
  });

  socket.on('vote', ({ votedId }) => {
    if (gameState.phase !== 'voting') return;
    if (!gameState.players[socket.id]) return;
    gameState.votes[socket.id] = votedId;
    broadcastState();
  });

  socket.on('usePowerup', () => {
    if (gameState.phase !== 'voting') return;
    if (!gameState.players[socket.id]) return;
    if (gameState.powerupsUsed[socket.id]) return;
    gameState.powerupsUsed[socket.id] = true;
    broadcastState();
  });

  socket.on('resetGame', () => {
    if (socket.id !== gameState.adminSocketId) return;
    gameState.phase = 'lobby';
    gameState.players = {};
    gameState.powerupsUsed = {};
    gameState.currentRound = 0;
    gameState.liarId = null;
    gameState.lastLiarId = null;
    gameState.votes = {};
    gameState.roundData = null;
    gameState.liarHistory = [];
    broadcastState();
  });

  socket.on('disconnect', () => {
    if (gameState.players[socket.id]) { delete gameState.players[socket.id]; broadcastState(); }
    if (gameState.adminSocketId === socket.id) gameState.adminSocketId = null;
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serwer działa na porcie ${PORT}`));
