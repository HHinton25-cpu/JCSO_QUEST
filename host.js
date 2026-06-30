import { firebaseConfig, GAME_ROOT } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getDatabase, ref, set, update, get, onValue, off, remove, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

const LQ = window.LiveQuiz;
const $ = LQ.$;

let questionSets = [];
let selectedSet = null;
let bank = [];
let db = null;
let uid = null;
let firebaseReady = false;
let gamePin = '';
let playerUrl = '';
let unsubscribeGame = null;
let liveGame = null;
let selectedQuestions = [];
let activeQuestion = null;
let timerId = null;
let autoRevealTimer = null;
let revealInProgress = false;
let questionStartInProgress = false;
let lastPhase = '';
let lastRevealAudioKey = '';
let lastRevealAnimationKey = '';
let lastEndedAudioKey = '';

const RACE_FINISH_DISTANCE = 120;
const BATTLE_START_HEALTH = 100;

const els = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheElements();
  wireEvents();

  try {
    questionSets = await LQ.loadQuestionSets(els.loadStatus);
    selectedSet = questionSets[0] || null;
    bank = selectedSet?.bank || [];
    renderSetup();
  } catch (err) {
    LQ.setStatus(els.loadStatus, err.message, 'error');
    return;
  }

  try {
    await initFirebase();
  } catch (err) {
    console.error(err);
    els.firebaseWarning.classList.remove('hidden');
    LQ.setStatus(els.setupStatus, 'Connection setup needed before hosting.', 'error');
  }

  LQ.showScreen('setup');
}

function cacheElements() {
  [
    'load-status', 'bank-pill', 'question-set-select', 'game-mode-select', 'mode-preview', 'category-select', 'category-summary', 'question-count', 'timer-select',
    'shuffle-toggle', 'create-game', 'setup-status', 'firebase-warning', 'pin-display', 'lobby-mode-pill', 'copy-link',
    'join-url', 'join-qr', 'lobby-players', 'player-count-pill', 'start-game', 'round-label',
    'category-label', 'timer-bar', 'timer-text', 'answer-count', 'question-type', 'question-text',
    'mode-status-panel', 'answers-grid', 'reveal-now', 'next-question', 'reveal-title', 'correct-answer-text',
    'explanation-text', 'mode-reveal-banner', 'answer-bars', 'leaderboard-list', 'winner-title', 'final-mode-summary', 'final-leaderboard',
    'new-game', 'end-from-lobby', 'end-from-question'
  ].forEach(id => {
    els[toCamel(id)] = $(id);
  });
}

function wireEvents() {
  els.createGame.addEventListener('click', createGame);
  if (els.questionSetSelect) {
    els.questionSetSelect.addEventListener('change', () => {
      selectedSet = questionSets.find(set => set.id === els.questionSetSelect.value) || questionSets[0] || null;
      bank = selectedSet?.bank || [];
      renderSetup();
    });
  }
  if (els.gameModeSelect) {
    els.gameModeSelect.addEventListener('change', renderModePreview);
  }
  els.copyLink.addEventListener('click', async () => {
    const ok = await LQ.copyText(playerUrl);
    els.copyLink.textContent = ok ? 'Copied!' : 'Copy failed';
    setTimeout(() => { els.copyLink.textContent = 'Copy Join Link'; }, 1500);
  });
  els.startGame.addEventListener('click', startGame);
  els.revealNow.addEventListener('click', () => revealQuestion(true));
  els.nextQuestion.addEventListener('click', nextQuestion);
  els.newGame.addEventListener('click', () => window.location.href = 'host.html');
  els.endFromLobby.addEventListener('click', endGame);
  els.endFromQuestion.addEventListener('click', endGame);
}

function renderSetup() {
  if (!selectedSet && questionSets.length) selectedSet = questionSets[0];
  bank = selectedSet?.bank || [];

  if (els.questionSetSelect) {
    els.questionSetSelect.innerHTML = questionSets.map(set =>
      `<option value="${LQ.escapeAttr(set.id)}">${LQ.escapeHtml(set.label)} (${set.bank.length})</option>`
    ).join('');
    els.questionSetSelect.value = selectedSet?.id || questionSets[0]?.id || '';
  }

  if (els.gameModeSelect && !els.gameModeSelect.options.length) {
    els.gameModeSelect.innerHTML = LQ.gameModes.map(mode =>
      `<option value="${LQ.escapeAttr(mode.id)}">${mode.icon} ${LQ.escapeHtml(mode.name)}</option>`
    ).join('');
  }
  renderModePreview();

  els.bankPill.textContent = bank.length ? `${bank.length} ready` : 'No questions';

  const categories = [...new Set(bank.map(q => q.category))].sort((a, b) => a.localeCompare(b));
  const counts = LQ.countBy(bank, q => q.category);
  els.categorySelect.innerHTML = `<option value="all">All categories (${bank.length})</option>` +
    categories.map(cat => `<option value="${LQ.escapeAttr(cat)}">${LQ.escapeHtml(cat)} (${counts[cat]})</option>`).join('');

  const scenarios = bank.filter(q => /scenario/i.test(q.type)).length;
  const recalls = bank.filter(q => /recall/i.test(q.type)).length;
  els.categorySummary.innerHTML = [
    { value: questionSets.length || 1, label: 'Question Sets' },
    { value: bank.length, label: 'Questions in Set' },
    { value: categories.length, label: 'Categories' },
    { value: LQ.gameModes.length, label: 'Game Modes' },
    { value: `${recalls}/${scenarios}`, label: 'Recall / Scenario' }
  ].map(stat => `<div class="stat-card"><strong>${stat.value}</strong><span>${stat.label}</span></div>`).join('');

  els.createGame.disabled = !firebaseReady || !bank.length;
}

function renderModePreview() {
  if (!els.modePreview) return;
  const mode = LQ.getGameMode(els.gameModeSelect?.value || 'classic');
  els.modePreview.innerHTML = `
    <div class="mode-preview-icon">${mode.icon}</div>
    <div>
      <strong>${LQ.escapeHtml(mode.name)}</strong>
      <p>${LQ.escapeHtml(mode.description)}</p>
      <small>${LQ.escapeHtml(mode.objective)}</small>
    </div>
  `;
}

async function initFirebase() {
  if (!LQ.isFirebaseConfigured(firebaseConfig)) {
    throw new Error('Firebase config has placeholder values.');
  }
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  db = getDatabase(app);
  const credential = await signInAnonymously(auth);
  uid = credential.user.uid;
  firebaseReady = true;
  els.createGame.disabled = !bank.length;
  LQ.setStatus(els.setupStatus, 'Ready.', 'ok');
}

