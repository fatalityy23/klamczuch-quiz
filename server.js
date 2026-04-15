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
// ZMIANA: Usunięto rundę 9 z głosowania
const VOTING_ROUNDS = [2, 4, 6, 8, 10];
const FORBIDDEN_WORDS = ['cwel', 'nigger', 'czarnuch'];

let gameState = {
  phase: 'lobby',
  players: {},
  adminSocketId: null,
  questions: [],
  currentRound: 0,
  totalRounds: 11,
  roundData: null,
  liarName: null,
  previousLiarName: null, // Pomocnicze do unikania powtórek
  votes: {},
  votingTimeLeft: 0,
  votingInterval: null,
  roundOrder: [],
  currentTurnIndex: 0,
  turnInterval: null,
  turnTimeLeft: 0,
  revealTimer: null,
  liarHistory: [],
  lastWrongAnswer: null,
  top2: [],
  speechPlayerName: null,
  isPaused: false,
  lastVotingChanges: {},
  lastVoteScores: {}, // Wyniki z momentu ostatniego głosowania
  isAnswerLocked: false,
  hiddenLiarPoints: 0,
  lastRecoveredPoints: 0,
  endReason: null,
  finalVotes: null,   
  finalTally: null,
  rulesUnderstood: {} 
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

// --- Zestawy pytań (bez zmian w treści) ---
function getSet1() { return [ { text: "Wymień popularne batony", answers: [ { text: "3Bit", points: 1000 }, { text: "Milky Way", points: 900 }, { text: "KitKat", points: 800 }, { text: "Pawełek", points: 700 }, { text: "Lion", points: 600 }, { text: "Bounty", points: 500 }, { text: "Kinder Bueno", points: 400 }, { text: "Mars", points: 300 }, { text: "Twix", points: 200 }, { text: "Snickers", points: 100 } ] }, { text: "Co ludzie często udają, że rozumieją, choć nie rozumieją?", answers: [ { text: "Spalony", points: 1000 }, { text: "AI", points: 900 }, { text: "Excela", points: 800 }, { text: "Memy", points: 700 }, { text: "Umowę kredytu", points: 600 }, { text: "Instrukcję leku", points: 500 }, { text: "Sztukę współczesną", points: 400 }, { text: "Kryptowaluty", points: 300 }, { text: "Politykę", points: 200 }, { text: "Podatki", points: 100 } ] }, { text: "Państwo, którego nazwa kończy się na \"NIA\"", answers: [ { text: "Tanzania", points: 1000 }, { text: "Jordania", points: 900 }, { text: "Armenia", points: 800 }, { text: "Słowenia", points: 700 }, { text: "Kenia", points: 600 }, { text: "Estonia", points: 500 }, { text: "Albania", points: 400 }, { text: "Rumunia", points: 300 }, { text: "Dania", points: 200 }, { text: "Hiszpania", points: 100 } ] }, { text: "Do jakiego kraju Polacy jeżdżą/latają na wakacje?", answers: [ { text: "Tunezja", points: 1000 }, { text: "Albania", points: 900 }, { text: "Portugalia", points: 800 }, { text: "Bułgaria", points: 700 }, { text: "Chorwacja", points: 600 }, { text: "Turcja", points: 500 }, { text: "Egipt", points: 400 }, { text: "Włochy", points: 300 }, { text: "Hiszpania", points: 200 }, { text: "Grecja", points: 100 } ] }, { text: "Co ludzie najczęściej mają przy łóżku?", answers: [ { text: "Okulary", points: 1000 }, { text: "Szklankę", points: 900 }, { text: "Zegarek", points: 800 }, { text: "Pilot", points: 700 }, { text: "Chusteczki", points: 600 }, { text: "Książkę", points: 500 }, { text: "Prezerwatywę", points: 400 }, { text: "Ładowarkę", points: 300 }, { text: "Lampkę", points: 200 }, { text: "Telefon", points: 100 } ] }, { text: "Popularny superbohater", answers: [ { text: "Flash", points: 1000 }, { text: "Wolverine", points: 900 }, { text: "Wonder Woman", points: 800 }, { text: "Kapitan Ameryka", points: 700 }, { text: "Thor", points: 600 }, { text: "Iron Man", points: 500 }, { text: "Hulk", points: 400 }, { text: "Superman", points: 300 }, { text: "Spider-Man", points: 200 }, { text: "Batman", points: 100 } ] }, { text: "Wymień sport, w którym rywalizujesz bez bezpośredniego kontaktu fizycznego", answers: [ { text: "Kręgle", points: 1000 }, { text: "Dart", points: 900 }, { text: "Golf", points: 800 }, { text: "Bilard", points: 700 }, { text: "Squash", points: 600 }, { text: "Szachy", points: 500 }, { text: "Badminton", points: 400 }, { text: "Siatkówka", points: 300 }, { text: "Tenis stołowy", points: 200 }, { text: "Tenis", points: 100 } ] }, { text: "Popularne polskie nazwisko", answers: [ { text: "Woźniak", points: 1000 }, { text: "Szymański", points: 900 }, { text: "Zieliński", points: 800 }, { text: "Wójcik", points: 700 }, { text: "Kamiński", points: 600 }, { text: "Kowalczyk", points: 500 }, { text: "Wiśniewski", points: 400 }, { text: "Lewandowski", points: 300 }, { text: "Nowak", points: 200 }, { text: "Kowalski", points: 100 } ] }, { text: "Co można powiedzieć podczas gry w karty?", answers: [ { text: "Dzisiaj wyjątkowo ci idzie", points: 1000 }, { text: "Ale mnie przebiłeś", points: 900 }, { text: "Spokojnie, po kolei", points: 800 }, { text: "Teraz ja", points: 700 }, { text: "Masz niezły układ", points: 600 }, { text: "Odsłaniasz czy czekasz?", points: 500 }, { text: "Nie patrz", points: 400 }, { text: "Tasuj porządnie", points: 300 }, { text: "Nie kończ jeszcze", points: 200 }, { text: "Wchodzę", points: 100 } ] }, { text: "Co golimy?", answers: [ { text: "Brwi", points: 1000 }, { text: "Ręce", points: 900 }, { text: "Dupa", points: 800 }, { text: "Klatka piersiowa", points: 700 }, { text: "Cipka", points: 600 }, { text: "Wąsy", points: 500 }, { text: "Pachy", points: 400 }, { text: "Nogi", points: 300 }, { text: "Broda", points: 200 }, { text: "Jaja", points: 100 } ] }, { text: "Słowo, którego nazwa kończy się na \"owiec\"", answers: [ { text: "Związkowiec", points: 1000 }, { text: "Drogowiec", points: 900 }, { text: "Szybowiec", points: 800 }, { text: "Pokrowiec", points: 700 }, { text: "Zawodowiec", points: 600 }, { text: "Śmigłowiec", points: 500 }, { text: "Sportowiec", points: 400 }, { text: "Biurowiec", points: 300 }, { text: "Fachowiec", points: 200 }, { text: "Naukowiec", points: 100 } ] } ]; }
function getSet2() { return [ { text: "Co robimy rano zaraz po przebudzeniu?", answers: [ { text: "Picie wody", points: 1000 }, { text: "Budzik", points: 900 }, { text: "Ścielenie łóżka", points: 800 }, { text: "Ubieranie się", points: 700 }, { text: "Śniadanie", points: 600 }, { text: "Prysznic", points: 500 }, { text: "Mycie zębów", points: 400 }, { text: "Toaleta", points: 300 }, { text: "Kawa", points: 200 }, { text: "Telefon", points: 100 } ] }, { text: "Co kojarzy sie z wakacjami nad morzem?", answers: [ { text: "Latarnia", points: 1000 }, { text: "Statek", points: 900 }, { text: "Muszelki", points: 800 }, { text: "Gofry", points: 700 }, { text: "Mewy", points: 600 }, { text: "Lody", points: 500 }, { text: "Ryba", points: 400 }, { text: "Słońce", points: 300 }, { text: "Parawan", points: 200 }, { text: "Piasek", points: 100 } ] }, { text: "Zawod, w ktorym trzeba nosic mundur", answers: [ { text: "Listonosz", points: 1000 }, { text: "Marynarz", points: 900 }, { text: "Konduktor", points: 800 }, { text: "Kucharz", points: 700 }, { text: "Pielęgniarka", points: 600 }, { text: "Pilot", points: 500 }, { text: "Strażnik graniczny", points: 400 }, { text: "Żołnierz", points: 300 }, { text: "Strażak", points: 200 }, { text: "Policjant", points: 100 } ] }, { text: "Co robimy, gdy stoimy w dlugim korku?", answers: [ { text: "GPS", points: 1000 }, { text: "Myślenie", points: 900 }, { text: "Jedzenie", points: 800 }, { text: "Rozglądanie się", points: 700 }, { text: "Przeklinanie", points: 600 }, { text: "Rozmawianie", points: 500 }, { text: "Dłubanie w nosie", points: 400 }, { text: "Śpiewanie", points: 300 }, { text: "Patrzenie w telefon", points: 200 }, { text: "Słuchanie muzyki", points: 100 } ] }, { text: "Co mozna znalezc w damskiej torebce?", answers: [ { text: "Tabletki", points: 1000 }, { text: "Długopis", points: 900 }, { text: "Krem do rąk", points: 800 }, { text: "Perfumy", points: 700 }, { text: "Lusterko", points: 600 }, { text: "Szminka", points: 500 }, { text: "Chusteczki", points: 400 }, { text: "Klucze", points: 300 }, { text: "Portfel", points: 200 }, { text: "Telefon", points: 100 } ] }, { text: "Urzadzenie domowe, ktore psuje sie najczesciej", answers: [ { text: "Router", points: 1000 }, { text: "Pilot", points: 900 }, { text: "Kran", points: 800 }, { text: "Żarówka", points: 700 }, { text: "Odkurzacz", points: 600 }, { text: "Zmywarka", points: 500 }, { text: "Telewizor", points: 400 }, { text: "Czajnik", points: 300 }, { text: "Lodówka", points: 200 }, { text: "Pralka", points: 100 } ] }, { text: "Gdzie musimy zachowac absolutna cisze?", answers: [ { text: "Sypialnia", points: 1000 }, { text: "Sąd", points: 900 }, { text: "Egzamin", points: 800 }, { text: "Pogrzeb", points: 700 }, { text: "Muzeum", points: 600 }, { text: "Teatr", points: 500 }, { text: "Kino", points: 400 }, { text: "Szpital", points: 300 }, { text: "Kościół", points: 200 }, { text: "Biblioteka", points: 100 } ] }, { text: "Co kupujemy na stacji benzynowej poza paliwem?", answers: [ { text: "Zapalniczka", points: 1000 }, { text: "Olej", points: 900 }, { text: "Gazeta", points: 800 }, { text: "Alkohol", points: 700 }, { text: "Chipsy", points: 600 }, { text: "Napoje", points: 500 }, { text: "Papierosy", points: 400 }, { text: "Płyn do spryskiwaczy", points: 300 }, { text: "Hot-dog", points: 200 }, { text: "Kawa", points: 100 } ] }, { text: "Przedmiot, ktory czesto gubimy w domu", answers: [ { text: "Gumka do włosów", points: 1000 }, { text: "Długopis", points: 900 }, { text: "Ładowarka", points: 800 }, { text: "Słuchawki", points: 700 }, { text: "Okulary", points: 600 }, { text: "Skarpetki", points: 500 }, { text: "Portfel", points: 400 }, { text: "Pilot", points: 300 }, { text: "Telefon", points: 200 }, { text: "Klucze", points: 100 } ] }, { text: "Co robimy, gdy nie mozemy zasnac w nocy?", answers: [ { text: "Przewracanie się", points: 1000 }, { text: "Telewizja", points: 900 }, { text: "Jedzenie", points: 800 }, { text: "Sprzątanie", points: 700 }, { text: "Muzyka", points: 600 }, { text: "Picie melisy", points: 500 }, { text: "Myślenie", points: 400 }, { text: "Telefon", points: 300 }, { text: "Czytanie", points: 200 }, { text: "Liczenie owiec", points: 100 } ] }, { text: "Jakie jest najczęstsze wymówki by nie iść na siłownię?", answers: [ { text: "Brak sprzętu", points: 1000 }, { text: "Korki", points: 900 }, { text: "Deszcz", points: 800 }, { text: "Zimno", points: 700 }, { text: "Dużo ludzi", points: 600 }, { text: "Ból mięśni", points: 500 }, { text: "Za późno", points: 400 }, { text: "Brak czasu", points: 300 }, { text: "Choroba", points: 200 }, { text: "Zmęczenie", points: 100 } ] } ]; }
function getSet3() { return [ { text: "Popularne polskie danie obiadowe", answers: [ { text: "Placki ziemniaczane", points: 1000 }, { text: "Kopytka", points: 900 }, { text: "Żurek", points: 800 }, { text: "Gołąbki", points: 700 }, { text: "Bigos", points: 600 }, { text: "Mielony", points: 500 }, { text: "Zupa pomidorowa", points: 400 }, { text: "Rosół", points: 300 }, { text: "Pierogi", points: 200 }, { text: "Schabowy", points: 100 } ] }, { text: "Najczęściej oglądane kategorie porno", answers: [ { text: "Asian", points: 1000 }, { text: "Ebony", points: 900 }, { text: "Hentai", points: 800 }, { text: "Threesome", points: 700 }, { text: "Japanese", points: 600 }, { text: "Mature", points: 500 }, { text: "Anal", points: 400 }, { text: "MILF", points: 300 }, { text: "Transgender", points: 200 }, { text: "Lesbian", points: 100 } ] }, { text: "Najbardziej znani Polacy na świecie", answers: [ { text: "Roman Polański", points: 1000 }, { text: "Wisława Szymborska", points: 900 }, { text: "Andrzej Wajda", points: 800 }, { text: "Lech Wałęsa", points: 700 }, { text: "Iga Świątek", points: 600 }, { text: "Robert Lewandowski", points: 500 }, { text: "Fryderyk Chopin", points: 400 }, { text: "Maria Skłodowska-Curie", points: 300 }, { text: "Mikołaj Kopernik", points: 200 }, { text: "Jan Paweł II", points: 100 } ] }, { text: "Najczęściej używane synonimy kupy", answers: [ { text: "Bombardier", points: 1000 }, { text: "Kraken", points: 900 }, { text: "Kupsztal", points: 800 }, { text: "Bobek", points: 700 }, { text: "Kał", points: 600 }, { text: "Stolec", points: 500 }, { text: "Dwójka", points: 400 }, { text: "Klocek", points: 300 }, { text: "Sraka", points: 200 }, { text: "Gówno", points: 100 } ] }, { text: "Państwa z więcej niż jednego słowa", answers: [ { text: "Republika Południowej Afryki", points: 1000 }, { text: "Wybrzeże Kości Słoniowej", points: 900 }, { text: "Papua-Nowa Gwinea", points: 800 }, { text: "Bośnia i Hercegowina", points: 700 }, { text: "Korea Północna", points: 600 }, { text: "Korea Południowa", points: 500 }, { text: "Zjednoczone Emiraty Arabskie", points: 400 }, { text: "Arabia Saudyjska", points: 300 }, { text: "Nowa Zelandia", points: 200 }, { text: "Stany Zjednoczone", points: 100 } ] }, { text: "Gry, które zna każdy", answers: [ { text: "Call of Duty", points: 1000 }, { text: "Fortnite", points: 900 }, { text: "The Sims", points: 800 }, { text: "Pokemon", points: 700 }, { text: "GTA", points: 600 }, { text: "Pac-Man", points: 500 }, { text: "Tetris", points: 400 }, { text: "Mario", points: 300 }, { text: "FIFA", points: 200 }, { text: "Minecraft", points: 100 } ] }, { text: "Rozpoznawalne marki telefonu", answers: [ { text: "HTC", points: 1000 }, { text: "LG", points: 900 }, { text: "Siemens", points: 800 }, { text: "Huawei", points: 700 }, { text: "Motorola", points: 600 }, { text: "Sony Ericsson", points: 500 }, { text: "Xiaomi", points: 400 }, { text: "iPhone", points: 300 }, { text: "Samsung", points: 200 }, { text: "Nokia", points: 100 } ] }, { text: "Instrument dla kobiet", answers: [ { text: "Puzon", points: 1000 }, { text: "Kontrabas", points: 900 }, { text: "Akordeon", points: 800 }, { text: "Saksofon", points: 700 }, { text: "Wiolonczela", points: 600 }, { text: "Harfa", points: 500 }, { text: "Gitara", points: 400 }, { text: "Fortepian", points: 300 }, { text: "Flet", points: 200 }, { text: "Skrzypce", points: 100 } ] }, { text: "Co mężczyźni lubią bardziej niż seks?", answers: [ { text: "Łowienie ryb", points: 1000 }, { text: "Władzę", points: 900 }, { text: "Dobre jedzenie", points: 800 }, { text: "Piwo", points: 700 }, { text: "Gry komputerowe", points: 600 }, { text: "Szybką jazdę samochodem", points: 500 }, { text: "Mecze", points: 400 }, { text: "Spokój", points: 300 }, { text: "Pieniądze", points: 200 }, { text: "Nie ma takiej rzeczy", points: 100 } ] }, { text: "Czynności w pracy trzymane w tajemnicy", answers: [ { text: "Przeglądanie ofert pracy", points: 1000 }, { text: "Plotkowanie", points: 900 }, { text: "Wychodzenie na papierosa", points: 800 }, { text: "Urywanie się przed czasem", points: 700 }, { text: "Uprawianie seksu", points: 600 }, { text: "Drzemki", points: 500 }, { text: "Obijanie się", points: 400 }, { text: "Surfowanie w internecie", points: 300 }, { text: "Prywatne rozmowy telefoniczne", points: 200 }, { text: "Spóźnianie się", points: 100 } ] }, { text: "Co kupujemy na zapas", answers: [ { text: "Konserwy", points: 1000 }, { text: "Papierosy", points: 900 }, { text: "Mąkę", points: 800 }, { text: "Ryż", points: 700 }, { text: "Ziemniaki", points: 600 }, { text: "Prezerwatywy", points: 500 }, { text: "Alkohol", points: 400 }, { text: "Opał", points: 300 }, { text: "Cukier", points: 200 }, { text: "Papier toaletowy", points: 100 } ] } ]; }

function getQuestions(setId) {
    if (setId === 'set1') return getSet1();
    if (setId === 'set2') return getSet2();
    if (setId === 'set3') return getSet3();
    if (setId === 'test') {
        const q = [];
        for (let i = 1; i <= 11; i++) q.push({ text: `[TEST] Pytanie ${i}`, answers: [ { text: "J", points: 1000 }, { text: "I", points: 900 }, { text: "H", points: 800 }, { text: "G", points: 700 }, { text: "F", points: 600 }, { text: "E", points: 500 }, { text: "D", points: 400 }, { text: "C", points: 300 }, { text: "B", points: 200 }, { text: "A", points: 100 } ] });
        return q;
    }
    return getSet1(); 
}

// --- Logika dopasowania i pomocnicze ---
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
    if (normAnswer === normInput) return i;
    if (normInput.length >= 4 && (normAnswer.startsWith(normInput) || normAnswer.split(' ').some(w => w.startsWith(normInput)))) return i;
    if (normInput.length >= 3) {
        const threshold = Math.min(3, Math.max(1, Math.floor(Math.min(normInput.length, normAnswer.length) * 0.3)));
        if (levenshtein(normInput, normAnswer) <= threshold) return i;
    }
  }
  return -1;
}

