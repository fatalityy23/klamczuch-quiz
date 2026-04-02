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
  questions: getQuestions('set1'),
  currentRound: 0,
  totalRounds: 11,
  roundData: null,
  liarName: null,
  votes: {},
  votingTimeLeft: 0,
  votingInterval: null,
  roundOrder: [],
  currentTurnIndex: 0,
  turnInterval: null, // ZMIANA: pętla czasu dla tury
  turnTimeLeft: 0,    // ZMIANA: pamięć ile zostało
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
    if (gameState.isPaused) return; // Zamraża w czasie pauzy
    t--;
    if (t > 0) {
      io.emit('globalCountdown', { timeLeft: t });
    } else {
      clearTransitions();
      callback();
    }
  }, 1000);
}

function getSet1() {
  return [
    { text: "Wymień popularne batony", answers: [ { text: "3Bit", points: 1000 }, { text: "Milky Way", points: 900 }, { text: "KitKat", points: 800 }, { text: "Pawełek", points: 700 }, { text: "Lion", points: 600 }, { text: "Bounty", points: 500 }, { text: "Kinder Bueno", points: 400 }, { text: "Mars", points: 300 }, { text: "Twix", points: 200 }, { text: "Snickers", points: 100 } ] },
    { text: "Co ludzie często udają, że rozumieją, choć nie rozumieją?", answers: [ { text: "Spalony", points: 1000 }, { text: "AI", points: 900 }, { text: "Excela", points: 800 }, { text: "Memy", points: 700 }, { text: "Umowę kredytu", points: 600 }, { text: "Instrukcję leku", points: 500 }, { text: "Sztukę współczesną", points: 400 }, { text: "Kryptowaluty", points: 300 }, { text: "Politykę", points: 200 }, { text: "Podatki", points: 100 } ] },
    { text: "Państwo, którego nazwa kończy się na \"NIA\"", answers: [ { text: "Tanzania", points: 1000 }, { text: "Jordania", points: 900 }, { text: "Armenia", points: 800 }, { text: "Słowenia", points: 700 }, { text: "Kenia", points: 600 }, { text: "Estonia", points: 500 }, { text: "Albania", points: 400 }, { text: "Rumunia", points: 300 }, { text: "Dania", points: 200 }, { text: "Hiszpania", points: 100 } ] },
    { text: "Do jakiego kraju Polacy jeżdżą/latają na wakacje?", answers: [ { text: "Tunezja", points: 1000 }, { text: "Albania", points: 900 }, { text: "Portugalia", points: 800 }, { text: "Bułgaria", points: 700 }, { text: "Chorwacja", points: 600 }, { text: "Turcja", points: 500 }, { text: "Egipt", points: 400 }, { text: "Włochy", points: 300 }, { text: "Hiszpania", points: 200 }, { text: "Grecja", points: 100 } ] },
    { text: "Co ludzie najczęściej mają przy łóżku?", answers: [ { text: "Okulary", points: 1000 }, { text: "Szklankę", points: 900 }, { text: "Zegarek", points: 800 }, { text: "Pilot", points: 700 }, { text: "Chusteczki", points: 600 }, { text: "Książkę", points: 500 }, { text: "Prezerwatywę", points: 400 }, { text: "Ładowarkę", points: 300 }, { text: "Lampkę", points: 200 }, { text: "Telefon", points: 100 } ] },
    { text: "Popularny superbohater", answers: [ { text: "Flash", points: 1000 }, { text: "Wolverine", points: 900 }, { text: "Wonder Woman", points: 800 }, { text: "Kapitan Ameryka", points: 700 }, { text: "Thor", points: 600 }, { text: "Iron Man", points: 500 }, { text: "Hulk", points: 400 }, { text: "Superman", points: 300 }, { text: "Spider-Man", points: 200 }, { text: "Batman", points: 100 } ] },
    { text: "Wymień sport, w którym rywalizujesz bez bezpośredniego kontaktu fizycznego", answers: [ { text: "Kręgle", points: 1000 }, { text: "Dart", points: 900 }, { text: "Golf", points: 800 }, { text: "Bilard", points: 700 }, { text: "Squash", points: 600 }, { text: "Szachy", points: 500 }, { text: "Badminton", points: 400 }, { text: "Siatkówka", points: 300 }, { text: "Tenis stołowy", points: 200 }, { text: "Tenis", points: 100 } ] },
    { text: "Popularne polskie nazwisko", answers: [ { text: "Woźniak", points: 1000 }, { text: "Szymański", points: 900 }, { text: "Zieliński", points: 800 }, { text: "Wójcik", points: 700 }, { text: "Kamiński", points: 600 }, { text: "Kowalczyk", points: 500 }, { text: "Wiśniewski", points: 400 }, { text: "Lewandowski", points: 300 }, { text: "Nowak", points: 200 }, { text: "Kowalski", points: 100 } ] },
    { text: "Co można powiedzieć podczas gry w karty?", answers: [ { text: "Dzisiaj wyjątkowo ci idzie", points: 1000 }, { text: "Ale mnie przebiłeś", points: 900 }, { text: "Spokojnie, po kolei", points: 800 }, { text: "Teraz ja", points: 700 }, { text: "Masz niezły układ", points: 600 }, { text: "Odsłaniasz czy czekasz?", points: 500 }, { text: "Nie patrz", points: 400 }, { text: "Tasuj porządnie", points: 300 }, { text: "Nie kończ jeszcze", points: 200 }, { text: "Wchodzę", points: 100 } ] },
    { text: "Co golimy?", answers: [ { text: "Brwi", points: 1000 }, { text: "Ręce", points: 900 }, { text: "Dupa", points: 800 }, { text: "Klatka piersiowa", points: 700 }, { text: "Cipka", points: 600 }, { text: "Wąsy", points: 500 }, { text: "Pachy", points: 400 }, { text: "Nogi", points: 300 }, { text: "Broda", points: 200 }, { text: "Jaja", points: 100 } ] },
    { text: "Słowo, którego nazwa kończy się na \"owiec\"", answers: [ { text: "Związkowiec", points: 1000 }, { text: "Drogowiec", points: 900 }, { text: "Szybowiec", points: 800 }, { text: "Pokrowiec", points: 700 }, { text: "Zawodowiec", points: 600 }, { text: "Śmigłowiec", points: 500 }, { text: "Sportowiec", points: 400 }, { text: "Biurowiec", points: 300 }, { text: "Fachowiec", points: 200 }, { text: "Naukowiec", points: 100 } ] }
  ];
}