async function createGame() {
  LQ.Sounds.unlock();
  if (!firebaseReady) return;
  const settings = getSettings();
  selectedQuestions = selectQuestions(settings);
  if (!selectedQuestions.length) {
    LQ.setStatus(els.setupStatus, 'No questions available for that setup.', 'error');
    return;
  }

  els.createGame.disabled = true;
  LQ.setStatus(els.setupStatus, 'Creating game PIN…');

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const pin = LQ.makePin();
    const gameRef = ref(db, `${GAME_ROOT}/${pin}`);
    const existing = await get(gameRef);
    if (existing.exists()) continue;

    await set(gameRef, {
      hostUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      settings,
      state: {
        phase: 'lobby',
        pin,
        questionIndex: -1,
        questionCount: selectedQuestions.length,
        startedAt: 0,
        endsAt: 0
      },
      players: {}
    });

    gamePin = pin;
    playerUrl = LQ.buildPlayerUrl(pin);
    startGameListener();
    renderLobbyStatic();
    LQ.showScreen('lobby');
    return;
  }

  els.createGame.disabled = false;
  LQ.setStatus(els.setupStatus, 'Could not create a unique PIN. Try again.', 'error');
}

function getSettings() {
  const questionSetId = els.questionSetSelect?.value || selectedSet?.id || 'docjt';
  const sourceSet = questionSets.find(set => set.id === questionSetId) || selectedSet || questionSets[0] || { id: 'docjt', label: 'DOCJT Questions' };
  const mode = LQ.getGameMode(els.gameModeSelect?.value || 'classic');
  return {
    questionSetId: sourceSet.id,
    questionSetLabel: sourceSet.label,
    gameMode: mode.id,
    gameModeName: mode.name,
    gameModeIcon: mode.icon,
    category: els.categorySelect.value,
    requestedCount: els.questionCount.value,
    timerSeconds: Number(els.timerSelect.value),
    shuffleAnswers: els.shuffleToggle.checked
  };
}

function selectQuestions(settings) {
  selectedSet = questionSets.find(set => set.id === settings.questionSetId) || selectedSet || questionSets[0] || null;
  bank = selectedSet?.bank || [];
  let pool = settings.category === 'all' ? [...bank] : bank.filter(q => q.category === settings.category);
  pool = LQ.shuffle(pool);
  const count = settings.requestedCount === 'all' ? pool.length : Math.min(Number(settings.requestedCount), pool.length);
  return pool.slice(0, count);
}