function sortPlayersArray(playersArr) {
    return [...playersArr].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return 0; 
    });
}

function getPlayerList() {
  return sortPlayersArray(Object.values(gameState.players)).map(p => ({
    name: p.name, score: p.score, connected: p.connected, isLiar: p.isLiar, wrongAnswers: p.wrongAnswers
  }));
}

function broadcastState() {
  const isVotingNext = VOTING_ROUNDS.includes(gameState.currentRound);
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
    finalVotes: gameState.finalVotes, 
    finalTally: gameState.finalTally,
    rulesUnderstood: gameState.rulesUnderstood,
    lastVoteScores: gameState.lastVoteScores, // ZMIANA: Wysyłamy snapshot punktów
    isVotingNext: isVotingNext
  };

  if (gameState.roundData) {
    base.questionText = gameState.roundData.questionText;
    base.revealedAnswers = gameState.roundData.revealedAnswers;
    base.wrongAnswersList = gameState.roundData.wrongAnswersList;
    base.answerCount = gameState.roundData.answers.length;
    base.currentPlayerName = gameState.roundOrder[gameState.currentTurnIndex] || null;
    base.top2 = gameState.top2;
  }

  if (['roundSummary', 'scoreboard', 'voting', 'votingResults', 'revealingAnswers'].includes(gameState.phase) && gameState.roundData) {
    base.allAnswers = gameState.roundData.answers;
  }

  if (['voting', 'votingResults', 'preFinal', 'finalVoting'].includes(gameState.phase)) {
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
    // ZMIANA: Kłamczuch widzi też revealedAnswers w liarAnswers (obsłużone w HTML)
    if (player.isLiar && gameState.roundData && ['round', 'revealingAnswers', 'roundSummary', 'scoreboard'].includes(gameState.phase)) {
      payload.liarAnswers = gameState.roundData.answers;
    }
    io.to(player.socketId).emit('state', payload);
  });

  if (gameState.adminSocketId) {
    const adminPayload = { ...base, votes: gameState.votes, allAnswers: gameState.roundData?.answers, liarName: gameState.liarName, lastWrongAnswer: gameState.lastWrongAnswer };
    io.to(gameState.adminSocketId).emit('state', adminPayload);
  }
}

