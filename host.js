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
let powerBattleAutoAdvanceId = null;
let powerBattleResolving = false;
let autoRevealTimer = null;
let revealInProgress = false;
let questionStartInProgress = false;
let lastPhase = '';
let lastRevealAudioKey = '';
let lastRevealAnimationKey = '';
let lastEndedAudioKey = '';

const RACE_FINISH_DISTANCE = 500;
const BATTLE_START_HEALTH = 5;
const POWER_BATTLE_INTRO_MS = 3000;
const POWER_BATTLE_RESULT_MS = 10000;
const SELF_PACED_MODES = new Set(['coin-rush', 'cadet-race']);
const DEFAULT_GOAL_LIMITS = { 'coin-rush': 10000, 'cadet-race': 500, 'power-battle': 5 };
const BATTLE_IMAGES = {
  badge: 'jcso-battle-badge-md.png?v=20260630-power-battle-autoflow-v1',
  shield: 'jcso-effect-shield-md.webp?v=20260630-power-battle-autoflow-v1',
  attack: 'jcso-effect-attack-md.webp?v=20260630-power-battle-autoflow-v1',
  speed: 'jcso-effect-speed-md.webp?v=20260630-power-battle-autoflow-v1',
  elimination: 'jcso-effect-elimination-md.webp?v=20260630-power-battle-autoflow-v1',
  vs: 'jcso-power-battle-vs-screen-md.webp?v=20260630-power-battle-autoflow-v1',
  result: 'jcso-power-battle-result-screen-md.webp?v=20260630-power-battle-autoflow-v1',
  waiting: 'jcso-power-battle-waiting-screen-md.webp?v=20260630-power-battle-autoflow-v1',
  bye: 'jcso-power-battle-bye-screen-md.webp?v=20260630-power-battle-autoflow-v1',
  eliminated: 'jcso-power-battle-eliminated-screen-md.webp?v=20260630-power-battle-autoflow-v1',
  champion: 'jcso-power-battle-champion-screen-md.webp?v=20260630-power-battle-autoflow-v1',
  hostBoard: 'jcso-power-battle-host-board-md.webp?v=20260630-power-battle-autoflow-v1',
  hostResults: 'jcso-power-battle-host-results-md.webp?v=20260630-power-battle-autoflow-v1',
  countdown1: 'jcso-countdown-1-md.webp?v=20260630-power-battle-autoflow-v1',
  countdown2: 'jcso-countdown-2-md.webp?v=20260630-power-battle-autoflow-v1',
  countdown3: 'jcso-countdown-3-md.webp?v=20260630-power-battle-autoflow-v1',
  health1: 'jcso-health-1-md.png?v=20260630-power-battle-autoflow-v1',
  health2: 'jcso-health-2-md.png?v=20260630-power-battle-autoflow-v1',
  health3: 'jcso-health-3-md.png?v=20260630-power-battle-autoflow-v1',
  health4: 'jcso-health-4-md.png?v=20260630-power-battle-autoflow-v1',
  health5: 'jcso-health-5-md.png?v=20260630-power-battle-autoflow-v1',
  badgeWinner: 'jcso-badge-winner-md.png?v=20260630-power-battle-autoflow-v1',
  badgeDefeated: 'jcso-badge-defeated-md.png?v=20260630-power-battle-autoflow-v1',
  badgeBothWrong: 'jcso-badge-both-wrong-md.png?v=20260630-power-battle-autoflow-v1',
  badgeFastest: 'jcso-badge-fastest-md.png?v=20260630-power-battle-autoflow-v1',
  badgeLostLife: 'jcso-badge-lost-life-md.png?v=20260630-power-battle-autoflow-v1',
  badgeBye: 'jcso-badge-bye-md.png?v=20260630-power-battle-autoflow-v1',
  reactionBest: 'jcso-reaction-best-md.png?v=20260630-power-battle-autoflow-v1',
  reactionPersonalBest: 'jcso-reaction-personalbest-md.png?v=20260630-power-battle-autoflow-v1',
  reactionRoundFast: 'jcso-reaction-roundfast-md.png?v=20260630-power-battle-autoflow-v1',
  playerCard: 'jcso-ui-player-card-empty-md.png?v=20260630-power-battle-autoflow-v1',
  timerRing: 'jcso-ui-timer-ring-md.png?v=20260630-power-battle-autoflow-v1'
};
const RACE_IMAGES = {
  track: 'jcso-race-track-md.png?v=20260630-power-battle-autoflow-v1',
  car: 'jcso-race-car-md.png?v=20260630-power-battle-autoflow-v1',
  patrol: 'jcso-patrol-unit-md.png?v=20260630-power-battle-autoflow-v1'
};
let processingRewardRequests = new Set();
let endingInProgress = false;

const els = {};
let selectedModeId = LQ.getParam('mode') || localStorage.getItem('jcsoQuestHostMode') || 'classic';

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
    'load-status', 'bank-pill', 'question-set-select', 'selected-mode-card', 'game-mode-select', 'mode-preview', 'category-select', 'category-summary', 'question-count-label', 'question-count', 'timer-select',
    'classic-timer-wrap', 'self-paced-options', 'goal-limit-label', 'goal-limit', 'game-time-limit',
    'shuffle-toggle', 'create-game', 'setup-status', 'firebase-warning', 'pin-display', 'lobby-mode-pill', 'copy-link',
    'join-url', 'join-qr', 'lobby-players', 'player-count-pill', 'start-game', 'round-label',
    'live-mode-label', 'live-objective-label', 'live-time-label', 'live-player-count', 'live-headline', 'live-subhead', 'live-mode-status-panel', 'live-leaderboard', 'end-from-play',
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
    els.gameModeSelect.addEventListener('change', () => {
      selectedModeId = els.gameModeSelect.value || selectedModeId;
      localStorage.setItem('jcsoQuestHostMode', selectedModeId);
      renderModePreview();
      renderGameModeOptions();
    });
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
  if (els.endFromPlay) els.endFromPlay.addEventListener('click', endGame);
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
  if (!LQ.gameModes.some(mode => mode.id === selectedModeId)) selectedModeId = 'classic';
  if (els.gameModeSelect) els.gameModeSelect.value = selectedModeId;
  localStorage.setItem('jcsoQuestHostMode', selectedModeId);
  renderModePreview();
  renderGameModeOptions();

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
  const mode = LQ.getGameMode(els.gameModeSelect?.value || selectedModeId || 'classic');
  if (els.modePreview) {
    els.modePreview.innerHTML = `
      <div class="mode-preview-icon">${LQ.modeLogoMarkup(mode, 'mode-logo-chip mode-logo-inline')}</div>
      <div>
        <strong>${LQ.escapeHtml(mode.name)}</strong>
        <p>${LQ.escapeHtml(mode.description)}</p>
        <small>${LQ.escapeHtml(mode.objective)}</small>
      </div>
    `;
  }
  if (els.selectedModeCard) {
    const labels = mode.id === 'classic'
      ? ['Host-paced quiz', 'Timed questions', 'Speed points']
      : mode.id === 'power-battle'
        ? ['Power Battle', 'Simultaneous matchups', '5 lives decide the winner']
        : ['Self-paced game', 'No question timer', 'Goal or time limit'];
    els.selectedModeCard.innerHTML = `
      <img src="${LQ.escapeAttr(mode.image || '')}?v=20260630-power-battle-autoflow-v1" alt="" loading="lazy" decoding="async" />
      <div>
        <p class="eyebrow">Selected mode</p>
        <h2>${LQ.escapeHtml(mode.name)}</h2>
        <p>${LQ.escapeHtml(mode.description)}</p>
        <div class="selected-mode-tags">${labels.map(label => `<span>${LQ.escapeHtml(label)}</span>`).join('')}</div>
      </div>
      <a class="ghost-btn mini-change-mode" href="modes.html">Change Mode</a>
    `;
  }
}

function renderGameModeOptions() {
  const modeId = els.gameModeSelect?.value || selectedModeId || 'classic';
  const selfPaced = isSelfPacedMode(modeId);
  const battleMode = modeId === 'power-battle';
  if (els.classicTimerWrap) els.classicTimerWrap.classList.toggle('hidden', selfPaced);
  if (els.selfPacedOptions) els.selfPacedOptions.classList.toggle('hidden', !(selfPaced || battleMode));
  if (els.questionCountLabel) els.questionCountLabel.textContent = selfPaced ? 'Question pool' : 'Questions';
  const timeWrap = els.gameTimeLimit?.closest?.('.setup-control-group');
  if (timeWrap) timeWrap.classList.toggle('hidden', battleMode || modeId === 'classic');
  const hint = els.selfPacedOptions?.querySelector?.('.small.muted');
  if (hint) hint.textContent = battleMode
    ? 'Power Battle uses host-paced rounds. All active players see the same question at the same time, but each player only battles their paired opponent. Players always start with 5 lives.'
    : 'Self-paced modes end when the goal is reached or the game clock expires.';
  if (!els.goalLimitLabel || !els.goalLimit) return;
  const labels = {
    'coin-rush': 'Gold goal',
    'cadet-race': 'Distance goal',
    'power-battle': 'Lives'
  };
  const options = {
    'coin-rush': [2000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000, 25000000, 50000000, 100000000],
    'cadet-race': [250, 500, 750, 1000, 1500, 2500, 5000],
    'power-battle': [5]
  };
  els.goalLimitLabel.textContent = labels[modeId] || 'Goal limit';
  const values = options[modeId] || options['coin-rush'];
  const previous = Number(els.goalLimit.value || DEFAULT_GOAL_LIMITS[modeId] || values[1]);
  els.goalLimit.innerHTML = values.map(value => `<option value="${value}">${LQ.formatScore(value)}${battleMode ? ' lives' : ''}</option>`).join('');
  const chosen = values.includes(previous) ? previous : (DEFAULT_GOAL_LIMITS[modeId] || values[1]);
  els.goalLimit.value = String(chosen);
}