function getSet2() {
  return [
    { text: "Co robimy rano zaraz po przebudzeniu?", answers: [ { text: "Picie wody", points: 1000 }, { text: "Budzik", points: 900 }, { text: "Ścielenie łóżka", points: 800 }, { text: "Ubieranie się", points: 700 }, { text: "Śniadanie", points: 600 }, { text: "Prysznic", points: 500 }, { text: "Mycie zębów", points: 400 }, { text: "Toaleta", points: 300 }, { text: "Kawa", points: 200 }, { text: "Telefon", points: 100 } ] },
    { text: "Co kojarzy sie z wakacjami nad morzem?", answers: [ { text: "Latarnia", points: 1000 }, { text: "Statek", points: 900 }, { text: "Muszelki", points: 800 }, { text: "Gofry", points: 700 }, { text: "Mewy", points: 600 }, { text: "Lody", points: 500 }, { text: "Ryba", points: 400 }, { text: "Słońce", points: 300 }, { text: "Parawan", points: 200 }, { text: "Piasek", points: 100 } ] },
    { text: "Zawod, w ktorym trzeba nosic mundur", answers: [ { text: "Listonosz", points: 1000 }, { text: "Marynarz", points: 900 }, { text: "Konduktor", points: 800 }, { text: "Kucharz", points: 700 }, { text: "Pielęgniarka", points: 600 }, { text: "Pilot", points: 500 }, { text: "Strażnik graniczny", points: 400 }, { text: "Żołnierz", points: 300 }, { text: "Strażak", points: 200 }, { text: "Policjant", points: 100 } ] },
    { text: "Co robimy, gdy stoimy w dlugim korku?", answers: [ { text: "GPS", points: 1000 }, { text: "Myślenie", points: 900 }, { text: "Jedzenie", points: 800 }, { text: "Rozglądanie się", points: 700 }, { text: "Przeklinanie", points: 600 }, { text: "Rozmawianie", points: 500 }, { text: "Dłubanie w nosie", points: 400 }, { text: "Śpiewanie", points: 300 }, { text: "Patrzenie w telefon", points: 200 }, { text: "Słuchanie muzyki", points: 100 } ] },
    { text: "Co mozna znalezc w damskiej torebce?", answers: [ { text: "Tabletki", points: 1000 }, { text: "Długopis", points: 900 }, { text: "Krem do rąk", points: 800 }, { text: "Perfumy", points: 700 }, { text: "Lusterko", points: 600 }, { text: "Szminka", points: 500 }, { text: "Chusteczki", points: 400 }, { text: "Klucze", points: 300 }, { text: "Portfel", points: 200 }, { text: "Telefon", points: 100 } ] },
    { text: "Urzadzenie domowe, ktore psuje sie najczesciej", answers: [ { text: "Router", points: 1000 }, { text: "Pilot", points: 900 }, { text: "Kran", points: 800 }, { text: "Żarówka", points: 700 }, { text: "Odkurzacz", points: 600 }, { text: "Zmywarka", points: 500 }, { text: "Telewizor", points: 400 }, { text: "Czajnik", points: 300 }, { text: "Lodówka", points: 200 }, { text: "Pralka", points: 100 } ] },
    { text: "Gdzie musimy zachowac absolutna cisze?", answers: [ { text: "Sypialnia", points: 1000 }, { text: "Sąd", points: 900 }, { text: "Egzamin", points: 800 }, { text: "Pogrzeb", points: 700 }, { text: "Muzeum", points: 600 }, { text: "Teatr", points: 500 }, { text: "Kino", points: 400 }, { text: "Szpital", points: 300 }, { text: "Kościół", points: 200 }, { text: "Biblioteka", points: 100 } ] },
    { text: "Co kupujemy na stacji benzynowej poza paliwem?", answers: [ { text: "Zapalniczka", points: 1000 }, { text: "Olej", points: 900 }, { text: "Gazeta", points: 800 }, { text: "Alkohol", points: 700 }, { text: "Chipsy", points: 600 }, { text: "Napoje", points: 500 }, { text: "Papierosy", points: 400 }, { text: "Płyn do spryskiwaczy", points: 300 }, { text: "Hot-dog", points: 200 }, { text: "Kawa", points: 100 } ] },
    { text: "Przedmiot, ktory czesto gubimy w domu", answers: [ { text: "Gumka do włosów", points: 1000 }, { text: "Długopis", points: 900 }, { text: "Ładowarka", points: 800 }, { text: "Słuchawki", points: 700 }, { text: "Okulary", points: 600 }, { text: "Skarpetki", points: 500 }, { text: "Portfel", points: 400 }, { text: "Pilot", points: 300 }, { text: "Telefon", points: 200 }, { text: "Klucze", points: 100 } ] },
    { text: "Co robimy, gdy nie mozemy zasnac w nocy?", answers: [ { text: "Przewracanie się", points: 1000 }, { text: "Telewizja", points: 900 }, { text: "Jedzenie", points: 800 }, { text: "Sprzątanie", points: 700 }, { text: "Muzyka", points: 600 }, { text: "Picie melisy", points: 500 }, { text: "Myślenie", points: 400 }, { text: "Telefon", points: 300 }, { text: "Czytanie", points: 200 }, { text: "Liczenie owiec", points: 100 } ] },
    { text: "Jakie jest najczęstsze wymówki by nie iść na siłownię?", answers: [ { text: "Brak sprzętu", points: 1000 }, { text: "Korki", points: 900 }, { text: "Deszcz", points: 800 }, { text: "Zimno", points: 700 }, { text: "Dużo ludzi", points: 600 }, { text: "Ból mięśni", points: 500 }, { text: "Za późno", points: 400 }, { text: "Brak czasu", points: 300 }, { text: "Choroba", points: 200 }, { text: "Zmęczenie", points: 100 } ] }
  ];
}