// --- Zarządzanie turami ---
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
  
  if (gameState.currentRound === 11 && gameState.players[playerName]) {
    gameState.players[playerName].wrongAnswers++;
    if (gameState.players[playerName].wrongAnswers >= 2) {
      io.emit('timerStart', { duration: 4, phase: 'reveal', correct: false, message: 'Druga pomyłka! Przegrana!' });
      gameState.revealTimer = setTimeout(() => {
          gameState.endReason = 'mistakes';
          gameState.phase = 'finalSummary';
          broadcastState();
      }, 4000);
      return; 
    }
  }
  io.emit('timerStart', { duration: 4, phase: 'reveal', correct: false, message: 'Czas minął!' });
  gameState.revealTimer = setTimeout(() => { nextTurn(); }, 4000);
}

function nextTurn() {
  if (gameState.isPaused) {
      setTimeout(nextTurn, 1000);
      return;
  }
  gameState.currentTurnIndex++;
  // ZMIANA: Finałowa runda teraz też przechodzi przez startRoundSummary, żeby pokazać odpowiedzi
  if (gameState.currentTurnIndex >= gameState.roundOrder.length || gameState.roundData.revealedAnswers.length >= 10) {
    startRoundSummary();
  } else {
    broadcastState();
    startTurnTimer();
  }
}