function isSelfPacedMode(modeId) {
  return SELF_PACED_MODES.has(modeId);
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
      questionBank: selectedQuestions,
      state: {
        phase: 'lobby',
        pin,
        questionIndex: -1,
        questionCount: selectedQuestions.length,
        startedAt: 0,
        endsAt: 0,
        goalLimit: settings.goalLimit || 0
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
  const mode = LQ.getGameMode(els.gameModeSelect?.value || selectedModeId || 'classic');
  return {
    questionSetId: sourceSet.id,
    questionSetLabel: sourceSet.label,
    gameMode: mode.id,
    gameModeName: mode.name,
    gameModeIcon: mode.icon,
    category: els.categorySelect.value,
    requestedCount: els.questionCount.value,
    timerSeconds: Number(els.timerSelect?.value || 30),
    goalLimit: Number(els.goalLimit?.value || DEFAULT_GOAL_LIMITS[mode.id] || 500),
    gameTimeLimitMinutes: Number(els.gameTimeLimit?.value || 0),
    selfPaced: isSelfPacedMode(mode.id),
    shuffleAnswers: els.shuffleToggle.checked
  };
}

function selectQuestions(settings) {
  selectedSet = questionSets.find(set => set.id === settings.questionSetId) || selectedSet || questionSets[0] || null;
  bank = selectedSet?.bank || [];
  let pool = settings.category === 'all' ? [...bank] : bank.filter(q => q.category === settings.category);
  pool = LQ.shuffle(pool);
  const count = settings.requestedCount === 'all' ? pool.length : Math.min(Number(settings.requestedCount), pool.length);
  const picked = pool.slice(0, count);
  return settings.shuffleAnswers ? picked.map(randomizeQuestionChoices) : picked.map(q => ({ ...q, choices: [...(q.choices || [])] }));
}

function randomizeQuestionChoices(question) {
  const choices = (question.choices || []).map((choice, originalIndex) => ({ choice, originalIndex }));
  const shuffled = LQ.shuffle(choices);
  const answer = shuffled.findIndex(item => Number(item.originalIndex) === Number(question.answer || 0));
  return {
    ...question,
    choices: shuffled.map(item => item.choice),
    answer: answer >= 0 ? answer : 0
  };
}

function renderLobbyStatic() {
  const settings = liveGame?.settings || getSettings();
  const mode = LQ.getGameMode(settings.gameMode || 'classic');
  els.pinDisplay.textContent = gamePin;
  if (els.lobbyModePill) els.lobbyModePill.innerHTML = LQ.modeLogoMarkup(mode, 'mode-logo-chip pill-mode-logo');
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
    if (phase === 'play') LQ.Sounds.playMusic('question');
    if (phase === 'reveal') LQ.Sounds.stopMusic();
    if (phase === 'ended') LQ.Sounds.stopMusic();
  }
  if (phase === 'lobby') renderLobbyPlayers(game);
  if (phase === 'question') renderQuestionProgress(game);
  if (phase === 'play') renderSelfPacedDashboard(game);
  if (phase === 'reveal') renderReveal(game);
  if (phase === 'ended') renderEnded(game);
}

function renderLobbyPlayers(game) {
  const players = LQ.rankPlayers(game.players || {});
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  if (els.lobbyModePill) els.lobbyModePill.innerHTML = LQ.modeLogoMarkup(mode, 'mode-logo-chip pill-mode-logo');
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
  const modeId = liveGame?.settings?.gameMode || getSettings().gameMode || 'classic';
  if (isSelfPacedMode(modeId)) {
    await startSelfPacedGame();
    return;
  }
  await nextQuestion();
}

async function startSelfPacedGame() {
  const latestSnap = await get(ref(db, `${GAME_ROOT}/${gamePin}`));
  if (latestSnap.exists()) liveGame = latestSnap.val();
  const settings = liveGame?.settings || getSettings();
  const now = Date.now();
  const timeLimitMinutes = Number(settings.gameTimeLimitMinutes || 0);
  const endsAt = timeLimitMinutes > 0 ? now + timeLimitMinutes * 60 * 1000 : 0;
  const players = liveGame?.players || {};
  const updates = {
    updatedAt: serverTimestamp(),
    reveal: null,
    question: null,
    'state/phase': 'play',
    'state/pin': gamePin,
    'state/questionIndex': -1,
    'state/questionCount': selectedQuestions.length,
    'state/startedAt': now,
    'state/endsAt': endsAt,
    'state/goalLimit': Number(settings.goalLimit || DEFAULT_GOAL_LIMITS[settings.gameMode] || 500)
  };

  Object.keys(players).forEach(playerUid => {
    updates[`players/${playerUid}/score`] = 0;
    updates[`players/${playerUid}/coins`] = 0;
    updates[`players/${playerUid}/distance`] = 0;
    updates[`players/${playerUid}/power`] = 0;
    updates[`players/${playerUid}/damage`] = 0;
    updates[`players/${playerUid}/shield`] = 0;
    updates[`players/${playerUid}/health`] = BATTLE_START_HEALTH;
    updates[`players/${playerUid}/correct`] = 0;
    updates[`players/${playerUid}/answered`] = 0;
    updates[`players/${playerUid}/played`] = 0;
    updates[`players/${playerUid}/streak`] = 0;
    updates[`players/${playerUid}/lastGain`] = 0;
    updates[`players/${playerUid}/lastCoins`] = 0;
    updates[`players/${playerUid}/lastDistance`] = 0;
    updates[`players/${playerUid}/lastPower`] = 0;
    updates[`players/${playerUid}/lastDamage`] = 0;
    updates[`players/${playerUid}/lastHealthChange`] = 0;
    updates[`players/${playerUid}/lastShield`] = 0;
    updates[`players/${playerUid}/lastReactionMs`] = 0;
    updates[`players/${playerUid}/bestReactionMs`] = null;
    updates[`players/${playerUid}/lastCorrect`] = false;
    updates[`players/${playerUid}/lastChoiceIndex`] = -1;
    updates[`players/${playerUid}/lastModeLabel`] = 'Game started. Answer a question to unlock rewards.';
    updates[`players/${playerUid}/lastCorrectAnswer`] = '';
    updates[`players/${playerUid}/lastExplanation`] = '';
    updates[`players/${playerUid}/selfQuestionIndex`] = 0;
    updates[`players/${playerUid}/resultReady`] = false;
    updates[`players/${playerUid}/pendingRewardRequest`] = null;
    updates[`players/${playerUid}/targetPickRequest`] = null;
  });

  await update(ref(db, `${GAME_ROOT}/${gamePin}`), updates);
  LQ.Sounds.playMusic('question');
  LQ.showScreen('play');
}

function renderSelfPacedDashboard(game) {
  const mode = LQ.getGameMode(game.settings?.gameMode || 'coin-rush');
  const playersObj = game.players || {};
  const players = rankPlayersForMode(playersObj, mode.id);
  const goal = Number(game.state?.goalLimit || game.settings?.goalLimit || DEFAULT_GOAL_LIMITS[mode.id] || 500);
  cleanupTimer();

  if (els.liveModeLabel) els.liveModeLabel.innerHTML = LQ.modeLogoMarkup(mode, 'mode-logo-chip pill-mode-logo');
  if (els.liveObjectiveLabel) els.liveObjectiveLabel.textContent = `${objectiveLabel(mode.id)}: ${LQ.formatScore(goal)} ${objectiveUnit(mode.id)}`;
  if (els.livePlayerCount) els.livePlayerCount.textContent = `${players.length} player${players.length === 1 ? '' : 's'}`;
  if (els.liveHeadline) els.liveHeadline.textContent = liveHeadline(mode.id, players[0], goal);
  if (els.liveSubhead) els.liveSubhead.textContent = 'Players answer at their own pace. Correct answers unlock three mystery rewards.';

  updateSelfPacedTimeLabel(game);
  timerId = setInterval(() => {
    updateSelfPacedTimeLabel(liveGame || game);
    if (shouldEndSelfPaced(liveGame || game)) endGame();
  }, 1000);

  renderSelfPacedModeStatus(game, els.liveModeStatusPanel);
  renderLeaderboard(els.liveLeaderboard, playersObj);
  processPendingRewardRequests(game);
  if (shouldEndSelfPaced(game)) endGame();
  LQ.showScreen('play');
}