function renderLobbyStatic() {
  const settings = liveGame?.settings || getSettings();
  const mode = LQ.getGameMode(settings.gameMode || 'classic');
  els.pinDisplay.textContent = gamePin;
  if (els.lobbyModePill) els.lobbyModePill.textContent = `${mode.icon} ${mode.name}`;
  els.joinUrl.textContent = playerUrl;
  els.joinQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(playerUrl)}`;
}

function startGameListener() {
  if (unsubscribeGame) unsubscribeGame();
  const gameRef = ref(db, `${GAME_ROOT}/${gamePin}`);
  const cb = snapshot => {
    liveGame = snapshot.val();
    if (!liveGame) {
      clearAutoReveal();
      cleanupTimer();
      LQ.Sounds.stopMusic();
      LQ.showScreen('setup');
      return;
    }
    renderFromGame(liveGame);
  };
  onValue(gameRef, cb);
  unsubscribeGame = () => off(gameRef, 'value', cb);
}

function renderFromGame(game) {
  const phase = game.state?.phase || 'lobby';
  if (phase !== lastPhase) {
    lastPhase = phase;
    if (phase === 'lobby') LQ.Sounds.playMusic('lobby');
    if (phase === 'question') {
      LQ.Sounds.resetCountdown();
      LQ.Sounds.playMusic('question');
    }
    if (phase === 'reveal') LQ.Sounds.stopMusic();
    if (phase === 'ended') LQ.Sounds.stopMusic();
  }
  if (phase === 'lobby') renderLobbyPlayers(game);
  if (phase === 'question') renderQuestionProgress(game);
  if (phase === 'reveal') renderReveal(game);
  if (phase === 'ended') renderEnded(game);
}

function renderLobbyPlayers(game) {
  const players = LQ.rankPlayers(game.players || {});
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  if (els.lobbyModePill) els.lobbyModePill.textContent = `${mode.icon} ${mode.name}`;
  els.playerCountPill.textContent = `${players.length} joined`;
  if (!players.length) {
    els.lobbyPlayers.className = 'player-grid empty';
    els.lobbyPlayers.textContent = 'Waiting for players…';
    return;
  }
  els.lobbyPlayers.className = 'player-grid';
  els.lobbyPlayers.innerHTML = players.map(p => {
    const avatar = LQ.getAvatar(p.avatarId);
    return `
      <div class="player-chip-card ${p.online === false ? 'offline' : ''}">
        <span class="chip-avatar">${LQ.avatarMarkup(p, 'avatar-img')}</span>
        <span>${LQ.escapeHtml(p.name || 'Player')}</span>
        <small>${p.online === false ? 'offline' : 'ready'} · ${LQ.escapeHtml(p.avatarName || avatar.name)}</small>
      </div>
    `;
  }).join('');
}

async function startGame() {
  LQ.Sounds.unlock();
  if (!gamePin || !selectedQuestions.length) return;
  await nextQuestion();
}

async function nextQuestion() {
  LQ.Sounds.unlock();
  clearAutoReveal();
  if (!gamePin || questionStartInProgress) return;
  questionStartInProgress = true;
  revealInProgress = false;
  LQ.Sounds.resetCountdown();

  try {
    // Read a fresh game snapshot before locking the roster for the next question.
    // This prevents early reveal caused by the host using a stale local snapshot that
    // did not yet include every player who had joined the lobby.
    const latestSnap = await get(ref(db, `${GAME_ROOT}/${gamePin}`));
    if (latestSnap.exists()) liveGame = latestSnap.val();

    const currentIndex = Number(liveGame?.state?.questionIndex ?? -1);
    const nextIndex = currentIndex + 1;
    if (nextIndex >= selectedQuestions.length) {
      questionStartInProgress = false;
      await endGame();
      return;
    }

    const q = selectedQuestions[nextIndex];
    let choices = q.choices.map((choice, originalIndex) => ({ choice, originalIndex }));
    if (liveGame?.settings?.shuffleAnswers ?? true) choices = LQ.shuffle(choices);
    const correctIndex = choices.findIndex(item => item.originalIndex === q.answer);
    const now = Date.now();
    const timerSeconds = Number(liveGame?.settings?.timerSeconds || 30);
    const playersAtStart = liveGame?.players || {};
    const eligiblePlayerUids = Object.keys(playersAtStart).filter(playerUid => playersAtStart[playerUid] && playersAtStart[playerUid].name);
    const eligiblePlayers = Object.fromEntries(eligiblePlayerUids.map(playerUid => [playerUid, true]));
    const eligiblePlayerNames = Object.fromEntries(eligiblePlayerUids.map(playerUid => [playerUid, String(playersAtStart[playerUid]?.name || 'Player')]));
    const mode = LQ.getGameMode(liveGame?.settings?.gameMode || 'classic');
    activeQuestion = {
      localIndex: nextIndex,
      question: q,
      choices,
      correctIndex,
      startedAt: now,
      endsAt: now + timerSeconds * 1000
    };

    const gameUpdate = {
      updatedAt: serverTimestamp(),
      [`answers/${nextIndex}`]: null,
      reveal: null,
      question: {
        key: `${nextIndex}_${q.id}_${now}`,
        category: q.category,
        type: q.type,
        text: q.question,
        choices: choices.map(item => item.choice),
        eligiblePlayers,
        eligiblePlayerNames,
        eligibleCount: eligiblePlayerUids.length
      },
      state: {
        phase: 'question',
        pin: gamePin,
        questionIndex: nextIndex,
        questionCount: selectedQuestions.length,
        startedAt: now,
        endsAt: now + timerSeconds * 1000
      }
    };

    // Fresh round reset. Non-classic modes use their own score/objective values so
    // Classic is the only mode that behaves like a pure Kahoot points game.
    if (nextIndex === 0) {
      eligiblePlayerUids.forEach(playerUid => {
        gameUpdate[`players/${playerUid}/score`] = 0;
        gameUpdate[`players/${playerUid}/coins`] = 0;
        gameUpdate[`players/${playerUid}/distance`] = 0;
        gameUpdate[`players/${playerUid}/power`] = 0;
        gameUpdate[`players/${playerUid}/damage`] = 0;
        gameUpdate[`players/${playerUid}/shield`] = 0;
        gameUpdate[`players/${playerUid}/health`] = BATTLE_START_HEALTH;
        gameUpdate[`players/${playerUid}/correct`] = 0;
        gameUpdate[`players/${playerUid}/answered`] = 0;
        gameUpdate[`players/${playerUid}/played`] = 0;
        gameUpdate[`players/${playerUid}/streak`] = 0;
        gameUpdate[`players/${playerUid}/lastGain`] = 0;
        gameUpdate[`players/${playerUid}/lastCoins`] = 0;
        gameUpdate[`players/${playerUid}/lastDistance`] = 0;
        gameUpdate[`players/${playerUid}/lastPower`] = 0;
        gameUpdate[`players/${playerUid}/lastDamage`] = 0;
        gameUpdate[`players/${playerUid}/lastHealthChange`] = 0;
        gameUpdate[`players/${playerUid}/lastShield`] = 0;
        gameUpdate[`players/${playerUid}/lastModeLabel`] = mode.id === 'classic' ? 'Ready for Classic points.' : `Ready for ${mode.name}.`;
        gameUpdate[`players/${playerUid}/lastCorrect`] = false;
        gameUpdate[`players/${playerUid}/lastChoiceIndex`] = -1;
      });
    }

    await update(ref(db, `${GAME_ROOT}/${gamePin}`), gameUpdate);

    LQ.Sounds.playMusic('question');
    LQ.showScreen('question');
    startTimer(activeQuestion.endsAt, () => revealQuestion(false));
  } finally {
    questionStartInProgress = false;
  }
}

function renderQuestionProgress(game) {
  const q = game.question || {};
  const state = game.state || {};
  const index = Number(state.questionIndex || 0);
  const total = Number(state.questionCount || selectedQuestions.length || 0);
  const answersForQuestion = game.answers?.[index] || {};
  const eligibleMap = q.eligiblePlayers || null;
  const eligibleUids = eligibleMap ? Object.keys(eligibleMap) : [];
  const questionKey = q.key || '';
  let playerCount = Number(q.eligibleCount || eligibleUids.length || 0);
  let answeredEligibleUids = eligibleUids.length
    ? eligibleUids.filter(playerUid => hasValidAnswer(answersForQuestion[playerUid], questionKey))
    : Object.keys(answersForQuestion).filter(playerUid => hasValidAnswer(answersForQuestion[playerUid], questionKey));
  let answerCount = answeredEligibleUids.length;

  if (!playerCount && !eligibleUids.length) {
    playerCount = Object.keys(game.players || {}).filter(playerUid => game.players[playerUid]?.name).length;
  }

  els.roundLabel.textContent = `Question ${index + 1} / ${total}`;
  els.categoryLabel.textContent = `${game.settings?.questionSetLabel || ''}${game.settings?.questionSetLabel ? ' · ' : ''}${q.category || 'Category'}`;
  els.questionType.textContent = q.type || 'Question';
  els.questionText.textContent = q.text || '';
  els.answerCount.textContent = `${answerCount} / ${playerCount} answered`;
  els.answersGrid.innerHTML = (q.choices || []).map((choice, i) => `
    <div class="answer-btn ${LQ.answerStyles[i % LQ.answerStyles.length]}">
      <span class="shape">${LQ.answerShapes[i % LQ.answerShapes.length]}</span>
      <span>${LQ.escapeHtml(choice)}</span>
    </div>
  `).join('');

  renderModeStatus(game);
  LQ.showScreen('question');
  startTimer(Number(state.endsAt || Date.now()), () => revealQuestion(false));

  // Only auto-reveal when the exact players locked in at question start have all answered
  // this exact question. We do not shrink the roster when phones briefly disconnect, and we
  // read a fresh Firebase snapshot before starting each question so newly joined lobby players
  // are included before the lock is created.
  const allLockedPlayersAnswered = playerCount > 0 && eligibleUids.length > 0 && eligibleUids.every(playerUid => hasValidAnswer(answersForQuestion[playerUid], questionKey));
  const questionHasDisplayedBriefly = Date.now() - Number(state.startedAt || Date.now()) >= 1200;
  if (allLockedPlayersAnswered && questionHasDisplayedBriefly && !revealInProgress && !autoRevealTimer) {
    cleanupTimer();
    autoRevealTimer = setTimeout(() => {
      autoRevealTimer = null;
      revealQuestion(false);
    }, 900);
  }
}

function hasValidAnswer(answer, questionKey) {
  if (!answer || typeof answer !== 'object') return false;
  if (questionKey && answer.questionKey && answer.questionKey !== questionKey) return false;
  return Number.isInteger(Number(answer.choiceIndex));
}


function startTimer(endsAt, onDone) {
  cleanupTimer();
  const totalMs = Math.max(1000, Number(liveGame?.settings?.timerSeconds || 30) * 1000);
  const tick = () => {
    const remainingMs = Math.max(0, endsAt - Date.now());
    const seconds = Math.ceil(remainingMs / 1000);
    els.timerText.textContent = seconds;
    els.timerBar.style.width = `${LQ.clamp((remainingMs / totalMs) * 100, 0, 100)}%`;
    LQ.Sounds.countdownTick(seconds);
    if (remainingMs <= 0) {
      cleanupTimer();
      onDone();
    }
  };
  tick();
  timerId = setInterval(tick, 200);
}

function cleanupTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}

function clearAutoReveal() {
  if (autoRevealTimer) clearTimeout(autoRevealTimer);
  autoRevealTimer = null;
}

async function revealQuestion(manual) {
  clearAutoReveal();
  if (!gamePin || revealInProgress) return;
  const game = liveGame;
  const index = Number(game?.state?.questionIndex ?? -1);
  if (!game || game.state?.phase !== 'question' || index < 0) return;
  revealInProgress = true;
  cleanupTimer();
  LQ.Sounds.stopMusic();

  const local = activeQuestion?.localIndex === index ? activeQuestion : rebuildActiveQuestion(index, game);
  if (!local) {
    revealInProgress = false;
    return;
  }

  const answers = game.answers?.[index] || {};
  const players = game.players || {};
  const choices = game.question?.choices || local.choices.map(c => c.choice);
  const counts = choices.map((_, i) => Object.values(answers).filter(a => Number(a.choiceIndex) === i).length);
  const totalMs = Math.max(1000, Number(game.settings?.timerSeconds || 30) * 1000);
  const eligibleMap = game.question?.eligiblePlayers || null;
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  const roundResults = {};

  Object.entries(players).forEach(([playerUid, player]) => {
    if (eligibleMap && !eligibleMap[playerUid]) return;
    const answer = answers[playerUid];
    const answered = Boolean(answer);
    const correct = answered && Number(answer.choiceIndex) === local.correctIndex;
    const elapsed = answered ? Math.max(0, Number(answer.answeredAt || Date.now()) - Number(game.state?.startedAt || Date.now())) : totalMs;
    const speedRatio = correct ? 1 - LQ.clamp(elapsed / totalMs, 0, 1) : 0;
    const speedBase = correct ? Math.round(500 + 500 * speedRatio) : 0;
    const nextStreak = correct ? Number(player.streak || 0) + 1 : 0;
    const streakBonus = correct ? Math.min(nextStreak * 100, 500) : 0;
    roundResults[playerUid] = {
      uid: playerUid,
      player,
      answered,
      correct,
      choiceIndex: answered ? Number(answer.choiceIndex) : -1,
      elapsed,
      speedRatio,
      speedBase,
      streakBonus,
      nextStreak,
      questionIndex: index
    };
  });

  const modeOutcome = calculateModeOutcomes(mode.id, roundResults, players, index);
  const updates = {
    updatedAt: serverTimestamp(),
    'state/phase': 'reveal',
    reveal: {
      correctIndex: local.correctIndex,
      correctAnswer: choices[local.correctIndex] || '',
      explanation: local.question.explanation,
      counts,
      manual: Boolean(manual),
      revealedAt: Date.now(),
      mode: {
        id: mode.id,
        name: mode.name,
        icon: mode.icon,
        events: modeOutcome.events.slice(0, 12)
      }
    }
  };

  Object.entries(roundResults).forEach(([playerUid, result]) => {
    const player = result.player || {};
    const outcome = modeOutcome.players[playerUid] || createEmptyOutcome(mode.id, player);
    updates[`players/${playerUid}/score`] = outcome.score;
    updates[`players/${playerUid}/correct`] = Number(player.correct || 0) + (result.correct ? 1 : 0);
    updates[`players/${playerUid}/played`] = Number(player.played || 0) + 1;
    updates[`players/${playerUid}/answered`] = Number(player.answered || 0) + (result.answered ? 1 : 0);
    updates[`players/${playerUid}/streak`] = result.nextStreak;
    updates[`players/${playerUid}/lastGain`] = outcome.lastGain;
    updates[`players/${playerUid}/lastCorrect`] = result.correct;
    updates[`players/${playerUid}/lastChoiceIndex`] = result.choiceIndex;
    updates[`players/${playerUid}/coins`] = outcome.coins;
    updates[`players/${playerUid}/distance`] = outcome.distance;
    updates[`players/${playerUid}/power`] = outcome.power;
    updates[`players/${playerUid}/damage`] = outcome.damage;
    updates[`players/${playerUid}/shield`] = outcome.shield;
    updates[`players/${playerUid}/health`] = outcome.health;
    updates[`players/${playerUid}/lastCoins`] = outcome.lastCoins;
    updates[`players/${playerUid}/lastDistance`] = outcome.lastDistance;
    updates[`players/${playerUid}/lastPower`] = outcome.lastPower;
    updates[`players/${playerUid}/lastDamage`] = outcome.lastDamage;
    updates[`players/${playerUid}/lastHealthChange`] = outcome.lastHealthChange;
    updates[`players/${playerUid}/lastShield`] = outcome.lastShield;
    updates[`players/${playerUid}/lastModeLabel`] = outcome.label;
  });

  await update(ref(db, `${GAME_ROOT}/${gamePin}`), updates);
  LQ.showScreen('reveal');
}

function rebuildActiveQuestion(index, game) {
  const q = selectedQuestions[index];
  if (!q || !game.question?.choices) return null;
  const correctAnswerText = q.choices[q.answer];
  const correctIndex = game.question.choices.findIndex(choice => choice === correctAnswerText);
  return {
    localIndex: index,
    question: q,
    choices: game.question.choices.map((choice, i) => ({ choice, originalIndex: i })),
    correctIndex: correctIndex >= 0 ? correctIndex : 0
  };
}

function renderReveal(game) {
  const reveal = game.reveal || {};
  const q = game.question || {};
  els.revealTitle.textContent = `Question ${Number(game.state?.questionIndex || 0) + 1} Answer`;
  els.correctAnswerText.textContent = reveal.correctAnswer || 'Correct answer';
  els.explanationText.textContent = reveal.explanation || '';
  renderModeRevealBanner(game);
  els.answerBars.innerHTML = (q.choices || []).map((choice, i) => {
    const count = Number(reveal.counts?.[i] || 0);
    const max = Math.max(1, ...(reveal.counts || [0]));
    return `
      <div class="answer-bar-row ${i === Number(reveal.correctIndex) ? 'correct' : ''}">
        <span class="mini-shape ${LQ.answerStyles[i % LQ.answerStyles.length]}">${LQ.answerShapes[i % LQ.answerShapes.length]}</span>
        <span class="bar-label">${LQ.escapeHtml(choice)}</span>
        <span class="bar-track"><span style="width:${(count / max) * 100}%"></span></span>
        <strong>${count}</strong>
      </div>
    `;
  }).join('');
  const revealAudioKey = `${game.question?.key || ''}_${game.reveal?.revealedAt || ''}`;
  const animateReveal = revealAudioKey && revealAudioKey !== lastRevealAnimationKey;
  if (revealAudioKey && revealAudioKey !== lastRevealAudioKey) {
    lastRevealAudioKey = revealAudioKey;
    LQ.Sounds.reveal(true);
    LQ.Sounds.countUp();
  }
  renderLeaderboard(els.leaderboardList, game.players || {}, { animate: animateReveal });
  if (animateReveal) lastRevealAnimationKey = revealAudioKey;
  const currentIndex = Number(game.state?.questionIndex || 0);
  els.nextQuestion.textContent = currentIndex + 1 >= Number(game.state?.questionCount || selectedQuestions.length) ? 'Finish Game' : 'Next Question';
  LQ.showScreen('reveal');
}

function renderLeaderboard(container, playersObj, options = {}) {
  const modeId = liveGame?.settings?.gameMode || 'classic';
  const players = rankPlayersForMode(playersObj, modeId);
  if (!players.length) {
    container.innerHTML = '<p class="muted">No players joined.</p>';
    return;
  }
  const animate = Boolean(options.animate);
  container.innerHTML = players.map((p, i) => {
    const targetScore = Number(p.score || 0);
    const startScore = animate ? targetScore - Number(p.lastGain || 0) : targetScore;
    return `
      <div class="leader-row ${i === 0 ? 'first' : ''}">
        <div class="rank-wrap"><div class="rank">${i + 1}</div><div class="leader-avatar">${LQ.avatarMarkup(p, 'avatar-img')}</div></div>
        <div class="leader-name">
          <strong>${LQ.escapeHtml(p.name || 'Player')}</strong>
          <span>${formatLeaderboardDetail(p, modeId)}</span>
        </div>
        <div class="leader-score" data-from-score="${startScore}" data-to-score="${targetScore}">${formatLeaderboardScore(p, modeId, startScore)}</div>
      </div>
    `;
  }).join('');

  if (animate) {
    container.querySelectorAll('[data-to-score]').forEach(el => {
      LQ.animateNumber(el, Number(el.dataset.fromScore || 0), Number(el.dataset.toScore || 0), {
        suffix: scoreSuffix(modeId),
        duration: 1000,
        onTick: () => LQ.Sounds.pointsTick()
      });
    });
  }
}

function formatLeaderboardScore(p, modeId, value = Number(p.score || 0)) {
  if (modeId === 'coin-rush') return `${LQ.formatScore(value)} gold`;
  if (modeId === 'cadet-race') return `${LQ.formatScore(value)} ft`;
  if (modeId === 'power-battle') return `${LQ.formatScore(value)} battle`;
  return `${LQ.formatScore(value)} pts`;
}

function scoreSuffix(modeId) {
  if (modeId === 'coin-rush') return ' gold';
  if (modeId === 'cadet-race') return ' ft';
  if (modeId === 'power-battle') return ' battle';
  return ' pts';
}

function formatLeaderboardDetail(p, modeId) {
  const base = `${Number(p.correct || 0)} correct · streak ${Number(p.streak || 0)}`;
  if (modeId === 'coin-rush') {
    return `${base} · ${LQ.formatScore(p.coins || 0)} gold${Number(p.lastCoins || 0) ? ` · ${formatSigned(p.lastCoins)} gold` : ''}`;
  }
  if (modeId === 'cadet-race') {
    return `${base} · ${LQ.formatScore(p.distance || 0)} / ${RACE_FINISH_DISTANCE} ft${Number(p.lastDistance || 0) ? ` · ${formatSigned(p.lastDistance)} ft` : ''}`;
  }
  if (modeId === 'power-battle') {
    return `${base} · ${LQ.formatScore(p.health ?? BATTLE_START_HEALTH)} HP · ${LQ.formatScore(p.damage || 0)} dmg · ${LQ.formatScore(p.shield || 0)} shield`;
  }
  return `${base}${Number(p.lastGain || 0) ? ` · ${formatSigned(p.lastGain)} pts` : ''}`;
}

function renderModeStatus(game) {
  if (!els.modeStatusPanel) return;
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  const players = rankPlayersForMode(game.players || {}, mode.id).slice(0, 8);

  if (mode.id === 'coin-rush') {
    els.modeStatusPanel.innerHTML = `
      <div class="mode-objective"><strong>${mode.icon} Coin Rush</strong><span>Correct answers open chests: gold, triple gold, steal, raid, or trap.</span></div>
      <div class="coin-board">
        ${players.map((p, i) => `<div class="coin-card ${i === 0 ? 'first' : ''}">${LQ.avatarMarkup(p, 'avatar-img')}<strong>${LQ.escapeHtml(p.name || 'Player')}</strong><span>🪙 ${LQ.formatScore(p.coins || 0)} gold</span></div>`).join('') || '<span class="muted">No players yet.</span>'}
      </div>
    `;
    return;
  }

  if (mode.id === 'cadet-race') {
    els.modeStatusPanel.innerHTML = `
      <div class="mode-objective"><strong>${mode.icon} Cadet Race</strong><span>Finish line: ${RACE_FINISH_DISTANCE} ft. Correct answers roll movement and track events.</span></div>
      <div class="race-board">
        ${players.map(p => {
          const distance = LQ.clamp(Number(p.distance || 0), 0, RACE_FINISH_DISTANCE);
          const percent = (distance / RACE_FINISH_DISTANCE) * 100;
          return `<div class="race-lane"><span>${LQ.avatarMarkup(p, 'avatar-img tiny-avatar-img')}</span><strong>${LQ.escapeHtml(p.name || 'Player')}</strong><div class="race-track"><span style="width:${percent}%"></span><em style="left:${percent}%">🏃</em></div><small>${LQ.formatScore(distance)} ft</small></div>`;
        }).join('') || '<span class="muted">No racers yet.</span>'}
      </div>
    `;
    return;
  }

  if (mode.id === 'power-battle') {
    els.modeStatusPanel.innerHTML = `
      <div class="mode-objective"><strong>${mode.icon} Power Battle</strong><span>Correct answers attack, shield, or surge. Wrong answers can cost health.</span></div>
      <div class="battle-board">
        ${players.map(p => {
          const health = LQ.clamp(Number(p.health ?? BATTLE_START_HEALTH), 0, BATTLE_START_HEALTH);
          const shield = LQ.clamp(Number(p.shield || 0), 0, 60);
          return `<div class="battle-row"><span>${LQ.avatarMarkup(p, 'avatar-img tiny-avatar-img')}</span><strong>${LQ.escapeHtml(p.name || 'Player')}</strong><div class="battle-bars"><i style="width:${health}%"></i><b style="width:${shield}%"></b></div><small>${LQ.formatScore(health)} HP · ${LQ.formatScore(p.damage || 0)} dmg</small></div>`;
        }).join('') || '<span class="muted">No battlers yet.</span>'}
      </div>
    `;
    return;
  }

  const cards = players.slice(0, 4).map((p, i) => `<div class="mode-mini-card">
      <span class="mode-mini-avatar">${LQ.avatarMarkup(p, 'avatar-img')}</span>
      <strong>${LQ.escapeHtml(p.name || 'Player')}</strong>
      <small>#${i + 1} · ${formatModeStat(p, mode.id)}</small>
    </div>`).join('');
  els.modeStatusPanel.innerHTML = `
    <div class="mode-objective"><strong>${mode.icon} ${LQ.escapeHtml(mode.shortName || mode.name)}</strong><span>${LQ.escapeHtml(mode.objective)}</span></div>
    <div class="mode-mini-grid">${cards || '<span class="muted">No players yet.</span>'}</div>
  `;
}

function formatModeStat(player, modeId) {
  if (modeId === 'coin-rush') return `${LQ.formatScore(player.coins || 0)} gold`;
  if (modeId === 'cadet-race') return `${LQ.formatScore(player.distance || 0)} ft`;
  if (modeId === 'power-battle') return `${LQ.formatScore(player.health ?? BATTLE_START_HEALTH)} HP · ${LQ.formatScore(player.damage || 0)} dmg`;
  return `${LQ.formatScore(player.score || 0)} pts`;
}

function renderModeRevealBanner(game) {
  if (!els.modeRevealBanner) return;
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  const events = game.reveal?.mode?.events || [];
  if (!events.length || mode.id === 'classic') {
    els.modeRevealBanner.innerHTML = `<strong>${mode.icon} ${LQ.escapeHtml(mode.name)}</strong><span>${LQ.escapeHtml(mode.scoring)}</span>`;
    return;
  }
  els.modeRevealBanner.innerHTML = `
    <strong>${mode.icon} ${LQ.escapeHtml(mode.name)} round events</strong>
    <div class="mode-event-list">
      ${events.map(event => `<span class="mode-event-chip ${LQ.escapeAttr(event.type || '')}">${LQ.avatarMarkup(event, 'avatar-img tiny-avatar-img')} <b>${LQ.escapeHtml(event.name)}</b>: ${LQ.escapeHtml(event.label)}</span>`).join('')}
    </div>
  `;
}

function renderFinalModeSummary(game) {
  if (!els.finalModeSummary) return;
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  const ranked = rankPlayersForMode(game.players || {}, mode.id);
  const top = ranked[0];
  if (!top) {
    els.finalModeSummary.innerHTML = `<strong>${mode.icon} ${LQ.escapeHtml(mode.name)}</strong><span>No player results.</span>`;
    return;
  }
  const winLine = mode.id === 'classic'
    ? `${LQ.formatScore(top.score || 0)} points`
    : formatModeStat(top, mode.id);
  els.finalModeSummary.innerHTML = `<strong>${mode.icon} ${LQ.escapeHtml(mode.name)}</strong><span>Winner: ${LQ.escapeHtml(top.name || 'Player')} with ${winLine}.</span>`;
}

function calculateModeOutcomes(modeId, roundResults, players, questionIndex) {
  if (modeId === 'coin-rush') return calculateCoinRushOutcomes(roundResults, players, questionIndex);
  if (modeId === 'cadet-race') return calculateRaceOutcomes(roundResults, players, questionIndex);
  if (modeId === 'power-battle') return calculateBattleOutcomes(roundResults, players, questionIndex);
  return calculateClassicOutcomes(roundResults, players);
}

function createEmptyOutcome(modeId, player) {
  const health = Number(player.health ?? BATTLE_START_HEALTH);
  return {
    score: Number(player.score || 0),
    coins: Number(player.coins || 0),
    distance: Number(player.distance || 0),
    power: Number(player.power || 0),
    damage: Number(player.damage || 0),
    shield: Number(player.shield || 0),
    health,
    lastGain: 0,
    lastCoins: 0,
    lastDistance: 0,
    lastPower: 0,
    lastDamage: 0,
    lastHealthChange: 0,
    lastShield: 0,
    label: modeId === 'classic' ? 'No points this round.' : 'No mode reward this round.',
    value: 0
  };
}

function baseOutcomes(roundResults, players, modeId) {
  const outcomes = {};
  Object.keys(roundResults).forEach(uid => {
    outcomes[uid] = createEmptyOutcome(modeId, players[uid] || {});
  });
  return outcomes;
}

function calculateClassicOutcomes(roundResults, players) {
  const outcomes = baseOutcomes(roundResults, players, 'classic');
  const events = [];
  Object.entries(roundResults).forEach(([uid, result]) => {
    const points = result.correct ? result.speedBase + result.streakBonus : 0;
    outcomes[uid].score = Number(result.player.score || 0) + points;
    outcomes[uid].lastGain = points;
    outcomes[uid].value = points;
    outcomes[uid].label = result.correct ? `+${LQ.formatScore(points)} speed/streak points` : 'No points this round.';
  });
  return { players: outcomes, events };
}

function calculateCoinRushOutcomes(roundResults, players, questionIndex) {
  const outcomes = baseOutcomes(roundResults, players, 'coin-rush');
  const events = [];
  const liveCoins = {};
  Object.keys(outcomes).forEach(uid => { liveCoins[uid] = Number(players[uid]?.coins || 0); });
  const correctUids = Object.keys(roundResults).filter(uid => roundResults[uid].correct);

  correctUids.forEach(uid => {
    const result = roundResults[uid];
    const player = result.player || {};
    const roll = seededNumber(`${uid}-${questionIndex}-coin-event`);
    const baseGold = Math.round(45 + result.speedRatio * 35 + Math.min(result.nextStreak * 8, 56));
    let delta = 0;
    let label = '';
    let type = 'coin';
    let coinAlreadyApplied = false;

    if (roll < 0.38) {
      delta = baseGold;
      label = `Opened a chest: +${delta} gold`;
      type = 'chest';
    } else if (roll < 0.58) {
      delta = baseGold * 3;
      label = `TRIPLE GOLD chest: +${delta} gold`;
      type = 'triple';
    } else if (roll < 0.73) {
      delta = -Math.min(liveCoins[uid], Math.max(25, Math.round(liveCoins[uid] * 0.25)));
      label = delta < 0 ? `Trap chest took ${Math.abs(delta)} gold` : 'Trap chest was empty — no gold lost';
      type = 'trap';
    } else if (roll < 0.90) {
      const targetUid = pickTarget(uid, Object.keys(roundResults), players, `${uid}-${questionIndex}-steal`);
      if (targetUid && liveCoins[targetUid] > 0) {
        const stolen = Math.min(liveCoins[targetUid], Math.max(20, Math.round(liveCoins[targetUid] * 0.30)));
        liveCoins[targetUid] -= stolen;
        liveCoins[uid] += stolen;
        coinAlreadyApplied = true;
        outcomes[targetUid].lastCoins -= stolen;
        outcomes[targetUid].lastGain -= stolen;
        outcomes[targetUid].label = `${player.name || 'A player'} stole ${stolen} gold from you`;
        delta = stolen;
        label = `Steal chest: took ${stolen} gold from ${players[targetUid]?.name || 'another player'}`;
        type = 'steal';
        events.push(eventFor(targetUid, players[targetUid] || {}, outcomes[targetUid].label, -stolen, 'stolen'));
      } else {
        delta = baseGold;
        label = `Steal chest found no target, banked +${delta} gold`;
        type = 'chest';
      }
    } else {
      const victims = Object.keys(roundResults).filter(otherUid => otherUid !== uid && liveCoins[otherUid] > 0);
      let totalRaid = 0;
      victims.forEach(victimUid => {
        const taken = Math.min(liveCoins[victimUid], Math.max(8, Math.round(liveCoins[victimUid] * 0.12)));
        liveCoins[victimUid] -= taken;
        totalRaid += taken;
        outcomes[victimUid].lastCoins -= taken;
        outcomes[victimUid].lastGain -= taken;
        outcomes[victimUid].label = `${player.name || 'A player'} raided ${taken} gold from your vault`;
        events.push(eventFor(victimUid, players[victimUid] || {}, outcomes[victimUid].label, -taken, 'raid-loss'));
      });
      delta = totalRaid || baseGold;
      label = totalRaid ? `Vault raid: collected ${totalRaid} gold from the room` : `Vault raid bonus: +${delta} gold`;
      type = 'raid';
    }

    if (!coinAlreadyApplied) {
      liveCoins[uid] += delta;
    }
    outcomes[uid].lastCoins += delta;
    outcomes[uid].lastGain += delta;
    outcomes[uid].label = label;
    outcomes[uid].value = delta;
    events.push(eventFor(uid, player, label, delta, type));
  });

  Object.keys(outcomes).forEach(uid => {
    const coins = Math.max(0, Math.round(liveCoins[uid]));
    outcomes[uid].coins = coins;
    outcomes[uid].score = coins;
    outcomes[uid].lastCoins = Math.round(outcomes[uid].lastCoins || 0);
    outcomes[uid].lastGain = Math.round(outcomes[uid].lastGain || 0);
    if (!roundResults[uid].correct && !outcomes[uid].label.includes('stole') && !outcomes[uid].label.includes('raided')) {
      outcomes[uid].label = 'No chest — answer correctly to open one.';
    }
  });
  return { players: outcomes, events };
}

function calculateRaceOutcomes(roundResults, players, questionIndex) {
  const outcomes = baseOutcomes(roundResults, players, 'cadet-race');
  const events = [];
  Object.entries(roundResults).forEach(([uid, result]) => {
    const player = result.player || {};
    const current = Number(player.distance || 0);
    let move = 0;
    let label = '';
    let type = 'race';
    if (result.correct) {
      const roll = seededNumber(`${uid}-${questionIndex}-race-event`);
      const baseMove = Math.round(14 + result.speedRatio * 14 + Math.min(result.nextStreak * 3, 18));
      if (roll < 0.42) {
        move = baseMove;
        label = `Patrol roll: +${move} ft`;
        type = 'roll';
      } else if (roll < 0.62) {
        move = baseMove + 18;
        label = `Shortcut found: +${move} ft`;
        type = 'shortcut';
      } else if (roll < 0.78) {
        move = Math.max(7, Math.round(baseMove * 0.55));
        label = `Roadblock slowed the patrol: +${move} ft`;
        type = 'roadblock';
      } else if (roll < 0.92) {
        move = baseMove + 10 + (result.nextStreak >= 3 ? 10 : 0);
        label = `Siren boost: +${move} ft`;
        type = 'boost';
      } else {
        const leadBonus = current < raceLeaderDistance(players, outcomes) ? 16 : 8;
        move = baseMove + leadBonus;
        label = `Drafted off the lead car: +${move} ft`;
        type = 'draft';
      }
    } else if (result.answered) {
      move = -Math.min(8, current);
      label = move < 0 ? `Wrong turn: ${move} ft` : 'Wrong turn at the start line.';
      type = 'wrong-turn';
    } else {
      label = 'No move this round.';
      type = 'no-move';
    }
    const distance = LQ.clamp(current + move, 0, RACE_FINISH_DISTANCE);
    outcomes[uid].distance = distance;
    outcomes[uid].score = distance;
    outcomes[uid].lastDistance = distance - current;
    outcomes[uid].lastGain = distance - current;
    outcomes[uid].value = distance - current;
    outcomes[uid].label = distance >= RACE_FINISH_DISTANCE && current < RACE_FINISH_DISTANCE ? `${label} FINISH LINE!` : label;
    if (label) events.push(eventFor(uid, player, outcomes[uid].label, outcomes[uid].lastDistance, type));
  });
  return { players: outcomes, events };
}

function calculateBattleOutcomes(roundResults, players, questionIndex) {
  const outcomes = baseOutcomes(roundResults, players, 'power-battle');
  const events = [];
  Object.keys(outcomes).forEach(uid => {
    outcomes[uid].health = LQ.clamp(Number(players[uid]?.health ?? BATTLE_START_HEALTH), 0, BATTLE_START_HEALTH);
    outcomes[uid].shield = LQ.clamp(Number(players[uid]?.shield || 0), 0, 60);
    outcomes[uid].damage = Number(players[uid]?.damage || 0);
    outcomes[uid].power = Number(players[uid]?.power || 0);
  });

  Object.entries(roundResults).forEach(([uid, result]) => {
    const player = result.player || {};
    if (!result.correct) {
      if (result.answered) {
        const penalty = Math.min(8, outcomes[uid].health);
        outcomes[uid].health -= penalty;
        outcomes[uid].lastHealthChange -= penalty;
        outcomes[uid].label = penalty ? `Missed shot: -${penalty} HP` : 'Already knocked down — no HP lost.';
        events.push(eventFor(uid, player, outcomes[uid].label, -penalty, 'battle-miss'));
      } else {
        outcomes[uid].label = 'No battle action this round.';
      }
      return;
    }

    const roll = seededNumber(`${uid}-${questionIndex}-battle-event`);
    const attack = Math.round(16 + result.speedRatio * 18 + Math.min(result.nextStreak * 4, 24));
    let label = '';
    let type = 'attack';

    if (roll < 0.52) {
      const targetUid = pickBattleTarget(uid, outcomes, players, `${uid}-${questionIndex}-attack`);
      const dealt = applyDamage(outcomes, targetUid, attack);
      outcomes[uid].damage += dealt;
      outcomes[uid].power += Math.round(attack * 0.25);
      outcomes[uid].lastDamage += dealt;
      outcomes[uid].lastPower += Math.round(attack * 0.25);
      label = targetUid ? `Attack hit ${players[targetUid]?.name || 'opponent'} for ${dealt} damage` : `Training strike scored ${attack} power`;
      type = 'attack';
      if (targetUid) {
        outcomes[targetUid].label = `${player.name || 'Opponent'} hit you for ${dealt} damage`;
        events.push(eventFor(targetUid, players[targetUid] || {}, outcomes[targetUid].label, -dealt, 'hit'));
      }
    } else if (roll < 0.70) {
      const shieldGain = Math.round(attack * 0.75);
      const before = outcomes[uid].shield;
      outcomes[uid].shield = LQ.clamp(outcomes[uid].shield + shieldGain, 0, 60);
      outcomes[uid].lastShield += outcomes[uid].shield - before;
      outcomes[uid].power += Math.round(attack * 0.3);
      outcomes[uid].lastPower += Math.round(attack * 0.3);
      label = `Raised a shield: +${outcomes[uid].lastShield} shield`;
      type = 'shield';
    } else if (roll < 0.86) {
      const targets = pickMultipleTargets(uid, outcomes, players, `${uid}-${questionIndex}-double`, 2);
      let totalDealt = 0;
      targets.forEach(targetUid => {
        const dealt = applyDamage(outcomes, targetUid, Math.round(attack * 0.70));
        totalDealt += dealt;
        outcomes[targetUid].label = `${player.name || 'Opponent'} double-struck you for ${dealt} damage`;
        events.push(eventFor(targetUid, players[targetUid] || {}, outcomes[targetUid].label, -dealt, 'hit'));
      });
      outcomes[uid].damage += totalDealt;
      outcomes[uid].lastDamage += totalDealt;
      outcomes[uid].power += Math.round(attack * 0.25);
      outcomes[uid].lastPower += Math.round(attack * 0.25);
      label = targets.length ? `Double strike dealt ${totalDealt} total damage` : `Double strike charged ${attack} power`;
      type = 'double';
    } else if (roll < 0.96) {
      const surge = attack + 12;
      outcomes[uid].power += surge;
      outcomes[uid].lastPower += surge;
      label = `Power surge: +${surge} power`;
      type = 'surge';
    } else {
      const targetUid = pickBattleTarget(uid, outcomes, players, `${uid}-${questionIndex}-critical`);
      const dealt = applyDamage(outcomes, targetUid, attack + 18);
      outcomes[uid].damage += dealt;
      outcomes[uid].lastDamage += dealt;
      outcomes[uid].power += 10;
      outcomes[uid].lastPower += 10;
      label = targetUid ? `Critical raid hit ${players[targetUid]?.name || 'opponent'} for ${dealt} damage` : `Critical raid charged ${attack + 18} power`;
      type = 'critical';
      if (targetUid) {
        outcomes[targetUid].label = `${player.name || 'Opponent'} landed a critical raid for ${dealt} damage`;
        events.push(eventFor(targetUid, players[targetUid] || {}, outcomes[targetUid].label, -dealt, 'hit'));
      }
    }

    outcomes[uid].label = label;
    events.push(eventFor(uid, player, label, outcomes[uid].lastDamage || outcomes[uid].lastPower || outcomes[uid].lastShield, type));
  });

  Object.entries(outcomes).forEach(([uid, outcome]) => {
    const oldScore = Number(players[uid]?.score || 0);
    outcome.health = LQ.clamp(Math.round(outcome.health), 0, BATTLE_START_HEALTH);
    outcome.shield = LQ.clamp(Math.round(outcome.shield), 0, 60);
    outcome.damage = Math.round(outcome.damage);
    outcome.power = Math.round(outcome.power);
    outcome.score = Math.round(outcome.health + outcome.damage + outcome.power + outcome.shield * 0.5);
    outcome.lastGain = outcome.score - oldScore;
  });
  return { players: outcomes, events };
}

function eventFor(uid, player, label, value, type = '') {
  return {
    uid,
    name: player.name || 'Player',
    avatarId: player.avatarId || LQ.avatarOptions[0].id,
    avatarIcon: player.avatarIcon || '',
    label,
    value: Number(value || 0),
    type
  };
}

function pickTarget(uid, candidateUids, players, seed) {
  const options = candidateUids.filter(otherUid => otherUid !== uid && players[otherUid]);
  if (!options.length) return '';
  const index = Math.floor(seededNumber(seed) * options.length) % options.length;
  return options[index];
}

function raceLeaderDistance(players, outcomes) {
  return Math.max(0, ...Object.keys(outcomes).map(uid => Number(outcomes[uid]?.distance ?? players[uid]?.distance ?? 0)));
}

function pickBattleTarget(uid, outcomes, players, seed) {
  const options = Object.keys(outcomes).filter(otherUid => otherUid !== uid && Number(outcomes[otherUid].health || 0) > 0);
  if (!options.length) return '';
  const sorted = options.sort((a, b) => (Number(outcomes[b].health || 0) - Number(outcomes[a].health || 0)) || String(players[a]?.name || '').localeCompare(String(players[b]?.name || '')));
  const index = Math.floor(seededNumber(seed) * sorted.length) % sorted.length;
  return sorted[index];
}

function pickMultipleTargets(uid, outcomes, players, seed, count) {
  const selected = [];
  let options = Object.keys(outcomes).filter(otherUid => otherUid !== uid && Number(outcomes[otherUid].health || 0) > 0);
  while (options.length && selected.length < count) {
    const index = Math.floor(seededNumber(`${seed}-${selected.length}`) * options.length) % options.length;
    selected.push(options[index]);
    options = options.filter(targetUid => targetUid !== selected[selected.length - 1]);
  }
  return selected;
}

function applyDamage(outcomes, targetUid, amount) {
  if (!targetUid || !outcomes[targetUid]) return 0;
  let remaining = Math.max(0, Math.round(amount));
  const shieldBlock = Math.min(Number(outcomes[targetUid].shield || 0), remaining);
  outcomes[targetUid].shield -= shieldBlock;
  outcomes[targetUid].lastShield -= shieldBlock;
  remaining -= shieldBlock;
  const healthDamage = Math.min(Number(outcomes[targetUid].health || 0), remaining);
  outcomes[targetUid].health -= healthDamage;
  outcomes[targetUid].lastHealthChange -= healthDamage;
  return shieldBlock + healthDamage;
}

function rankPlayersForMode(playersObj, modeId) {
  const players = Object.entries(playersObj || {}).map(([uid, player]) => ({ uid, ...player }));
  const nameSort = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));
  if (modeId === 'coin-rush') {
    return players.sort((a, b) => (Number(b.coins || 0) - Number(a.coins || 0)) || (Number(b.correct || 0) - Number(a.correct || 0)) || nameSort(a, b));
  }
  if (modeId === 'cadet-race') {
    return players.sort((a, b) => (Number(b.distance || 0) - Number(a.distance || 0)) || (Number(b.correct || 0) - Number(a.correct || 0)) || nameSort(a, b));
  }
  if (modeId === 'power-battle') {
    return players.sort((a, b) => (Number(b.health ?? BATTLE_START_HEALTH) - Number(a.health ?? BATTLE_START_HEALTH)) || (Number(b.damage || 0) - Number(a.damage || 0)) || (Number(b.power || 0) - Number(a.power || 0)) || nameSort(a, b));
  }
  return LQ.rankPlayers(playersObj);
}

function seededNumber(seed) {
  let hash = 2166136261;
  const str = String(seed);
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function formatSigned(value) {
  const number = Math.round(Number(value || 0));
  return `${number >= 0 ? '+' : '-'}${LQ.formatScore(Math.abs(number))}`;
}

async function endGame() {
  if (!gamePin) return;
  clearAutoReveal();
  cleanupTimer();
  LQ.Sounds.stopMusic();
  await update(ref(db, `${GAME_ROOT}/${gamePin}`), {
    updatedAt: serverTimestamp(),
    'state/phase': 'ended',
    'state/endedAt': Date.now()
  });
  LQ.showScreen('ended');
}

function renderEnded(game) {
  const endedKey = `${game.state?.endedAt || 'ended'}`;
  if (endedKey !== lastEndedAudioKey) {
    lastEndedAudioKey = endedKey;
    LQ.Sounds.victory();
  }
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  const ranked = rankPlayersForMode(game.players || {}, mode.id);
  els.winnerTitle.textContent = ranked[0] ? `${ranked[0].name || 'Winner'} wins!` : 'Game ended';
  renderFinalModeSummary(game);
  renderLeaderboard(els.finalLeaderboard, game.players || {});
  LQ.showScreen('ended');
}

window.addEventListener('beforeunload', () => {
  clearAutoReveal();
  cleanupTimer();
  LQ.Sounds.stopMusic();
});

function toCamel(id) {
  return id.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}