function startRoundSummary() {
  gameState.phase = 'roundSummary';
  broadcastState();
  
  setTimeout(() => startRevealSequence(), 3000);
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
      setTimeout(revealNext, 1500);
    } else {
      // ZMIANA: Po odkryciu wszystkich odpowiedzi, idziemy do fazy SCOREBOARD na 15 sekund
      gameState.phase = 'scoreboard';
      broadcastState();
      runTransition(15, () => { postRoundRouting(); });
    }
  }
  revealNext();
}

function postRoundRouting() {
  if (gameState.currentRound === 11) {
    // Jeśli to koniec rundy 11, idziemy do przemówień
    endRound11();
    return;
  }

  if (VOTING_ROUNDS.includes(gameState.currentRound)) {
    startVoting();
  } else {
    startNextRound();
  }
}

// --- Głosowanie ---
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
    if (gameState.votingTimeLeft <= 0) resolveVoting();
  }, 1000);
}

function resolveVoting() {
  if (gameState.phase !== 'voting') return;
  clearInterval(gameState.votingInterval);
  gameState.phase = 'votingResults';

  const tally = {};
  Object.values(gameState.votes).forEach(vName => { if (vName !== 'ABSTAIN') tally[vName] = (tally[vName] || 0) + 1; });

  let maxVotes = 0, accusedName = null;
  for (const [name, count] of Object.entries(tally)) { if (count > maxVotes) { maxVotes = count; accusedName = name; } }

  const changes = {};
  let liarCaught = (accusedName === gameState.liarName && maxVotes >= 3);
  let innocentCaught = (accusedName !== null && accusedName !== gameState.liarName && maxVotes >= 3);
  
  let recovered = 0;
  if (liarCaught) {
    if (gameState.players[gameState.liarName] && gameState.hiddenLiarPoints > 0) {
        gameState.players[gameState.liarName].score += gameState.hiddenLiarPoints;
        recovered = gameState.hiddenLiarPoints;
        changes[gameState.liarName] = recovered; 
    }
    Object.entries(gameState.votes).forEach(([voterName, votedFor]) => {
      if (votedFor === gameState.liarName && voterName !== gameState.liarName) {
          if(gameState.players[voterName]) { gameState.players[voterName].score += 500; changes[voterName] = 500; }
      }
    });
    gameState.hiddenLiarPoints = 0;
  } else if (innocentCaught) {
    Object.entries(gameState.votes).forEach(([voterName, votedFor]) => {
      if (votedFor === accusedName) {
          if(gameState.players[voterName]) { gameState.players[voterName].score = Math.max(0, gameState.players[voterName].score - 500); changes[voterName] = -500; }
      }
    });
    gameState.hiddenLiarPoints += 1000;
  }

  // Jeśli runda 10 i nikt nie złapał kłamczucha, oddajemy mu punkty
  if (gameState.currentRound === 10 && gameState.hiddenLiarPoints > 0 && !liarCaught) {
      if (gameState.players[gameState.liarName]) {
          gameState.players[gameState.liarName].score += gameState.hiddenLiarPoints;
          recovered = gameState.hiddenLiarPoints;
          changes[gameState.liarName] = (changes[gameState.liarName] || 0) + recovered;
      }
      gameState.hiddenLiarPoints = 0;
  }

  gameState.lastRecoveredPoints = recovered;
  gameState.lastVotingChanges = changes;
  gameState.liarHistory.push({ round: gameState.currentRound, liarName: gameState.liarName, caught: liarCaught, accusedName: accusedName || 'Brak' });

  if (liarCaught) {
    gameState.previousLiarName = gameState.liarName; // Zapamiętujemy, żeby nie wylosować go zaraz
    Object.values(gameState.players).forEach(p => p.isLiar = false);
    gameState.liarName = pickNewLiar(gameState.previousLiarName);
  }

  // ZMIANA: Po głosowaniu robimy snapshot punktów dla delty
  gameState.lastVoteScores = {};
  Object.values(gameState.players).forEach(p => { gameState.lastVoteScores[p.name] = p.score; });

  broadcastState();
  runTransition(12, () => { if (gameState.phase === 'votingResults') startNextRound(); });
}