function updateSelfPacedTimeLabel(game) {
  if (!els.liveTimeLabel) return;
  const endsAt = Number(game?.state?.endsAt || 0);
  if (!endsAt) {
    els.liveTimeLabel.textContent = 'No time limit';
    return;
  }
  const ms = Math.max(0, endsAt - Date.now());
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  els.liveTimeLabel.textContent = `Time: ${minutes}:${String(seconds).padStart(2, '0')}`;
}

function liveHeadline(modeId, leader, goal) {
  if (!leader) return 'Waiting for players to begin.';
  const name = leader.name || 'Leader';
  if (modeId === 'coin-rush') return `${name} leads with ${LQ.formatScore(leader.coins || 0)} gold. Goal: ${LQ.formatScore(goal)}.`;
  if (modeId === 'cadet-race') return `${name} leads at ${LQ.formatScore(leader.distance || 0)} ft. Finish: ${LQ.formatScore(goal)} ft.`;
  if (modeId === 'power-battle') return `${name} leads with ${LQ.formatScore(leader.health ?? goal)} lives. Starting lives: ${LQ.formatScore(goal)}.`;
  return `${name} is leading.`;
}

function objectiveLabel(modeId) {
  if (modeId === 'coin-rush') return 'Gold goal';
  if (modeId === 'cadet-race') return 'Distance goal';
  if (modeId === 'power-battle') return 'Starting lives';
  return 'Goal';
}

function objectiveUnit(modeId) {
  if (modeId === 'coin-rush') return 'gold';
  if (modeId === 'cadet-race') return 'ft';
  if (modeId === 'power-battle') return 'lives';
  return 'points';
}

function renderSelfPacedModeStatus(game, container) {
  if (!container) return;
  const mode = LQ.getGameMode(game.settings?.gameMode || 'coin-rush');
  const players = rankPlayersForMode(game.players || {}, mode.id).slice(0, 8);
  const goal = Number(game.state?.goalLimit || game.settings?.goalLimit || DEFAULT_GOAL_LIMITS[mode.id] || 500);
  if (mode.id === 'coin-rush') {
    container.innerHTML = `
      <div class="mode-objective"><strong>${LQ.modeLogoMarkup(mode, 'mode-logo-chip mode-logo-inline')}</strong><span>Players pick one of three mystery chests after each correct answer.</span></div>
      <div class="coin-board">
        ${players.map((p, i) => `<div class="coin-card ${i === 0 ? 'first' : ''}">${LQ.avatarMarkup(p, 'avatar-img')}<strong>${LQ.escapeHtml(p.name || 'Player')}</strong><span>🪙 ${LQ.formatScore(p.coins || 0)} / ${LQ.formatScore(goal)}</span><small>${LQ.escapeHtml(p.lastModeLabel || '')}</small></div>`).join('') || '<span class="muted">No players yet.</span>'}
      </div>
    `;
    return;
  }
  if (mode.id === 'cadet-race') {
    container.innerHTML = `
      <div class="mode-objective race-objective"><strong>${LQ.modeLogoMarkup(mode, 'mode-logo-chip mode-logo-inline')}</strong><span>Players choose route cards after correct answers and race patrol units to the finish.</span></div>
      <div class="race-arena">
        <img class="race-board-art" src="${RACE_IMAGES.track}" alt="Cadet Race track" loading="lazy" decoding="async" />
        <div class="race-board race-board-polished">
          ${players.map(p => {
            const distance = LQ.clamp(Number(p.distance || 0), 0, goal);
            const percent = (distance / Math.max(1, goal)) * 100;
            return `<div class="race-lane race-lane-polished"><span>${LQ.avatarMarkup(p, 'avatar-img tiny-avatar-img')}</span><strong>${LQ.escapeHtml(p.name || 'Player')}</strong><div class="race-track"><span style="width:${percent}%"></span><em style="left:${percent}%"><img src="${RACE_IMAGES.car}" alt="race car"></em></div><small>${LQ.formatScore(distance)} / ${LQ.formatScore(goal)} ft</small></div>`;
          }).join('') || '<span class="muted">No racers yet.</span>'}
        </div>
      </div>
    `;
    return;
  }
  const startingLives = Number(goal || BATTLE_START_HEALTH);
  container.innerHTML = `
    <div class="mode-objective battle-objective"><strong>${LQ.modeLogoMarkup('power-battle', 'mode-logo-chip mode-logo-inline')}</strong><span>Players are paired into Power Battle matchups. Everyone answers the same question at the same time, and only the paired opponent matters.</span></div>
    <div class="battle-hero-panel battle-host-hero-panel">
      <img class="battle-host-board-art" src="${BATTLE_IMAGES.hostBoard}" alt="Power Battle host board" loading="lazy" decoding="async" />
      <div class="battle-speed-card"><strong>Best reaction</strong><span>${bestReactionLine(liveGame || {})}</span></div>
    </div>
    <div class="battle-board battle-royale-board">
      ${players.map(p => renderBattlePlayerRow(p, startingLives, (liveGame || {}).question?.battlePairs || {}, (liveGame || {}).players || {})).join('') || '<span class="muted">No battlers yet.</span>'}
    </div>
  `;
}

async function processPendingRewardRequests(game) {
  if (!gamePin || game.state?.phase !== 'play') return;
  const modeId = game.settings?.gameMode || 'coin-rush';
  const players = game.players || {};
  const questionBank = game.questionBank || selectedQuestions || [];
  for (const [playerUid, player] of Object.entries(players)) {
    const request = player.pendingRewardRequest;
    if (!request || !request.requestId) continue;
    const processKey = `${playerUid}:${request.requestId}`;
    if (processingRewardRequests.has(processKey)) continue;
    processingRewardRequests.add(processKey);
    try {
      const updates = resolveSelfPacedReward(game, playerUid, request, questionBank, modeId);
      updates.updatedAt = serverTimestamp();
      await update(ref(db, `${GAME_ROOT}/${gamePin}`), updates);
    } catch (err) {
      console.error('Reward processing failed', err);
    } finally {
      processingRewardRequests.delete(processKey);
    }
  }
}

function resolveSelfPacedReward(game, playerUid, request, questionBank, modeId) {
  const players = game.players || {};
  const player = players[playerUid] || {};
  const qIndex = Number(request.questionIndex || 0) % Math.max(1, questionBank.length);
  const question = questionBank[qIndex] || {};
  const correct = Number(request.choiceIndex) === Number(question.answer || 0);
  const nextStreak = correct ? Number(player.streak || 0) + 1 : 0;

  if (correct && modeId === 'coin-rush' && !request.targetUid && isGoldRushStealEvent(game, playerUid, request) && goldStealTargets(playerUid, players).length) {
    const percent = goldRushStealPercent(request, playerUid);
    return {
      [`players/${playerUid}/pendingRewardRequest`]: null,
      [`players/${playerUid}/targetPickRequest`]: {
        requestId: request.requestId,
        modeId,
        questionIndex: qIndex,
        choiceIndex: Number(request.choiceIndex ?? -1),
        chestIndex: Number(request.chestIndex || 0),
        percent,
        createdAt: Date.now()
      },
      [`players/${playerUid}/resultReady`]: false,
      [`players/${playerUid}/lastCorrect`]: true,
      [`players/${playerUid}/lastModeLabel`]: 'Steal chest found! Choose whose gold to steal from the leaderboard.',
      [`players/${playerUid}/lastCorrectAnswer`]: (question.choices || [])[Number(question.answer || 0)] || '',
      [`players/${playerUid}/lastExplanation`]: question.explanation || ''
    };
  }

  const updates = {
    [`players/${playerUid}/pendingRewardRequest`]: null,
    [`players/${playerUid}/targetPickRequest`]: null,
    [`players/${playerUid}/resultReady`]: true,
    [`players/${playerUid}/answered`] : Number(player.answered || 0) + 1,
    [`players/${playerUid}/played`] : Number(player.played || 0) + 1,
    [`players/${playerUid}/streak`] : nextStreak,
    [`players/${playerUid}/lastCorrect`] : correct,
    [`players/${playerUid}/lastChoiceIndex`] : Number(request.choiceIndex ?? -1),
    [`players/${playerUid}/lastCorrectAnswer`] : (question.choices || [])[Number(question.answer || 0)] || '',
    [`players/${playerUid}/lastExplanation`] : question.explanation || '',
    [`players/${playerUid}/lastCoins`] : 0,
    [`players/${playerUid}/lastDistance`] : 0,
    [`players/${playerUid}/lastPower`] : 0,
    [`players/${playerUid}/lastDamage`] : 0,
    [`players/${playerUid}/lastHealthChange`] : 0,
    [`players/${playerUid}/lastShield`] : 0
  };

  if (!correct) {
    updates[`players/${playerUid}/lastGain`] = 0;
    updates[`players/${playerUid}/lastModeLabel`] = 'No reward — answer was not correct.';
    return updates;
  }

  updates[`players/${playerUid}/correct`] = Number(player.correct || 0) + 1;
  const reward = calculateSelfPacedReward(modeId, game, playerUid, request, nextStreak);
  Object.assign(updates, reward.updates);
  updates[`players/${playerUid}/lastModeLabel`] = reward.label;
  updates[`players/${playerUid}/lastGain`] = reward.lastGain;
  updates[`players/${playerUid}/lastRewardType`] = reward.type;
  return updates;
}