function getSet3() {
  return [
    { text: "Popularne polskie danie obiadowe", answers: [ { text: "Placki ziemniaczane", points: 1000 }, { text: "Kopytka", points: 900 }, { text: "Żurek", points: 800 }, { text: "Gołąbki", points: 700 }, { text: "Bigos", points: 600 }, { text: "Mielony", points: 500 }, { text: "Zupa pomidorowa", points: 400 }, { text: "Rosół", points: 300 }, { text: "Pierogi", points: 200 }, { text: "Schabowy", points: 100 } ] },
    { text: "Najczęściej oglądane kategorie porno", answers: [ { text: "Asian", points: 1000 }, { text: "Ebony", points: 900 }, { text: "Hentai", points: 800 }, { text: "Threesome", points: 700 }, { text: "Japanese", points: 600 }, { text: "Mature", points: 500 }, { text: "Anal", points: 400 }, { text: "MILF", points: 300 }, { text: "Transgender", points: 200 }, { text: "Lesbian", points: 100 } ] },
    { text: "Najbardziej znani Polacy na świecie (all time - imię i nazwisko)", answers: [ { text: "Roman Polański", points: 1000 }, { text: "Wisława Szymborska", points: 900 }, { text: "Andrzej Wajda", points: 800 }, { text: "Lech Wałęsa", points: 700 }, { text: "Iga Świątek", points: 600 }, { text: "Robert Lewandowski", points: 500 }, { text: "Fryderyk Chopin", points: 400 }, { text: "Maria Skłodowska-Curie", points: 300 }, { text: "Mikołaj Kopernik", points: 200 }, { text: "Jan Paweł II", points: 100 } ] },
    { text: "Najczęściej używane synonimy kupy", answers: [ { text: "Bombardier", points: 1000 }, { text: "Kraken", points: 900 }, { text: "Kupsztal", points: 800 }, { text: "Bobek", points: 700 }, { text: "Kał", points: 600 }, { text: "Stolec", points: 500 }, { text: "Dwójka", points: 400 }, { text: "Klocek", points: 300 }, { text: "Sraka", points: 200 }, { text: "Gówno", points: 100 } ] },
    { text: "Państwa, których nazwa składa się z więcej niż jednego słowa", answers: [ { text: "Republika Południowej Afryki", points: 1000 }, { text: "Wybrzeże Kości Słoniowej", points: 900 }, { text: "Papua-Nowa Gwinea", points: 800 }, { text: "Bośnia i Hercegowina", points: 700 }, { text: "Korea Północna", points: 600 }, { text: "Korea Południowa", points: 500 }, { text: "Zjednoczone Emiraty Arabskie", points: 400 }, { text: "Arabia Saudyjska", points: 300 }, { text: "Nowa Zelandia", points: 200 }, { text: "Stany Zjednoczone", points: 100 } ] },
    { text: "Gry, które zna każdy", answers: [ { text: "Call of Duty", points: 1000 }, { text: "Fortnite", points: 900 }, { text: "The Sims", points: 800 }, { text: "Pokemon", points: 700 }, { text: "GTA", points: 600 }, { text: "Pac-Man", points: 500 }, { text: "Tetris", points: 400 }, { text: "Mario", points: 300 }, { text: "FIFA", points: 200 }, { text: "Minecraft", points: 100 } ] },
    { text: "Rozpoznawalne marki telefonu(all time)", answers: [ { text: "HTC", points: 1000 }, { text: "LG", points: 900 }, { text: "Siemens", points: 800 }, { text: "Huawei", points: 700 }, { text: "Motorola", points: 600 }, { text: "Sony Ericsson", points: 500 }, { text: "Xiaomi", points: 400 }, { text: "iPhone", points: 300 }, { text: "Samsung", points: 200 }, { text: "Nokia", points: 100 } ] },
    { text: "Z którym instrumentem kobietom jest najbardziej do twarzy", answers: [ { text: "Puzon", points: 1000 }, { text: "Kontrabas", points: 900 }, { text: "Akordeon", points: 800 }, { text: "Saksofon", points: 700 }, { text: "Wiolonczela", points: 600 }, { text: "Harfa", points: 500 }, { text: "Gitara", points: 400 }, { text: "Fortepian", points: 300 }, { text: "Flet", points: 200 }, { text: "Skrzypce", points: 100 } ] },
    { text: "Co zdaniem kobiet mężczyźni lubią bardziej niż seks?", answers: [ { text: "Łowienie ryb", points: 1000 }, { text: "Władzę", points: 900 }, { text: "Dobre jedzenie", points: 800 }, { text: "Piwo", points: 700 }, { text: "Gry komputerowe", points: 600 }, { text: "Szybką jazdę samochodem", points: 500 }, { text: "Mecze", points: 400 }, { text: "Spokój", points: 300 }, { text: "Pieniądze", points: 200 }, { text: "Nie ma takiej rzeczy", points: 100 } ] },
    { text: "Jakie czynności w pracy wolisz trzymać w tajemnicy przed szefem?", answers: [ { text: "Przeglądanie ofert pracy", points: 1000 }, { text: "Plotkowanie", points: 900 }, { text: "Wychodzenie na papierosa", points: 800 }, { text: "Urywanie się przed czasem", points: 700 }, { text: "Uprawianie seksu", points: 600 }, { text: "Drzemki", points: 500 }, { text: "Obijanie się", points: 400 }, { text: "Surfowanie w internecie", points: 300 }, { text: "Prywatne rozmowy telefoniczne", points: 200 }, { text: "Spóźnianie się", points: 100 } ] },
    { text: "Finałowe pytanie- Co kupujemy na zapas", answers: [ { text: "Konserwy", points: 1000 }, { text: "Papierosy", points: 900 }, { text: "Mąkę", points: 800 }, { text: "Ryż", points: 700 }, { text: "Ziemniaki", points: 600 }, { text: "Prezerwatywy", points: 500 }, { text: "Alkohol", points: 400 }, { text: "Opał", points: 300 }, { text: "Cukier", points: 200 }, { text: "Papier toaletowy", points: 100 } ] }
  ];
}