function pickNewLiar(excludeName, pool) {
  let candidates = pool || Object.keys(gameState.players).filter(n => n !== excludeName);
  // ZMIANA: Jeśli mamy tylko 2 graczy i musimy jednego wykluczyć, to nie mamy wyboru, ale w grze na 7 osób to zadziała
  if (candidates.length === 0) candidates = Object.keys(gameState.players);
  
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
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
    gameState.hiddenLiarPoints = 0;
    // Snapshot startowy
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
  gameState.roundOrder = sortPlayersArray(Object.values(gameState.players)).reverse().map(p => p.name);
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
  gameState.liarName = pickNewLiar(null, gameState.top2); // W finale losujemy spośród top 2

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
          if (gameState.votingTimeLeft <= 0) { clearInterval(gameState.votingInterval); startFinalVoting(); }
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
    if (gameState.votingTimeLeft <= 0) resolveFinalVoting();
  }, 1000);
}

function resolveFinalVoting() {
  if (gameState.phase !== 'finalVoting') return;
  clearInterval(gameState.votingInterval);
  gameState.phase = 'finalSummary';
  gameState.endReason = 'normal_end'; 
  const tally = {};
  gameState.top2.forEach(name => tally[name] = 0); 
  Object.values(gameState.votes).forEach(vName => { if(vName !== 'ABSTAIN' && tally[vName] !== undefined) tally[vName]++; });
  
  let accusedName = null;
  const p1 = gameState.top2[0], p2 = gameState.top2[1];
  if (tally[p1] > tally[p2]) accusedName = p1;
  else if (tally[p2] > tally[p1]) accusedName = p2;
  else accusedName = sortPlayersArray([gameState.players[p1], gameState.players[p2]])[1].name; 

  gameState.finalVotes = gameState.votes;
  gameState.finalTally = tally;
  gameState.liarHistory.push({ round: 11, liarName: gameState.liarName, caught: accusedName === gameState.liarName, accusedName: accusedName });
  broadcastState();
}