function calculateSelfPacedReward(modeId, game, playerUid, request, streak) {
  if (modeId === 'cadet-race') return calculateRaceCardReward(game, playerUid, request, streak);
  if (modeId === 'power-battle') return calculateBattleCrateReward(game, playerUid, request, streak);
  return calculateCoinChestReward(game, playerUid, request, streak);
}

function calculateCoinChestReward(game, playerUid, request, streak) {
  const players = game.players || {};
  const player = players[playerUid] || {};
  const seed = goldRushSeed(request, playerUid);
  const roll = seededNumber(seed);
  const currentCoins = Number(player.coins || 0);
  const updates = {};
  const normal = 25 + Math.floor(seededNumber(`${seed}-base`) * 76); // 25–100 max unless doubled, tripled, or stolen.
  let delta = 0;
  let label = '';
  let type = 'gold';
  let percent = 0;

  if (roll < 0.30) {
    delta = normal;
    label = `Gold chest: +${delta} gold`;
    type = 'gold';
  } else if (roll < 0.45) {
    delta = normal * 2;
    label = `Double gold chest: +${delta} gold`;
    type = 'double';
  } else if (roll < 0.60) {
    delta = normal * 3;
    label = `Triple gold chest: +${delta} gold`;
    type = 'triple';
  } else if (roll < 0.75) {
    percent = 0.20 + seededNumber(`${seed}-loss-percent`) * 0.30;
    const pctText = Math.round(percent * 100);
    if (currentCoins > 0) {
      delta = -Math.min(currentCoins, Math.max(1, Math.round(currentCoins * percent)));
      label = `Trap chest: lost ${pctText}% of your gold (${Math.abs(delta)} gold)`;
    } else {
      delta = 0;
      label = `Trap chest: lost ${pctText}% — but your vault was empty`;
    }
    type = 'loss-percent';
  } else {
    const targetUid = request.targetUid && players[request.targetUid] && request.targetUid !== playerUid
      ? request.targetUid
      : pickRichTarget(playerUid, players, `${seed}-steal`);
    const target = targetUid ? players[targetUid] || {} : null;
    const targetCurrent = Number(target?.coins || 0);
    if (targetUid && targetCurrent > 0) {
      if (roll < 0.88) {
        delta = Math.min(targetCurrent, 75 + Math.floor(seededNumber(`${seed}-flat-steal`) * 176));
        label = `Steal chest: took ${delta} gold from ${target.name || 'another player'}`;
        type = 'steal-flat';
      } else {
        percent = goldRushStealPercent(request, playerUid);
        const pctText = Math.round(percent * 100);
        delta = Math.min(targetCurrent, Math.max(1, Math.round(targetCurrent * percent)));
        label = `Steal chest: stole ${pctText}% from ${target.name || 'another player'} (${delta} gold)`;
        type = 'steal-percent';
      }
      const targetCoins = Math.max(0, targetCurrent - delta);
      updates[`players/${targetUid}/coins`] = targetCoins;
      updates[`players/${targetUid}/score`] = targetCoins;
      updates[`players/${targetUid}/lastCoins`] = -delta;
      updates[`players/${targetUid}/lastGain`] = -delta;
      updates[`players/${targetUid}/lastRewardType`] = type === 'steal-percent' ? 'stolen-percent' : 'stolen-flat';
      updates[`players/${targetUid}/lastModeLabel`] = `${player.name || 'A player'} stole ${type === 'steal-percent' ? `${Math.round(percent * 100)}% of your gold` : `${delta} gold`} from you.`;
    } else {
      delta = normal;
      label = `Steal chest: no opponent had gold, so you banked +${delta} gold`;
      type = 'steal-empty';
    }
  }

  const nextCoins = Math.max(0, Math.round(currentCoins + delta));
  updates[`players/${playerUid}/coins`] = nextCoins;
  updates[`players/${playerUid}/score`] = nextCoins;
  updates[`players/${playerUid}/lastCoins`] = Math.round(delta);
  updates[`players/${playerUid}/lastRewardPercent`] = percent ? Math.round(percent * 100) : 0;
  return { updates, label, lastGain: Math.round(delta), type };
}

function goldRushSeed(request, playerUid) {
  return `${request.requestId}-${playerUid}-${request.chestIndex}-gold-rush`;
}

function isGoldRushStealEvent(game, playerUid, request) {
  const roll = seededNumber(goldRushSeed(request, playerUid));
  return roll >= 0.75;
}

function goldRushStealPercent(request, playerUid) {
  const seed = goldRushSeed(request, playerUid);
  return 0.20 + seededNumber(`${seed}-steal-percent`) * 0.30;
}

function goldStealTargets(uid, players) {
  return Object.entries(players || {})
    .filter(([otherUid, p]) => otherUid !== uid && Number(p.coins || 0) > 0)
    .sort((a, b) => (Number(b[1].coins || 0) - Number(a[1].coins || 0)) || String(a[1].name || '').localeCompare(String(b[1].name || '')));
}

function calculateRaceCardReward(game, playerUid, request, streak) {
  const players = game.players || {};
  const player = players[playerUid] || {};
  const goal = Number(game.state?.goalLimit || game.settings?.goalLimit || RACE_FINISH_DISTANCE);
  const seed = `${request.requestId}-${playerUid}-${request.chestIndex}-race`;
  const roll = seededNumber(seed);
  const base = Math.round(12 + seededNumber(`${seed}-base`) * 18 + Math.min(streak * 4, 30));
  const updates = {};
  let current = Number(player.distance || 0);
  let move = 0;
  let label = '';
  let type = 'route';

  if (roll < 0.42) {
    move = base;
    label = `Patrol route: +${move} ft`;
    type = 'roll';
  } else if (roll < 0.64) {
    move = base * 2;
    label = `Shortcut card: +${move} ft`;
    type = 'shortcut';
  } else if (roll < 0.78) {
    move = -Math.min(current, Math.max(8, Math.round(current * 0.15)));
    label = move < 0 ? `Roadblock: ${move} ft` : 'Roadblock at the start — no distance lost';
    type = 'roadblock';
  } else if (roll < 0.92) {
    const targetUid = pickLeaderTarget(playerUid, players, 'distance', `${seed}-swap`);
    if (targetUid && Number(players[targetUid].distance || 0) > current) {
      const targetDistance = Number(players[targetUid].distance || 0);
      updates[`players/${targetUid}/distance`] = current;
      updates[`players/${targetUid}/score`] = current;
      updates[`players/${targetUid}/lastDistance`] = current - targetDistance;
      updates[`players/${targetUid}/lastGain`] = current - targetDistance;
      updates[`players/${targetUid}/lastModeLabel`] = `${player.name || 'A player'} swapped patrol positions with you.`;
      move = targetDistance - current;
      current = targetDistance;
      label = `Swap card: traded places with ${players[targetUid].name || 'the leader'}`;
      type = 'swap';
    } else {
      move = base + 15;
      label = `Siren boost: +${move} ft`;
      type = 'boost';
    }
  } else {
    move = base + 35;
    label = `Highway sprint: +${move} ft`;
    type = 'sprint';
  }

  const distance = LQ.clamp(Math.round(current + move), 0, goal);
  const actualMove = distance - Number(player.distance || 0);
  updates[`players/${playerUid}/distance`] = distance;
  updates[`players/${playerUid}/score`] = distance;
  updates[`players/${playerUid}/lastDistance`] = actualMove;
  return { updates, label: distance >= goal ? `${label} Finish line reached!` : label, lastGain: actualMove, type };
}