function testQuestions() {
  const q = [];
  for (let i = 1; i <= 11; i++) {
    q.push({
      text: `[TEST] Pytanie testowe ${i}`,
      answers: [
        { text: "J", points: 1000 }, { text: "I", points: 900 }, { text: "H", points: 800 },
        { text: "G", points: 700 }, { text: "F", points: 600 }, { text: "E", points: 500 },
        { text: "D", points: 400 }, { text: "C", points: 300 }, { text: "B", points: 200 }, { text: "A", points: 100 },
      ]
    });
  }
  return q;
}

function getQuestions(setId) {
    if (setId === 'set1') return getSet1();
    if (setId === 'set2') return getSet2();
    if (setId === 'set3') return getSet3();
    if (setId === 'test') return testQuestions();
    return getSet1(); 
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
  clearInterval(gameState.turnInterval);
  gameState.isAnswerLocked = false;
  
  if (gameState.isPaused) {
    setTimeout(startTurnTimer, 1000);
    return;
  }

  const currentName = gameState.roundOrder[gameState.currentTurnIndex];
  if (!currentName) {
    if (gameState.currentRound === 11) endRound11(); else startRoundSummary();
    return;
  }
  
  gameState.turnTimeLeft = gameState.currentTurnIndex === 0 ? 35 : 25;
  io.emit('timerStart', { duration: gameState.turnTimeLeft, phase: 'answer' });
  
  // ZMIANA: Zastąpiono setTimeout solidnym setInterval z uwzględnieniem pauzy
  gameState.turnInterval = setInterval(() => {
    if (gameState.isPaused) return; // Zatrzymuje spadek czasu
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
  
  if (gameState.currentRound === 11 && gameState.players[playerName]) {
    gameState.players[playerName].wrongAnswers++;
    if (gameState.players[playerName].wrongAnswers >= 2) {
      endGameInstantly(playerName);
      return;
    }
  }
  io.emit('timerStart', { duration: 4, phase: 'reveal', correct: false, message: 'Czas minął! Brak odpowiedzi.' });
  gameState.revealTimer = setTimeout(() => { nextTurn(); }, 4000);
}

function nextTurn() {
  if (gameState.isPaused) {
      setTimeout(nextTurn, 1000);
      return;
  }
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
  clearTransitions(); // Ukrywamy pasek globalnego czasu!
  
  // ZMIANA: Ciche odliczanie w tle, zatrzymywane w razie pauzy
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
  gameState.votingTimeLeft = 60;
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

  socket.on('togglePause', () => {
    if (socket.id !== gameState.adminSocketId) return; 
    gameState.isPaused = !gameState.isPaused;
    broadcastState();
    // Odliczanie (setInterval) i timery przejść (runTransition) same ogarną fakt, że jest od-pauzowane
  });

  socket.on('stopGame', () => {
    if (socket.id !== gameState.adminSocketId) return;
    clearTransitions();
    clearInterval(gameState.turnInterval);
    gameState.phase = 'lobby';
    gameState.currentRound = 0;
    gameState.isPaused = false;
    Object.values(gameState.players).forEach(p => { p.score = 0; p.isLiar = false; p.wrongAnswers = 0; });
    broadcastState();
  });

  socket.on('startGame', ({ questionSet }) => {
    if (socket.id !== gameState.adminSocketId) return;
    if (Object.keys(gameState.players).length < 2) { socket.emit('error', 'Potrzeba co najmniej 2 graczy.'); return; }
    
    gameState.questions = getQuestions(questionSet);
    
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
    clearInterval(gameState.turnInterval);

    const rd = gameState.roundData;
    const idx = matchAnswer(answer, rd.answers, rd.revealedAnswers.map(r => r.index));

    if (idx >= 0) {
      const ans = rd.answers[idx];
      player.score += ans.points;
      rd.revealedAnswers.push({ index: idx, text: ans.text, points: ans.points, byName: player.name });
      io.emit('timerStart', { duration: 4, phase: 'reveal', correct: true, message: `Trafiłeś! +${ans.points} pkt` });
      gameState.revealTimer = setTimeout(() => nextTurn(), 4000);
    } else {
      gameState.lastWrongAnswer = { playerName: player.name, text: answer };
      rd.wrongAnswersList.push({ text: answer, byName: player.name });
      io.emit('timerStart', { duration: 4, phase: 'reveal', correct: false, message: 'Zła odpowiedź!' });
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

      io.emit('timerStart', { duration: 3, phase: 'reveal', correct: true, message: `Korekta Admina: Trafiłeś! +${ans.points} pkt` });
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
server.listen(PORT, () => console.log(`Serwer działa na porcie ${PORT}`));