// --- API Admina i Sockets ---
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) res.json({ ok: true });
  else res.status(401).json({ ok: false });
});

io.on('connection', (socket) => {
  socket.on('joinAdmin', (data) => {
    if (data && data.password === ADMIN_PASSWORD) { gameState.adminSocketId = socket.id; broadcastState(); }
  });

  socket.on('joinGame', ({ name }) => {
    const normName = name.trim();
    if (!normName) return;
    if (FORBIDDEN_WORDS.some(word => normName.toLowerCase().includes(word))) {
      socket.emit('error', 'Nieładna nazwa!'); return;
    }
    if (gameState.players[normName]) {
      if (gameState.players[normName].connected) { socket.emit('error', 'Imię zajęte.'); return; }
      gameState.players[normName].socketId = socket.id;
      gameState.players[normName].connected = true;
      broadcastState();
    } else {
      if (gameState.phase !== 'lobby') { socket.emit('error', 'Gra trwa.'); return; }
      if (Object.keys(gameState.players).length >= 7) { socket.emit('error', 'Pełno.'); return; }
      gameState.players[normName] = { name: normName, socketId: socket.id, score: 0, isLiar: false, connected: true, wrongAnswers: 0, pointsHistory: {} };
      broadcastState();
    }
  });

  socket.on('togglePause', () => { if (socket.id === gameState.adminSocketId) { gameState.isPaused = !gameState.isPaused; broadcastState(); } });

  socket.on('stopGame', () => {
    if (socket.id !== gameState.adminSocketId) return;
    clearTransitions();
    clearInterval(gameState.turnInterval);
    if (gameState.votingInterval) clearInterval(gameState.votingInterval); 
    gameState.phase = 'lobby';
    gameState.currentRound = 0;
    gameState.hiddenLiarPoints = 0;
    gameState.isPaused = false;
    Object.values(gameState.players).forEach(p => { p.score = 0; p.isLiar = false; p.wrongAnswers = 0; });
    broadcastState();
  });

  socket.on('startGame', ({ questionSet }) => {
    if (socket.id !== gameState.adminSocketId) return;
    gameState.questions = getQuestions(questionSet);
    gameState.currentRound = 0;
    gameState.liarHistory = [];
    startNextRound();
  });

  socket.on('startNextRound', () => { if (socket.id === gameState.adminSocketId) startNextRound(); });

  socket.on('rulesUnderstood', () => {
    if (gameState.phase !== 'preFinal') return;
    const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
    if (!player) return;
    gameState.rulesUnderstood[player.name] = true;
    broadcastState();
    const expected = Object.values(gameState.players).filter(p => p.connected).length;
    const currentReady = Object.keys(gameState.rulesUnderstood).filter(n => gameState.players[n]?.connected).length;
    if (expected > 0 && currentReady >= expected) setupRound11();
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
      io.emit('timerStart', { duration: 4, phase: 'reveal', correct: true, message: `Trafiony! +${ans.points}` });
      gameState.revealTimer = setTimeout(() => nextTurn(), 4000);
    } else {
      gameState.lastWrongAnswer = { playerName: player.name, text: answer };
      rd.wrongAnswersList.push({ text: answer, byName: player.name });
      if (gameState.currentRound === 11) {
          player.wrongAnswers++;
          if (player.wrongAnswers >= 2) {
              io.emit('timerStart', { duration: 4, phase: 'reveal', correct: false, message: 'Druga pomyłka!' });
              gameState.revealTimer = setTimeout(() => { gameState.endReason = 'mistakes'; gameState.phase = 'finalSummary'; broadcastState(); }, 4000);
              return; 
          }
      }
      io.emit('timerStart', { duration: 4, phase: 'reveal', correct: false, message: 'Źle!' });
      broadcastState();
      gameState.revealTimer = setTimeout(() => nextTurn(), 4000);
    }
  });

  socket.on('adminOverride', ({ answerIndex }) => {
    if (socket.id !== gameState.adminSocketId || !gameState.lastWrongAnswer) return;
    
    // ZMIANA: Nie czyścimy revealTimer ani nie wywołujemy nextTurn(), żeby nie przeskakiwać tury aktualnego gracza
    const playerName = gameState.lastWrongAnswer.playerName;
    const player = gameState.players[playerName];
    const rd = gameState.roundData;
    const ans = rd.answers[answerIndex];
    
    if (player && ans && !rd.revealedAnswers.some(r => r.index === answerIndex)) {
      player.score += ans.points;
      rd.revealedAnswers.push({ index: answerIndex, text: ans.text, points: ans.points, byName: playerName });
      
      const wIdx = rd.wrongAnswersList.findIndex(w => w.text === gameState.lastWrongAnswer.text && w.byName === playerName);
      if (wIdx !== -1) rd.wrongAnswersList.splice(wIdx, 1);

      // Wysyłamy info do wszystkich, że admin uznał odpowiedź (bez zmiany tury)
      io.emit('adminNotification', { message: `Host uznał odpowiedź gracza ${playerName}: ${ans.text} (+${ans.points} pkt)` });
      
      gameState.lastWrongAnswer = null;
      broadcastState();
    }
  });

  socket.on('vote', ({ votedName }) => {
    if (!['voting', 'finalVoting'].includes(gameState.phase)) return;
    const player = Object.values(gameState.players).find(p => p.socketId === socket.id);
    if (!player) return;
    gameState.votes[player.name] = votedName;
    broadcastState();
    const expected = Object.values(gameState.players).filter(p => p.connected).length;
    const current = Object.keys(gameState.votes).filter(n => gameState.players[n]?.connected).length;
    if (current >= expected && expected > 0) {
       if (gameState.phase === 'voting') resolveVoting();
       else resolveFinalVoting();
    }
  });

  socket.on('disconnect', () => {
    if (gameState.adminSocketId === socket.id) gameState.adminSocketId = null;
    const p = Object.values(gameState.players).find(x => x.socketId === socket.id);
    if (p) { p.connected = false; broadcastState(); }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Port: ${PORT}`));