function calculateBattleCrateReward(game, playerUid, request, streak) {
  const players = game.players || {};
  const player = players[playerUid] || {};
  const seed = `${request.requestId}-${playerUid}-${request.chestIndex}-battle`;
  const roll = seededNumber(seed);
  const base = Math.round(40 + seededNumber(`${seed}-base`) * 60 + Math.min(streak * 12, 100));
  const updates = {};
  let power = Number(player.power || 0);
  let shield = Number(player.shield || 0);
  let health = Number(player.health ?? BATTLE_START_HEALTH);
  let deltaPower = 0;
  let label = '';
  let type = 'power';

  if (roll < 0.38) {
    deltaPower = base;
    label = `Power crate: +${deltaPower} power`;
    type = 'surge';
  } else if (roll < 0.58) {
    deltaPower = base * 2;
    label = `Double charge: +${deltaPower} power`;
    type = 'double';
  } else if (roll < 0.72) {
    const lost = Math.min(power, Math.max(30, Math.round(power * 0.20)));
    deltaPower = -lost;
    label = lost ? `Overload trap: -${lost} power` : 'Overload trap fizzled — no power lost';
    type = 'trap';
  } else if (roll < 0.86) {
    const shieldGain = Math.round(base * 0.7);
    shield = LQ.clamp(shield + shieldGain, 0, 250);
    deltaPower = Math.round(base * 0.35);
    updates[`players/${playerUid}/lastShield`] = shieldGain;
    label = `Shield crate: +${shieldGain} shield and +${deltaPower} power`;
    type = 'shield';
  } else if (roll < 0.96) {
    const targetUid = pickLeaderTarget(playerUid, players, 'power', `${seed}-siphon`);
    if (targetUid && Number(players[targetUid].power || 0) > 0) {
      const target = players[targetUid];
      const stolen = Math.min(Number(target.power || 0), Math.max(35, Math.round(Number(target.power || 0) * 0.25)));
      deltaPower = stolen;
      const targetPower = Math.max(0, Number(target.power || 0) - stolen);
      updates[`players/${targetUid}/power`] = targetPower;
      updates[`players/${targetUid}/score`] = targetPower;
      updates[`players/${targetUid}/lastPower`] = -stolen;
      updates[`players/${targetUid}/lastGain`] = -stolen;
      updates[`players/${targetUid}/lastModeLabel`] = `${player.name || 'A player'} siphoned ${stolen} power from you.`;
      label = `Siphon crate: took ${stolen} power from ${target.name || 'another player'}`;
      type = 'siphon';
    } else {
      deltaPower = base;
      label = `Siphon crate found no target, so you gained +${deltaPower} power`;
      type = 'surge';
    }
  } else {
    health = LQ.clamp(health + 20, 0, BATTLE_START_HEALTH);
    deltaPower = base + 50;
    updates[`players/${playerUid}/lastHealthChange`] = 20;
    label = `Command boost: +${deltaPower} power and +20 HP`;
    type = 'critical';
  }

  power = Math.max(0, Math.round(power + deltaPower));
  updates[`players/${playerUid}/power`] = power;
  updates[`players/${playerUid}/score`] = power;
  updates[`players/${playerUid}/shield`] = Math.round(shield);
  updates[`players/${playerUid}/health`] = Math.round(health);
  updates[`players/${playerUid}/lastPower`] = Math.round(deltaPower);
  return { updates, label, lastGain: Math.round(deltaPower), type };
}

function pickRichTarget(uid, players, seed) {
  const options = Object.entries(players)
    .filter(([otherUid, p]) => otherUid !== uid && Number(p.coins || 0) > 0)
    .sort((a, b) => Number(b[1].coins || 0) - Number(a[1].coins || 0));
  if (!options.length) return '';
  const top = options.slice(0, Math.min(4, options.length));
  const index = Math.floor(seededNumber(seed) * top.length) % top.length;
  return top[index][0];
}

function pickLeaderTarget(uid, players, field, seed) {
  const options = Object.entries(players)
    .filter(([otherUid, p]) => otherUid !== uid && Number(p[field] || 0) > 0)
    .sort((a, b) => Number(b[1][field] || 0) - Number(a[1][field] || 0));
  if (!options.length) return '';
  const top = options.slice(0, Math.min(4, options.length));
  const index = Math.floor(seededNumber(seed) * top.length) % top.length;
  return top[index][0];
}

function shouldEndSelfPaced(game) {
  if (!game || game.state?.phase !== 'play' || endingInProgress) return false;
  const modeId = game.settings?.gameMode || 'coin-rush';
  const goal = Number(game.state?.goalLimit || game.settings?.goalLimit || DEFAULT_GOAL_LIMITS[modeId] || 500);
  const endsAt = Number(game.state?.endsAt || 0);
  if (endsAt && Date.now() >= endsAt) return true;
  return Object.values(game.players || {}).some(player => Number(playerStatForGoal(player, modeId)) >= goal);
}

function playerStatForGoal(player, modeId) {
  if (modeId === 'coin-rush') return player.coins || 0;
  if (modeId === 'cadet-race') return player.distance || 0;
  if (modeId === 'power-battle') return player.health ?? BATTLE_START_HEALTH;
  return player.score || 0;
}

async function nextQuestion() {
  LQ.Sounds.unlock();
  clearAutoReveal();
  cleanupPowerBattleAutoAdvance();
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
    const mode = LQ.getGameMode(liveGame?.settings?.gameMode || 'classic');
    const eligiblePlayerUids = Object.keys(playersAtStart).filter(playerUid => playersAtStart[playerUid] && playersAtStart[playerUid].name && (mode.id !== 'power-battle' || nextIndex === 0 || Number(playersAtStart[playerUid].health || 0) > 0));
    const eligiblePlayers = Object.fromEntries(eligiblePlayerUids.map(playerUid => [playerUid, true]));
    const eligiblePlayerNames = Object.fromEntries(eligiblePlayerUids.map(playerUid => [playerUid, String(playersAtStart[playerUid]?.name || 'Player')]));
    if (mode.id === 'power-battle' && nextIndex > 0) {
      const aliveUids = Object.keys(playersAtStart).filter(playerUid => playersAtStart[playerUid]?.name && Number(playersAtStart[playerUid]?.health || 0) > 0);
      if (aliveUids.length <= 1) {
        await endGame();
        return;
      }
    }
    const battlePairMap = mode.id === 'power-battle' ? buildBattlePairs(playersAtStart, nextIndex) : null;
    activeQuestion = {
      localIndex: nextIndex,
      question: q,
      choices,
      correctIndex,
      startedAt: now,
      endsAt: now + timerSeconds * 1000 + (mode.id === 'power-battle' ? POWER_BATTLE_INTRO_MS : 0)
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
        eligibleCount: eligiblePlayerUids.length,
        battlePairs: battlePairMap || null
      },
      state: {
        phase: 'question',
        pin: gamePin,
        questionIndex: nextIndex,
        questionCount: selectedQuestions.length,
        startedAt: now,
        endsAt: now + timerSeconds * 1000 + (mode.id === 'power-battle' ? POWER_BATTLE_INTRO_MS : 0)
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
        gameUpdate[`players/${playerUid}/health`] = mode.id === 'power-battle' ? BATTLE_START_HEALTH : BATTLE_START_HEALTH;
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
        gameUpdate[`players/${playerUid}/lastReactionMs`] = 0;
        gameUpdate[`players/${playerUid}/bestReactionMs`] = null;
        gameUpdate[`players/${playerUid}/lastBattleOpponent`] = '';
        gameUpdate[`players/${playerUid}/lastBattleOpponentUid`] = '';
        gameUpdate[`players/${playerUid}/lastBattleOpponentReactionMs`] = 0;
        gameUpdate[`players/${playerUid}/lastBattleResult`] = '';
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
  cleanupPowerBattleAutoAdvance();
  maybeResolvePowerBattleEarly(game);
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
  const startedAt = Number(liveGame?.state?.startedAt || Date.now());
  const tick = () => {
    const now = Date.now();
    const remainingMs = Math.max(0, endsAt - now);
    const seconds = Math.ceil(remainingMs / 1000);
    const openingCountdownMs = liveGame?.settings?.gameMode === 'power-battle' ? Math.max(0, POWER_BATTLE_INTRO_MS - (now - startedAt)) : 0;
    if (liveGame?.settings?.gameMode === 'power-battle' && openingCountdownMs > 0) {
      const count = Math.max(1, Math.ceil(openingCountdownMs / 1000));
      els.timerText.innerHTML = `<img class="battle-countdown-img host-countdown-img" src="${battleCountdownAsset(count)}" alt="${count}" />`;
    } else {
      els.timerText.textContent = seconds;
    }
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

function cleanupPowerBattleAutoAdvance() {
  if (powerBattleAutoAdvanceId) {
    clearTimeout(powerBattleAutoAdvanceId);
    powerBattleAutoAdvanceId = null;
  }
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
    const battleIntroMs = mode.id === 'power-battle' ? POWER_BATTLE_INTRO_MS : 0;
    const elapsed = answered ? Math.max(0, Number(answer.answeredAt || Date.now()) - Number(game.state?.startedAt || Date.now()) - battleIntroMs) : totalMs;
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
    updates[`players/${playerUid}/lastReactionMs`] = outcome.lastReactionMs || 0;
    updates[`players/${playerUid}/bestReactionMs`] = outcome.bestReactionMs || null;
    updates[`players/${playerUid}/lastBattleOpponent`] = outcome.lastBattleOpponent || '';
    updates[`players/${playerUid}/lastBattleOpponentUid`] = outcome.lastBattleOpponentUid || '';
    updates[`players/${playerUid}/lastBattleOpponentReactionMs`] = outcome.lastBattleOpponentReactionMs || 0;
    updates[`players/${playerUid}/lastBattleResult`] = outcome.lastBattleResult || '';
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
  schedulePowerBattleAutoAdvance(game);
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
  if (modeId === 'power-battle') return `${LQ.formatScore(value)} lives`;
  return `${LQ.formatScore(value)} pts`;
}

function scoreSuffix(modeId) {
  if (modeId === 'coin-rush') return ' gold';
  if (modeId === 'cadet-race') return ' ft';
  if (modeId === 'power-battle') return ' lives';
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
    return `${base} · ${LQ.formatScore(p.health ?? BATTLE_START_HEALTH)} lives · ${LQ.formatScore(p.damage || 0)} wins · best ${formatReactionTime(p.bestReactionMs)}`;
  }
  return `${base}${Number(p.lastGain || 0) ? ` · ${formatSigned(p.lastGain)} pts` : ''}`;
}



function renderPowerBattlePodium(game) {
  const ranked = rankPlayersForMode(game.players || {}, 'power-battle').slice(0, 3);
  if (!ranked.length) return '<p class="muted">No final podium yet.</p>';
  return `<div class="pb-podium">
    ${ranked.map((p, i) => `<div class="pb-podium-place place-${i + 1}">
      <div class="pb-podium-medal">${i + 1}</div>
      ${LQ.avatarMarkup(p, 'avatar-img pb-podium-avatar')}
      <strong>${LQ.escapeHtml(p.name || 'Player')}</strong>
      <span>${LQ.formatScore(p.health ?? BATTLE_START_HEALTH)} lives · ${LQ.formatScore(p.damage || 0)} wins</span>
      <small>Best ${formatReactionTime(p.bestReactionMs)}</small>
    </div>`).join('')}
  </div>`;
}

function renderNativePowerBattleBoard(game, players, startingLives, pairs) {
  const active = players.filter(p => Number(p.health ?? startingLives) > 0);
  const eliminated = players.filter(p => Number(p.health ?? startingLives) <= 0);
  const leaders = battleReactionLeaders(game, 5);
  const pairRows = [];
  const seen = new Set();
  active.forEach(player => {
    if (seen.has(player.uid)) return;
    const oppUid = pairs[player.uid];
    const opponent = oppUid ? (game.players || {})[oppUid] : null;
    seen.add(player.uid);
    if (oppUid) seen.add(oppUid);
    pairRows.push(`<div class="pb-host-matchup-row">
      <div>${LQ.avatarMarkup(player, 'avatar-img tiny-avatar-img')}<strong>${LQ.escapeHtml(player.name || 'Player')}</strong></div>
      <span class="pb-host-vs">VS</span>
      <div>${opponent ? LQ.avatarMarkup(opponent, 'avatar-img tiny-avatar-img') : '<span class="pb-bye-star host">★</span>'}<strong>${LQ.escapeHtml(opponent?.name || 'Bye')}</strong></div>
    </div>`);
  });
  return `
    <div class="pb-host-native-board">
      <div class="pb-host-board-header">
        ${LQ.modeLogoMarkup('power-battle', 'mode-logo-chip pb-native-logo')}
        <div>
          <h2>Host Live Matchup Board</h2>
          <p>Round ${Number(game.state?.questionIndex || 0) + 1} · ${active.length} players alive</p>
        </div>
        <div class="pb-host-timer">${Math.max(0, Math.ceil((Number(game.state?.endsAt || Date.now()) - Date.now()) / 1000))}</div>
      </div>
      <div class="pb-host-board-grid">
        <section class="pb-host-panel active-matchups">
          <h3>Active Matchups</h3>
          <div class="pb-host-matchup-list">${pairRows.join('') || '<p class="muted">No active matchups yet.</p>'}</div>
        </section>
        <section class="pb-host-panel remaining-players">
          <h3>Remaining Players</h3>
          <div class="pb-host-player-list">${active.map(p => renderBattlePlayerRow(p, startingLives, pairs, game.players || {})).join('') || '<p class="muted">No players remaining.</p>'}</div>
        </section>
        <section class="pb-host-panel eliminated-players">
          <h3>Eliminated</h3>
          <div class="pb-host-mini-list">${eliminated.map(p => `<span>${LQ.avatarMarkup(p, 'avatar-img tiny-avatar-img')} ${LQ.escapeHtml(p.name || 'Player')}</span>`).join('') || '<span>None yet</span>'}</div>
        </section>
        <section class="pb-host-panel reaction-leaders">
          <h3>Fastest Reactions</h3>
          <div class="pb-host-mini-list">${leaders.map((p, i) => `<span><b>#${i + 1}</b> ${LQ.avatarMarkup(p, 'avatar-img tiny-avatar-img')} ${LQ.escapeHtml(p.name || 'Player')} · ${formatReactionTime(p.bestReactionMs)}</span>`).join('') || '<span>No correct times yet</span>'}</div>
        </section>
      </div>
    </div>`;
}

function renderModeStatus(game) {
  if (!els.modeStatusPanel) return;
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  const players = rankPlayersForMode(game.players || {}, mode.id).slice(0, 8);

  if (mode.id === 'coin-rush') {
    els.modeStatusPanel.innerHTML = `
      <div class="mode-objective"><strong>${LQ.modeLogoMarkup(mode, 'mode-logo-chip mode-logo-inline')}</strong><span>Correct answers open chests: gold, triple gold, steal, raid, or trap.</span></div>
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
    const startingLives = Number(game.settings?.goalLimit || BATTLE_START_HEALTH);
    const pairs = game.question?.battlePairs || {};
    els.modeStatusPanel.innerHTML = renderNativePowerBattleBoard(game, players, startingLives, pairs);
    return;
  }

  const cards = players.slice(0, 4).map((p, i) => `<div class="mode-mini-card">
      <span class="mode-mini-avatar">${LQ.avatarMarkup(p, 'avatar-img')}</span>
      <strong>${LQ.escapeHtml(p.name || 'Player')}</strong>
      <small>#${i + 1} · ${formatModeStat(p, mode.id)}</small>
    </div>`).join('');
  els.modeStatusPanel.innerHTML = `
    <div class="mode-objective"><strong>${LQ.modeLogoMarkup(mode, 'mode-logo-chip mode-logo-inline')}</strong><span>${LQ.escapeHtml(mode.objective)}</span></div>
    <div class="mode-mini-grid">${cards || '<span class="muted">No players yet.</span>'}</div>
  `;
}

function formatModeStat(player, modeId) {
  if (modeId === 'coin-rush') return `${LQ.formatScore(player.coins || 0)} gold`;
  if (modeId === 'cadet-race') return `${LQ.formatScore(player.distance || 0)} ft`;
  if (modeId === 'power-battle') return `${LQ.formatScore(player.health ?? BATTLE_START_HEALTH)} lives`;
  return `${LQ.formatScore(player.score || 0)} pts`;
}

function renderModeRevealBanner(game) {
  if (!els.modeRevealBanner) return;
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  const events = game.reveal?.mode?.events || [];
  if (mode.id === 'power-battle') {
    const leaders = battleReactionLeaders(game, 5);
    const winners = events.filter(e => String(e.type || '').includes('win') || String(e.type || '').includes('bye'));
    const losses = events.filter(e => String(e.type || '').includes('loss'));
    els.modeRevealBanner.innerHTML = `
      <div class="pb-host-results-native">
        <div class="pb-host-results-header">
          ${LQ.modeLogoMarkup(mode, 'mode-logo-chip pb-native-logo')}
          <div>
            <h2>Round Results</h2>
            <p>Matchup outcomes and fastest reactions from this round.</p>
          </div>
        </div>
        <div class="pb-results-columns">
          <section>
            <h3>Winners / Safe</h3>
            ${winners.map(event => `<div class="pb-result-chip good">${LQ.avatarMarkup(event, 'avatar-img tiny-avatar-img')} <b>${LQ.escapeHtml(event.name)}</b><span>${LQ.escapeHtml(event.label)}</span></div>`).join('') || '<p>No winners recorded.</p>'}
          </section>
          <section>
            <h3>Lost Life</h3>
            ${losses.map(event => `<div class="pb-result-chip bad">${LQ.avatarMarkup(event, 'avatar-img tiny-avatar-img')} <b>${LQ.escapeHtml(event.name)}</b><span>${LQ.escapeHtml(event.label)}</span></div>`).join('') || '<p>No lives lost.</p>'}
          </section>
          <section>
            <h3>Fastest Reactions</h3>
            ${leaders.map((player, i) => `<div class="pb-result-chip speed"><b>#${i + 1}</b> ${LQ.avatarMarkup(player, 'avatar-img tiny-avatar-img')} <span>${LQ.escapeHtml(player.name || 'Player')} · ${formatReactionTime(player.bestReactionMs)}</span></div>`).join('') || '<p>No correct times yet.</p>'}
          </section>
        </div>
      </div>
    `;
    return;
  }
  if (!events.length || mode.id === 'classic') {
    els.modeRevealBanner.innerHTML = `<strong>${LQ.modeLogoMarkup(mode, 'mode-logo-chip mode-logo-inline')}</strong><span>${LQ.escapeHtml(mode.scoring)}</span>`;
    return;
  }
  const reactionPodium = mode.id === 'power-battle' ? renderBattleReactionPodium(game) : '';
  els.modeRevealBanner.innerHTML = `
    <strong>${LQ.modeLogoMarkup(mode, 'mode-logo-chip mode-logo-inline')} round events</strong>
    <div class="mode-event-list">
      ${events.map(event => `<span class="mode-event-chip ${LQ.escapeAttr(event.type || '')}">${LQ.avatarMarkup(event, 'avatar-img tiny-avatar-img')} <b>${LQ.escapeHtml(event.name)}</b>: ${LQ.escapeHtml(event.label)}</span>`).join('')}
    </div>
    ${reactionPodium}
  `;
}

function renderFinalModeSummary(game) {
  if (!els.finalModeSummary) return;
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  const ranked = rankPlayersForMode(game.players || {}, mode.id);
  const top = ranked[0];
  if (!top) {
    els.finalModeSummary.innerHTML = `<strong>${LQ.modeLogoMarkup(mode, 'mode-logo-chip mode-logo-inline')}</strong><span>No player results.</span>`;
    return;
  }
  if (mode.id === 'power-battle') {
    const reactionLeaders = battleReactionLeaders(game, 3);
    els.finalModeSummary.innerHTML = `
      <div class="pb-host-final-native">
        ${LQ.modeLogoMarkup(mode, 'mode-logo-chip pb-native-logo')}
        <div class="pb-final-winner">
          ${LQ.avatarMarkup(top, 'avatar-img pb-final-avatar')}
          <div>
            <h2>${LQ.escapeHtml(top.name || 'Player')} wins Power Battle</h2>
            <p>${LQ.formatScore(top.health ?? BATTLE_START_HEALTH)} lives left · ${LQ.formatScore(top.damage || 0)} wins · best ${formatReactionTime(top.bestReactionMs)}</p>
          </div>
        </div>
        ${renderPowerBattlePodium(game)}
        <div class="pb-host-mini-list">${reactionLeaders.map((player, i) => `<span><b>Reaction #${i + 1}</b> ${LQ.escapeHtml(player.name || 'Player')} · ${formatReactionTime(player.bestReactionMs)}</span>`).join('')}</div>
      </div>`;
    return;
  }
  const winLine = mode.id === 'classic'
    ? `${LQ.formatScore(top.score || 0)} points`
    : formatModeStat(top, mode.id);
  const bestLine = mode.id === 'power-battle' ? ` Fastest reaction: ${bestReactionLine(game)}.` : '';
  els.finalModeSummary.innerHTML = `<strong>${LQ.modeLogoMarkup(mode, 'mode-logo-chip mode-logo-inline')}</strong><span>Winner: ${LQ.escapeHtml(top.name || 'Player')} with ${winLine}.${bestLine}</span>`;
}


function isPowerBattleAutoDone(game) {
  const modeId = game?.settings?.gameMode || 'classic';
  if (modeId !== 'power-battle') return false;
  const active = Object.values(game?.players || {}).filter(player => player && player.name && Number(player.health ?? BATTLE_START_HEALTH) > 0);
  const questionIndex = Number(game?.state?.questionIndex || 0);
  const totalQuestions = Number(game?.settings?.questionCount || game?.questions?.length || 0);
  return active.length <= 1 || (totalQuestions && questionIndex >= totalQuestions - 1);
}

function schedulePowerBattleAutoAdvance(game) {
  if (!game || game.settings?.gameMode !== 'power-battle') return;
  if (game.state?.phase !== 'reveal') return;
  if (powerBattleAutoAdvanceId) return;
  const revealedAt = Number(game.reveal?.revealedAt || Date.now());
  const delay = Math.max(600, POWER_BATTLE_RESULT_MS - (Date.now() - revealedAt));
  powerBattleAutoAdvanceId = setTimeout(async () => {
    powerBattleAutoAdvanceId = null;
    if (!livePin || !liveGame || liveGame.settings?.gameMode !== 'power-battle' || liveGame.state?.phase !== 'reveal') return;
    if (isPowerBattleAutoDone(liveGame)) {
      await endGame();
      return;
    }
    await nextQuestion();
  }, delay);
}

function maybeResolvePowerBattleEarly(game) {
  if (!livePin || !game || game.settings?.gameMode !== 'power-battle') return;
  if (game.state?.phase !== 'question') return;
  if (powerBattleResolving) return;
  const now = Date.now();
  const startedAt = Number(game.state?.startedAt || now);
  if (now - startedAt < POWER_BATTLE_INTRO_MS) return;
  const activeUids = Object.entries(game.players || {})
    .filter(([playerUid, player]) => player && player.name && Number(player.health ?? BATTLE_START_HEALTH) > 0)
    .map(([playerUid]) => playerUid);
  if (!activeUids.length) return;
  const answers = game.answers?.[Number(game.state?.questionIndex || 0)] || {};
  const questionKey = game.question?.key || '';
  const allAnswered = activeUids.every(playerUid => hasValidAnswer(answers[playerUid], questionKey));
  if (!allAnswered) return;
  powerBattleResolving = true;
  revealQuestion().finally(() => {
    powerBattleResolving = false;
  });
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
    lastReactionMs: 0,
    bestReactionMs: Number(player.bestReactionMs || 0) || null,
    lastBattleOpponent: '',
    lastBattleOpponentUid: '',
    lastBattleOpponentReactionMs: 0,
    lastBattleResult: '',
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
  const startingLives = Number(liveGame?.settings?.goalLimit || BATTLE_START_HEALTH);
  Object.keys(outcomes).forEach(playerUid => {
    const result = roundResults[playerUid] || {};
    const player = players[playerUid] || {};
    outcomes[playerUid].health = LQ.clamp(Number(player.health ?? startingLives), 0, startingLives);
    outcomes[playerUid].shield = 0;
    outcomes[playerUid].power = 0;
    outcomes[playerUid].damage = Number(player.damage || 0);
    outcomes[playerUid].score = outcomes[playerUid].health;
    outcomes[playerUid].lastReactionMs = result.answered ? Math.round(Number(result.elapsed || 0)) : 0;
    const existingBest = Number(player.bestReactionMs || 0);
    outcomes[playerUid].bestReactionMs = existingBest || null;
    if (result.correct && result.answered) {
      const elapsed = Math.round(Number(result.elapsed || 0));
      outcomes[playerUid].bestReactionMs = existingBest ? Math.min(existingBest, elapsed) : elapsed;
    }
    outcomes[playerUid].label = 'Waiting for matchup result.';
  });

  const pairMap = liveGame?.question?.battlePairs || buildBattlePairs(players, questionIndex);
  const handled = new Set();
  const fastestCorrect = Object.values(roundResults)
    .filter(result => result && result.correct && result.answered)
    .sort((a, b) => Number(a.elapsed || 0) - Number(b.elapsed || 0))[0];

  Object.keys(outcomes).forEach(playerUid => {
    if (handled.has(playerUid)) return;
    handled.add(playerUid);
    const opponentUid = pairMap[playerUid] || '';
    const result = roundResults[playerUid];
    const player = result?.player || players[playerUid] || {};

    if (!opponentUid || !outcomes[opponentUid]) {
      outcomes[playerUid].label = result?.correct
        ? `Bye round: correct in ${formatReactionTime(result.elapsed)}. No life lost.`
        : 'Bye round: no opponent this question. No life lost.';
      outcomes[playerUid].lastBattleOpponent = 'Bye';
      outcomes[playerUid].lastBattleOpponentUid = '';
      outcomes[playerUid].lastBattleOpponentReactionMs = 0;
      outcomes[playerUid].lastBattleResult = 'bye';
      events.push(eventFor(playerUid, player, outcomes[playerUid].label, 0, 'battle-bye'));
      return;
    }

    handled.add(opponentUid);
    const opponentResult = roundResults[opponentUid] || { uid: opponentUid, player: players[opponentUid] || {}, answered: false, correct: false, elapsed: Number.POSITIVE_INFINITY };
    const opponent = opponentResult.player || players[opponentUid] || {};
    const aCorrect = Boolean(result?.correct);
    const bCorrect = Boolean(opponentResult?.correct);
    const aAnswered = Boolean(result?.answered);
    const bAnswered = Boolean(opponentResult?.answered);
    outcomes[playerUid].lastBattleOpponent = opponent.name || 'Opponent';
    outcomes[playerUid].lastBattleOpponentUid = opponentUid;
    outcomes[playerUid].lastBattleOpponentReactionMs = Math.round(Number(opponentResult?.elapsed || 0));
    outcomes[opponentUid].lastBattleOpponent = player.name || 'Opponent';
    outcomes[opponentUid].lastBattleOpponentUid = playerUid;
    outcomes[opponentUid].lastBattleOpponentReactionMs = Math.round(Number(result?.elapsed || 0));
    let winnerUid = '';
    let loserUid = '';
    let reason = '';

    if (aCorrect && bCorrect) {
      const aElapsed = Number(result.elapsed || 0);
      const bElapsed = Number(opponentResult.elapsed || 0);
      if (aElapsed === bElapsed) {
        winnerUid = seededNumber(`${questionIndex}-${playerUid}-${opponentUid}-tie`) < 0.5 ? playerUid : opponentUid;
      } else {
        winnerUid = aElapsed < bElapsed ? playerUid : opponentUid;
      }
      loserUid = winnerUid === playerUid ? opponentUid : playerUid;
      const winnerResult = winnerUid === playerUid ? result : opponentResult;
      const loserResult = winnerUid === playerUid ? opponentResult : result;
      const marginMs = Math.abs(Number(result.elapsed || 0) - Number(opponentResult.elapsed || 0));
      reason = `${formatReactionTime(winnerResult.elapsed)} reaction time, ${formatReactionTime(marginMs)} faster`;
      outcomes[winnerUid].lastReactionMs = Math.round(Number(winnerResult.elapsed || 0));
      outcomes[loserUid].lastReactionMs = Math.round(Number(loserResult.elapsed || 0));
    } else if (aCorrect && !bCorrect) {
      winnerUid = playerUid;
      loserUid = opponentUid;
      reason = bAnswered ? `opponent answered wrong; ${formatReactionTime(result.elapsed)} reaction time` : `opponent did not answer; ${formatReactionTime(result.elapsed)} reaction time`;
    } else if (!aCorrect && bCorrect) {
      winnerUid = opponentUid;
      loserUid = playerUid;
      reason = aAnswered ? `opponent answered wrong; ${formatReactionTime(opponentResult.elapsed)} reaction time` : `opponent did not answer; ${formatReactionTime(opponentResult.elapsed)} reaction time`;
    } else {
      applyLifeLoss(outcomes, playerUid, 1);
      applyLifeLoss(outcomes, opponentUid, 1);
      outcomes[playerUid].lastBattleResult = 'both-wrong';
      outcomes[opponentUid].lastBattleResult = 'both-wrong';
      outcomes[playerUid].label = aAnswered ? 'Wrong answer: -1 life.' : 'No answer: -1 life.';
      outcomes[opponentUid].label = bAnswered ? 'Wrong answer: -1 life.' : 'No answer: -1 life.';
      events.push(eventFor(playerUid, player, outcomes[playerUid].label, -1, 'battle-loss'));
      events.push(eventFor(opponentUid, opponent, outcomes[opponentUid].label, -1, 'battle-loss'));
      return;
    }

    const loser = loserUid === playerUid ? player : opponent;
    const winner = winnerUid === playerUid ? player : opponent;
    applyLifeLoss(outcomes, loserUid, 1);
    outcomes[winnerUid].damage += 1;
    outcomes[winnerUid].lastDamage += 1;
    outcomes[winnerUid].lastBattleResult = 'win';
    outcomes[loserUid].lastBattleResult = 'loss';
    outcomes[winnerUid].label = `Won matchup vs ${loser.name || 'opponent'} — kept all lives (${reason}).`;
    outcomes[loserUid].label = `Lost matchup vs ${winner.name || 'opponent'} — -1 life (${reason}).`;
    events.push(eventFor(winnerUid, winner, outcomes[winnerUid].label, 1, 'battle-win'));
    events.push(eventFor(loserUid, loser, outcomes[loserUid].label, -1, 'battle-loss'));
  });

  if (fastestCorrect) {
    const fastestPlayer = fastestCorrect.player || players[fastestCorrect.uid] || {};
    events.unshift(eventFor(fastestCorrect.uid, fastestPlayer, `Fastest reaction: ${formatReactionTime(fastestCorrect.elapsed)}`, 0, 'battle-fastest'));
  }

  Object.entries(outcomes).forEach(([playerUid, outcome]) => {
    const oldScore = Number(players[playerUid]?.score ?? Number(players[playerUid]?.health ?? startingLives));
    outcome.health = LQ.clamp(Math.round(outcome.health), 0, startingLives);
    outcome.damage = Math.round(outcome.damage);
    outcome.power = 0;
    outcome.shield = 0;
    outcome.score = outcome.health;
    outcome.lastGain = outcome.score - oldScore;
    if (outcome.health <= 0 && !String(outcome.label || '').includes('Eliminated')) {
      outcome.label = `${outcome.label} Eliminated.`;
    }
  });
  return { players: outcomes, events };
}

function applyLifeLoss(outcomes, uid, lives) {
  if (!uid || !outcomes[uid]) return;
  const loss = Math.min(Number(outcomes[uid].health || 0), Number(lives || 1));
  outcomes[uid].health -= loss;
  outcomes[uid].lastHealthChange -= loss;
}

function buildBattlePairs(players, questionIndex) {
  const candidates = Object.keys(players || {})
    .filter(uid => players[uid]?.name && (Number(players[uid]?.health ?? BATTLE_START_HEALTH) > 0 || Number(questionIndex || 0) === 0))
    .sort((a, b) => seededNumber(`${questionIndex}-${a}`) - seededNumber(`${questionIndex}-${b}`));
  const pairs = {};
  for (let i = 0; i < candidates.length; i += 2) {
    const a = candidates[i];
    const b = candidates[i + 1] || '';
    pairs[a] = b;
    if (b) pairs[b] = a;
  }
  return pairs;
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


function battleCountdownAsset(seconds) {
  if (Number(seconds) === 1) return BATTLE_IMAGES.countdown1;
  if (Number(seconds) === 2) return BATTLE_IMAGES.countdown2;
  return BATTLE_IMAGES.countdown3;
}

function battleHealthAsset(currentLives) {
  const lives = LQ.clamp(Math.round(Number(currentLives || BATTLE_START_HEALTH)), 1, BATTLE_START_HEALTH);
  if (lives <= 1) return BATTLE_IMAGES.health1;
  if (lives === 2) return BATTLE_IMAGES.health2;
  if (lives === 3) return BATTLE_IMAGES.health3;
  if (lives === 4) return BATTLE_IMAGES.health4;
  return BATTLE_IMAGES.health5;
}

function renderBattlePlayerRow(player, startingLives, pairs = {}, allPlayers = {}) {
  const health = LQ.clamp(Number(player.health ?? startingLives), 0, startingLives);
  const opponentName = pairs[player.uid] && allPlayers[pairs[player.uid]] ? allPlayers[pairs[player.uid]].name : 'Bye';
  const isOut = health <= 0;
  return `<div class="pb-host-player ${isOut ? 'eliminated' : ''}">
    <div class="pb-host-avatar">${LQ.avatarMarkup(player, 'avatar-img tiny-avatar-img')}</div>
    <div class="pb-host-info">
      <strong>${LQ.escapeHtml(player.name || 'Player')}</strong>
      <span>vs ${LQ.escapeHtml(opponentName || 'Bye')}</span>
      <img class="pb-host-health" src="${battleHealthAsset(Math.max(1, health || 1))}" alt="${LQ.escapeAttr(`${health} lives`)}" loading="lazy" decoding="async" />
    </div>
    <div class="pb-host-stats">
      <b>${LQ.formatScore(health)}</b>
      <span>lives</span>
      <small>${LQ.formatScore(player.damage || 0)} wins · ${formatReactionTime(player.bestReactionMs)}</small>
    </div>
  </div>`;
}

function renderBattleReactionPodium(game) {
  const leaders = battleReactionLeaders(game, 5);
  if (!leaders.length) return '<div class="reaction-podium"><strong>Best reaction times</strong><span>No correct reaction times yet.</span></div>';
  return `<div class="reaction-podium"><strong>Best reaction times</strong>${leaders.map((player, i) => `<span><b>#${i + 1}</b> ${LQ.avatarMarkup(player, 'avatar-img tiny-avatar-img')} ${LQ.escapeHtml(player.name || 'Player')} — ${formatReactionTime(player.bestReactionMs)}</span>`).join('')}</div>`;
}

function battleReactionLeaders(game, limit = 5) {
  return Object.entries(game?.players || {})
    .map(([uid, player]) => ({ uid, ...player }))
    .filter(player => Number(player.bestReactionMs || 0) > 0)
    .sort(reactionSort)
    .slice(0, limit);
}

function bestReactionLine(game) {
  const leader = battleReactionLeaders(game, 1)[0];
  return leader ? `${leader.name || 'Player'} • ${formatReactionTime(leader.bestReactionMs)}` : 'No correct times yet';
}

function formatReactionTime(ms) {
  const value = Number(ms || 0);
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 60000) return `${Math.round(value / 1000)}s`;
  return `${(value / 1000).toFixed(value < 10000 ? 2 : 1)}s`;
}

function reactionSort(a, b) {
  const av = Number(a.bestReactionMs || 0);
  const bv = Number(b.bestReactionMs || 0);
  if (av && bv) return av - bv;
  if (av && !bv) return -1;
  if (!av && bv) return 1;
  return 0;
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
    return players.sort((a, b) => (Number(b.health ?? BATTLE_START_HEALTH) - Number(a.health ?? BATTLE_START_HEALTH)) || (Number(b.damage || 0) - Number(a.damage || 0)) || reactionSort(a, b) || (Number(b.correct || 0) - Number(a.correct || 0)) || nameSort(a, b));
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
  if (!gamePin || endingInProgress) return;
  endingInProgress = true;
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
