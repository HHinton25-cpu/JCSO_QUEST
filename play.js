import { firebaseConfig, GAME_ROOT } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getDatabase, ref, set, update, get, onValue, off, onDisconnect, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

const LQ = window.LiveQuiz;
const $ = LQ.$;

let db = null;
let uid = null;
let firebaseReady = false;
let joinedPin = '';
let playerName = '';
let selectedAvatarId = localStorage.getItem('docjtLiveAvatar') || 'patrol_pals';
let liveGame = null;
let unsubscribeGame = null;
let timerId = null;
let lastQuestionKey = '';
let localAnswered = false;
let lastPhase = '';
let lastRevealAudioKey = '';
let lastGainAnimationKey = '';
let lastEndedAudioKey = '';
let localChestQuestionKey = '';
let localChestChoiceIndex = -1;
let rewardSubmitInProgress = false;

const RACE_FINISH_DISTANCE = 120;
const BATTLE_START_HEALTH = 100;
const SELF_PACED_MODES = new Set(['coin-rush', 'cadet-race', 'power-battle']);
const GOLD_RUSH_IMAGES = {
  basic: 'gold-rush-chest-basic-md.png?v=20260630-blendfix-v5',
  rare: 'gold-rush-chest-rare-md.png?v=20260630-blendfix-v5',
  open: 'gold-rush-chest-open-md.png?v=20260630-blendfix-v5',
  coins: 'gold-rush-coin-pile-md.png?v=20260630-blendfix-v5',
  gems: 'gold-rush-gem-pile-md.png?v=20260630-blendfix-v5',
  vault: 'gold-rush-vault-open-md.png?v=20260630-blendfix-v5'
};

const els = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheElements();
  wireEvents();
  const pin = LQ.getParam('pin');
  if (pin) els.pinInput.value = pin.replace(/\D/g, '').slice(0, 6);
  const savedName = localStorage.getItem('docjtLiveName');
  if (savedName) els.nameInput.value = savedName;
  renderAvatarSelector();

  try {
    await initFirebase();
  } catch (err) {
    console.error(err);
    els.firebaseWarning.classList.remove('hidden');
    LQ.setStatus(els.joinStatus, 'The live game connection is not ready yet.', 'error');
  }
}

function cacheElements() {
  [
    'firebase-warning', 'pin-input', 'name-input', 'avatar-select', 'join-game', 'join-status', 'lobby-name',
    'lobby-avatar', 'lobby-mode', 'lobby-pin', 'player-round', 'player-score', 'player-mode', 'player-coins', 'player-timer', 'player-category',
    'player-question', 'player-answers', 'chest-panel', 'next-self-question', 'answer-status', 'answered-score', 'player-result-card',
    'player-result-icon', 'player-result-label', 'player-gain', 'player-correct-answer', 'player-mode-event',
    'player-explanation', 'player-total-score', 'player-rank', 'final-player-title', 'player-final-list'
  ].forEach(id => {
    els[toCamel(id)] = $(id);
  });
}

function wireEvents() {
  els.joinGame.addEventListener('click', joinGame);
  [els.pinInput, els.nameInput].forEach(input => {
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') joinGame();
    });
  });
  els.pinInput.addEventListener('input', () => {
    els.pinInput.value = els.pinInput.value.replace(/\D/g, '').slice(0, 6);
  });
  if (els.nextSelfQuestion) els.nextSelfQuestion.addEventListener('click', nextSelfPacedQuestion);
}

function renderAvatarSelector() {
  if (!els.avatarSelect) return;
  if (!LQ.avatarOptions.some(avatar => avatar.id === selectedAvatarId)) selectedAvatarId = LQ.avatarOptions[0].id;
  els.avatarSelect.innerHTML = LQ.avatarOptions.map(avatar => `
    <button type="button" class="avatar-option ${avatar.id === selectedAvatarId ? 'selected' : ''}" data-avatar-id="${LQ.escapeAttr(avatar.id)}" aria-label="${LQ.escapeAttr(avatar.name)}">
      <span class="avatar-pick-art">${LQ.avatarMarkup(avatar, 'avatar-img')}</span>
      <small>${LQ.escapeHtml(avatar.name)}</small>
      <em>${LQ.escapeHtml(avatar.role || avatar.rarity || 'Character')}</em>
    </button>
  `).join('');
  els.avatarSelect.querySelectorAll('[data-avatar-id]').forEach(button => {
    button.addEventListener('click', () => {
      selectedAvatarId = button.dataset.avatarId;
      localStorage.setItem('docjtLiveAvatar', selectedAvatarId);
      renderAvatarSelector();
    });
  });
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
  LQ.setStatus(els.joinStatus, 'Ready to join.', 'ok');
}

async function joinGame() {
  LQ.Sounds.unlock();
  if (!firebaseReady) return;
  const pin = els.pinInput.value.trim();
  const name = els.nameInput.value.trim().slice(0, 24);
  if (!/^\d{6}$/.test(pin)) {
    LQ.setStatus(els.joinStatus, 'Enter the 6-digit game PIN.', 'error');
    return;
  }
  if (!name) {
    LQ.setStatus(els.joinStatus, 'Enter your name.', 'error');
    return;
  }

  LQ.setStatus(els.joinStatus, 'Joining…');
  const gameSnap = await get(ref(db, `${GAME_ROOT}/${pin}/state`));
  if (!gameSnap.exists()) {
    LQ.setStatus(els.joinStatus, 'No active game found with that PIN.', 'error');
    return;
  }

  joinedPin = pin;
  playerName = name;
  const avatar = LQ.getAvatar(selectedAvatarId);
  localStorage.setItem('docjtLiveName', playerName);
  localStorage.setItem('docjtLiveAvatar', avatar.id);
  const playerRef = ref(db, `${GAME_ROOT}/${joinedPin}/players/${uid}`);
  await set(playerRef, {
    name: playerName,
    avatarId: avatar.id,
    avatarIcon: '',
    avatarAsset: avatar.asset || '',
    avatarName: avatar.name,
    avatarRole: avatar.role || '',
    score: 0,
    coins: 0,
    distance: 0,
    power: 0,
    damage: 0,
    shield: 0,
    health: BATTLE_START_HEALTH,
    correct: 0,
    answered: 0,
    played: 0,
    streak: 0,
    lastGain: 0,
    lastCoins: 0,
    lastDistance: 0,
    lastPower: 0,
    lastDamage: 0,
    lastHealthChange: 0,
    lastShield: 0,
    lastModeLabel: '',
    lastCorrect: false,
    lastChoiceIndex: -1,
    lastCorrectAnswer: '',
    lastExplanation: '',
    selfQuestionIndex: 0,
    resultReady: false,
    pendingRewardRequest: null,
    online: true,
    joinedAt: serverTimestamp(),
    lastSeen: serverTimestamp()
  });
  onDisconnect(ref(db, `${GAME_ROOT}/${joinedPin}/players/${uid}/online`)).set(false);
  onDisconnect(ref(db, `${GAME_ROOT}/${joinedPin}/players/${uid}/lastSeen`)).set(serverTimestamp());

  startGameListener();
}

function startGameListener() {
  if (unsubscribeGame) unsubscribeGame();
  const gameRef = ref(db, `${GAME_ROOT}/${joinedPin}`);
  const cb = snapshot => {
    liveGame = snapshot.val();
    if (!liveGame) {
      cleanupTimer();
      LQ.setStatus(els.joinStatus, 'The game was closed.', 'error');
      LQ.showScreen('join');
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
  const qKey = game.question?.key || '';
  if (qKey && qKey !== lastQuestionKey) {
    lastQuestionKey = qKey;
    localAnswered = Boolean(getMyAnswer(game));
  }
  if (phase === 'lobby') renderLobby(game);
  if (phase === 'question') renderQuestion(game);
  if (phase === 'play') renderSelfPacedPlay(game);
  if (phase === 'reveal') renderReveal(game);
  if (phase === 'ended') renderEnded(game);
}

function renderLobby(game) {
  document.body.classList.remove('gold-rush-play');
  cleanupTimer();
  const me = game.players?.[uid] || {};
  const avatar = LQ.getAvatar(me.avatarId || selectedAvatarId);
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  els.lobbyName.textContent = playerName || me.name || 'Player';
  if (els.lobbyAvatar) els.lobbyAvatar.innerHTML = LQ.avatarMarkup(me.avatarId ? me : avatar, 'avatar-img large-avatar-img');
  if (els.lobbyMode) els.lobbyMode.innerHTML = `${LQ.modeLogoMarkup(mode, 'mode-logo-chip mode-logo-inline')} <span>${LQ.escapeHtml(mode.objective)}</span>`;
  els.lobbyPin.textContent = game.state?.pin || joinedPin;
  LQ.showScreen('lobby');
}

function renderQuestion(game) {
  document.body.classList.remove('gold-rush-play');
  const q = game.question || {};
  const state = game.state || {};
  const me = game.players?.[uid] || {};
  const answer = getMyAnswer(game);
  const answered = localAnswered || Boolean(answer);
  const eligible = isEligibleForCurrentQuestion(game);

  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  els.playerRound.textContent = `Question ${Number(state.questionIndex || 0) + 1} / ${Number(state.questionCount || 0)}`;
  els.playerScore.textContent = formatMainPlayerStat(me, mode.id);
  if (els.playerMode) els.playerMode.innerHTML = LQ.modeLogoMarkup(mode, 'mode-logo-chip player-mode-logo');
  if (els.playerCoins) els.playerCoins.textContent = formatPlayerModeStat(me, mode.id);
  els.playerCategory.textContent = q.category || 'Category';
  els.playerQuestion.textContent = q.text || 'Pick your answer';
  els.answeredScore.textContent = `${formatMainPlayerStat(me, mode.id)} · ${formatPlayerModeStat(me, mode.id)}`;

  if (!eligible) {
    LQ.setStatus(els.answerStatus, 'You joined during this question. You will be able to answer the next one.', '');
    LQ.showScreen('answered');
    cleanupTimer();
    return;
  }

  if (answered) {
    LQ.showScreen('answered');
    cleanupTimer();
    return;
  }

  els.playerAnswers.innerHTML = (q.choices || []).map((choice, i) => `
    <button type="button" class="answer-btn ${LQ.answerStyles[i % LQ.answerStyles.length]}" data-choice-index="${i}">
      <span class="shape">${LQ.answerShapes[i % LQ.answerShapes.length]}</span>
      <span>${LQ.escapeHtml(choice)}</span>
    </button>
  `).join('');
  document.querySelectorAll('[data-choice-index]').forEach(button => {
    button.addEventListener('click', () => submitAnswer(Number(button.dataset.choiceIndex)));
  });
  LQ.setStatus(els.answerStatus, 'Choose an answer before time runs out.');
  LQ.showScreen('question');
  startTimer(Number(state.endsAt || Date.now()));
}

function startTimer(endsAt) {
  cleanupTimer();
  const tick = () => {
    const remainingMs = Math.max(0, endsAt - Date.now());
    const seconds = Math.ceil(remainingMs / 1000);
    els.playerTimer.textContent = seconds;
    LQ.Sounds.countdownTick(seconds);
    if (remainingMs <= 0) {
      cleanupTimer();
      localAnswered = true;
      LQ.showScreen('answered');
    }
  };
  tick();
  timerId = setInterval(tick, 200);
}

function cleanupTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}

async function submitAnswer(choiceIndex) {
  if (liveGame?.state?.phase === 'play') {
    await submitSelfPacedAnswer(choiceIndex);
    return;
  }
  if (!joinedPin || !liveGame || localAnswered) return;
  const index = Number(liveGame.state?.questionIndex ?? -1);
  if (index < 0 || liveGame.state?.phase !== 'question') return;
  if (!isEligibleForCurrentQuestion(liveGame)) {
    localAnswered = true;
    LQ.showScreen('answered');
    return;
  }

  localAnswered = true;
  LQ.Sounds.answerSent();
  document.querySelectorAll('[data-choice-index]').forEach(btn => btn.disabled = true);
  LQ.setStatus(els.answerStatus, 'Answer sent!', 'ok');
  await set(ref(db, `${GAME_ROOT}/${joinedPin}/answers/${index}/${uid}`), {
    choiceIndex,
    answeredAt: Date.now(),
    questionKey: liveGame.question?.key || ''
  });
  LQ.showScreen('answered');
}

function isEligibleForCurrentQuestion(game) {
  const eligibleMap = game?.question?.eligiblePlayers;
  if (!eligibleMap) return true;
  return Boolean(eligibleMap[uid]);
}

function getMyAnswer(game) {
  const index = Number(game.state?.questionIndex ?? -1);
  if (index < 0) return null;
  return game.answers?.[index]?.[uid] || null;
}

function renderSelfPacedPlay(game) {
  cleanupTimer();
  const mode = LQ.getGameMode(game.settings?.gameMode || 'coin-rush');
  document.body.classList.toggle('gold-rush-play', mode.id === 'coin-rush');
  const me = game.players?.[uid] || {};
  const questionBank = game.questionBank || [];
  if (!questionBank.length) {
    LQ.setStatus(els.answerStatus, 'The host has not loaded questions for this game.', 'error');
    LQ.showScreen('question');
    return;
  }

  const qIndex = Number(me.selfQuestionIndex || 0) % questionBank.length;
  const q = questionBank[qIndex];
  const questionKey = `${qIndex}_${q.id || q.question}`;
  const goal = Number(game.state?.goalLimit || game.settings?.goalLimit || (mode.id === 'coin-rush' ? 10000 : 500));

  els.playerRound.innerHTML = `${LQ.modeLogoMarkup(mode, 'mode-logo-chip player-round-logo')} <span>Question ${Number(me.played || 0) + 1}</span>`;
  els.playerScore.textContent = formatMainPlayerStat(me, mode.id);
  if (els.playerMode) els.playerMode.innerHTML = LQ.modeLogoMarkup(mode, 'mode-logo-chip player-mode-logo');
  if (els.playerCoins) els.playerCoins.textContent = mode.id === 'coin-rush' ? `Vault ${LQ.formatScore(me.coins || 0)} gold • Goal ${LQ.formatScore(goal)}` : `${formatPlayerModeStat(me, mode.id)} · Goal ${LQ.formatScore(goal)} ${objectiveUnit(mode.id)}`;
  startSelfPacedClock(game);
  els.playerCategory.textContent = q.category || 'Category';
  els.playerQuestion.textContent = q.question || 'Pick your answer';
  els.playerAnswers.innerHTML = '';
  els.chestPanel?.classList.add('hidden');
  if (els.nextSelfQuestion) els.nextSelfQuestion.classList.add('hidden');

  if (me.pendingRewardRequest) {
    renderOpeningReward(mode.id);
    LQ.showScreen('question');
    return;
  }

  if (me.resultReady) {
    renderSelfPacedResult(me, mode.id);
    LQ.showScreen('question');
    return;
  }

  if (localChestQuestionKey === questionKey && localChestChoiceIndex >= 0) {
    renderChestChoices(mode.id, qIndex, localChestChoiceIndex);
    LQ.showScreen('question');
    return;
  }

  els.playerAnswers.innerHTML = (q.choices || []).map((choice, i) => `
    <button type="button" class="answer-btn ${LQ.answerStyles[i % LQ.answerStyles.length]}" data-choice-index="${i}">
      <span class="shape">${LQ.answerShapes[i % LQ.answerShapes.length]}</span>
      <span>${LQ.escapeHtml(choice)}</span>
    </button>
  `).join('');
  document.querySelectorAll('[data-choice-index]').forEach(button => {
    button.addEventListener('click', () => submitSelfPacedAnswer(Number(button.dataset.choiceIndex)));
  });
  LQ.setStatus(els.answerStatus, 'Answer correctly to unlock three mystery rewards. No question timer.', '');
  LQ.showScreen('question');
}

function timeLeftLabel(game) {
  const endsAt = Number(game?.state?.endsAt || 0);
  if (!endsAt) return '∞';
  const ms = Math.max(0, endsAt - Date.now());
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function startSelfPacedClock(game) {
  cleanupTimer();
  const tick = () => {
    const current = liveGame || game;
    if (!current || current.state?.phase !== 'play') {
      cleanupTimer();
      return;
    }
    if (els.playerTimer) els.playerTimer.textContent = timeLeftLabel(current);
    const endsAt = Number(current.state?.endsAt || 0);
    if (endsAt && Date.now() >= endsAt) {
      if (els.playerTimer) els.playerTimer.textContent = '0:00';
      LQ.setStatus(els.answerStatus, 'Time is up. Waiting for the final leaderboard…', '');
    }
  };
  tick();
  const endsAt = Number((liveGame || game)?.state?.endsAt || 0);
  if (endsAt) timerId = setInterval(tick, 1000);
}

function objectiveUnit(modeId) {
  if (modeId === 'coin-rush') return 'gold';
  if (modeId === 'cadet-race') return 'ft';
  if (modeId === 'power-battle') return 'power';
  return 'points';
}

async function submitSelfPacedAnswer(choiceIndex) {
  if (!joinedPin || !liveGame || rewardSubmitInProgress) return;
  const game = liveGame;
  if (game.state?.phase !== 'play') return;
  const me = game.players?.[uid] || {};
  if (me.pendingRewardRequest || me.resultReady) return;
  const questionBank = game.questionBank || [];
  if (!questionBank.length) return;
  const qIndex = Number(me.selfQuestionIndex || 0) % questionBank.length;
  const q = questionBank[qIndex];
  const questionKey = `${qIndex}_${q.id || q.question}`;
  const correct = Number(choiceIndex) === Number(q.answer || 0);
  document.querySelectorAll('[data-choice-index]').forEach(btn => btn.disabled = true);
  LQ.Sounds.answerSent();

  if (correct && SELF_PACED_MODES.has(game.settings?.gameMode || 'coin-rush')) {
    localChestQuestionKey = questionKey;
    localChestChoiceIndex = choiceIndex;
    renderChestChoices(game.settings?.gameMode || 'coin-rush', qIndex, choiceIndex);
    LQ.setStatus(els.answerStatus, 'Correct — pick one reward chest.', 'ok');
    return;
  }

  await update(ref(db, `${GAME_ROOT}/${joinedPin}/players/${uid}`), {
    answered: Number(me.answered || 0) + 1,
    played: Number(me.played || 0) + 1,
    streak: 0,
    resultReady: true,
    lastCorrect: false,
    lastChoiceIndex: choiceIndex,
    lastGain: 0,
    lastCoins: 0,
    lastDistance: 0,
    lastPower: 0,
    lastDamage: 0,
    lastHealthChange: 0,
    lastShield: 0,
    lastModeLabel: 'Incorrect — no reward chest this question.',
    lastCorrectAnswer: (q.choices || [])[Number(q.answer || 0)] || '',
    lastExplanation: q.explanation || '',
    lastSeen: serverTimestamp()
  });
}

function renderChestChoices(modeId, questionIndex, choiceIndex) {
  if (!els.chestPanel) return;
  els.playerAnswers.innerHTML = '';
  els.chestPanel.classList.remove('hidden');
  const title = modeId === 'cadet-race' ? 'Choose a route card' : modeId === 'power-battle' ? 'Choose a tactical crate' : 'Choose a Gold Rush chest';
  const subtitle = modeId === 'coin-rush'
    ? 'Pick one chest. Rewards can add gold, triple your reward, steal a percentage from another player, raid the room, or cost a percentage of your vault.'
    : modeId === 'cadet-race'
      ? 'Pick one of the three route cards. It can move you forward, boost you, swap positions, or slow you down.'
      : 'Pick one of the three tactical crates. It can add power, shield you, heal you, steal power, or overload.';
  els.chestPanel.innerHTML = `
    <div class="chest-intro ${modeId === 'coin-rush' ? 'gold-rush-chest-intro' : ''}">
      <p class="eyebrow">Correct answer</p>
      ${modeId === 'coin-rush' ? LQ.modeLogoMarkup('coin-rush', 'mode-logo-chip chest-mode-logo') : ''}
      <h2>${LQ.escapeHtml(title)}</h2>
      <p>${LQ.escapeHtml(subtitle)}</p>
    </div>
    <div class="chest-grid ${modeId === 'coin-rush' ? 'gold-chest-grid' : ''}">
      ${[0, 1, 2].map(i => renderRewardChoiceButton(modeId, questionIndex, choiceIndex, i)).join('')}
    </div>
  `;
  els.chestPanel.querySelectorAll('[data-chest-index]').forEach(button => {
    button.addEventListener('click', () => chooseRewardChest(questionIndex, choiceIndex, Number(button.dataset.chestIndex)));
  });
}

function renderRewardChoiceButton(modeId, questionIndex, choiceIndex, chestIndex) {
  if (modeId === 'coin-rush') {
    const image = coinRushChestImage(questionIndex, choiceIndex, chestIndex);
    return `
      <button type="button" class="chest-choice gold-chest-choice" data-chest-index="${chestIndex}" aria-label="Open mystery chest ${chestIndex + 1}">
        <span class="chest-glow" aria-hidden="true"></span>
        ${assetImage(image, `Mystery chest ${chestIndex + 1}`, 'chest-choice-img')}
        <strong>Chest ${chestIndex + 1}</strong>
        <small>Tap to open</small>
      </button>
    `;
  }
  const label = modeId === 'cadet-race' ? 'Route' : 'Crate';
  const icon = modeId === 'cadet-race' ? '🏁' : '🛡️';
  return `<button type="button" class="chest-choice" data-chest-index="${chestIndex}"><span>${icon}</span><strong>${label} ${chestIndex + 1}</strong><small>Mystery reward</small></button>`;
}

function coinRushChestImage(questionIndex, choiceIndex, chestIndex) {
  const variants = [GOLD_RUSH_IMAGES.basic, GOLD_RUSH_IMAGES.rare, GOLD_RUSH_IMAGES.basic];
  const offset = Math.floor(seededUnit(`${questionIndex}:${choiceIndex}:gold-chests`) * variants.length) % variants.length;
  return variants[(chestIndex + offset) % variants.length];
}

function assetImage(src, alt, className) {
  return `<img class="${LQ.escapeAttr(className || 'asset-img')}" src="${LQ.escapeAttr(src)}?v=20260630-blendfix-v5" alt="${LQ.escapeAttr(alt || '')}" loading="lazy" decoding="async" />`;
}

function seededUnit(seed) {
  let hash = 2166136261;
  const text = String(seed || 'seed');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}


async function chooseRewardChest(questionIndex, choiceIndex, chestIndex) {
  if (!joinedPin || !liveGame || rewardSubmitInProgress) return;
  rewardSubmitInProgress = true;
  const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  localChestQuestionKey = '';
  localChestChoiceIndex = -1;
  if (els.chestPanel) {
    els.chestPanel.innerHTML = `<div class="chest-opening chest-opening-art gold-rush-opening">${LQ.modeLogoMarkup('coin-rush', 'mode-logo-chip chest-mode-logo')}<div class="loader small-loader"></div><h2>Opening chest…</h2><p>Gold Rush is resolving your reward.</p></div>`;
  }
  try {
    await update(ref(db, `${GAME_ROOT}/${joinedPin}/players/${uid}`), {
      pendingRewardRequest: {
        requestId,
        modeId: liveGame.settings?.gameMode || 'coin-rush',
        questionIndex,
        choiceIndex,
        chestIndex,
        createdAt: Date.now()
      },
      resultReady: false,
      lastModeLabel: 'Opening chest…',
      lastSeen: serverTimestamp()
    });
  } finally {
    rewardSubmitInProgress = false;
  }
}

function renderOpeningReward(modeId) {
  els.playerAnswers.innerHTML = '';
  if (els.nextSelfQuestion) els.nextSelfQuestion.classList.add('hidden');
  if (els.chestPanel) {
    els.chestPanel.classList.remove('hidden');
    const art = modeId === 'coin-rush' ? assetImage(GOLD_RUSH_IMAGES.open, 'Opening chest', 'opening-chest-img') : '<div class="loader small-loader"></div>';
    els.chestPanel.innerHTML = `<div class="chest-opening chest-opening-art ${modeId === 'coin-rush' ? 'gold-rush-opening' : ''}">${modeId === 'coin-rush' ? LQ.modeLogoMarkup('coin-rush', 'mode-logo-chip chest-mode-logo') : ''}${art}<h2>Opening reward…</h2><p>${modeId === 'coin-rush' ? 'Your Gold Rush chest is being opened.' : 'Your game reward is being resolved.'}</p></div>`;
  }
  LQ.setStatus(els.answerStatus, 'Opening reward…', '');
}

function renderSelfPacedResult(player, modeId) {
  els.playerAnswers.innerHTML = '';
  const correct = Boolean(player.lastCorrect);
  const gain = formatPlayerGain(player, modeId);
  const rewardType = String(player.lastRewardType || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const cardClass = `${correct ? 'self-result-card' : 'self-result-card wrong'} ${modeId === 'coin-rush' ? 'gold-rush-result-card' : ''} reward-${rewardType || 'none'}`;
  if (els.chestPanel) {
    els.chestPanel.classList.remove('hidden');
    els.chestPanel.innerHTML = `
      <div class="${cardClass}">
        ${modeId === 'coin-rush' ? `<div class="result-mode-brand">${LQ.modeLogoMarkup('coin-rush', 'mode-logo-chip chest-mode-logo')}</div>` : ''}
        <div class="result-icon mode-result-icon">${resultArtForMode(correct, modeId, player)}</div>
        <p class="eyebrow">${correct ? 'Chest result' : 'No reward'}</p>
        <h2>${LQ.escapeHtml(gain.label || '')}</h2>
        <p class="mode-event-line">${LQ.escapeHtml(formatRevealModeEvent(player, modeId))}</p>
        <p class="result-explanation"><strong>Correct answer:</strong> ${LQ.escapeHtml(player.lastCorrectAnswer || '')}</p>
        ${player.lastExplanation ? `<p class="result-explanation">${LQ.escapeHtml(player.lastExplanation)}</p>` : ''}
      </div>
    `;
  }
  if (els.nextSelfQuestion) els.nextSelfQuestion.classList.remove('hidden');
  LQ.setStatus(els.answerStatus, `${formatMainPlayerStat(player, modeId)} · ${formatPlayerModeStat(player, modeId)}`, correct ? 'ok' : '');
}

async function nextSelfPacedQuestion() {
  if (!joinedPin || !liveGame) return;
  const me = liveGame.players?.[uid] || {};
  const nextIndex = Number(me.selfQuestionIndex || 0) + 1;
  localChestQuestionKey = '';
  localChestChoiceIndex = -1;
  await update(ref(db, `${GAME_ROOT}/${joinedPin}/players/${uid}`), {
    selfQuestionIndex: nextIndex,
    resultReady: false,
    pendingRewardRequest: null,
    lastModeLabel: '',
    lastSeen: serverTimestamp()
  });
}

function renderReveal(game) {
  document.body.classList.remove('gold-rush-play');
  cleanupTimer();
  const me = game.players?.[uid] || {};
  const reveal = game.reveal || {};
  const correct = Boolean(me.lastCorrect);
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  const ranked = rankPlayersForMode(game.players || {}, mode.id);
  const rank = ranked.findIndex(p => p.uid === uid) + 1;
  const gainInfo = formatPlayerGain(me, mode.id);

  els.playerResultCard.classList.toggle('wrong', !correct && Number(me.lastGain || 0) <= 0);
  els.playerResultIcon.textContent = resultIconForMode(correct, mode.id, me);
  els.playerResultLabel.textContent = resultLabelForMode(correct, mode.id, me);
  els.playerCorrectAnswer.textContent = `Correct answer: ${reveal.correctAnswer || ''}`;
  if (els.playerModeEvent) els.playerModeEvent.textContent = formatRevealModeEvent(me, mode.id);
  if (els.playerExplanation) els.playerExplanation.textContent = reveal.explanation || '';
  els.playerRank.textContent = rank ? `Rank ${rank}` : 'Rank —';

  const gain = Number(gainInfo.value || 0);
  const revealKey = `${game.question?.key || ''}_${reveal.revealedAt || ''}`;
  const shouldAnimate = revealKey && revealKey !== lastGainAnimationKey;

  if (revealKey && revealKey !== lastRevealAudioKey) {
    lastRevealAudioKey = revealKey;
    LQ.Sounds.reveal(correct);
    LQ.Sounds.countUp();
  }

  if (shouldAnimate && gain > 0) {
    lastGainAnimationKey = revealKey;
    LQ.animateNumber(els.playerGain, 0, gain, {
      prefix: '+',
      suffix: gainInfo.suffix,
      duration: 1000,
      onTick: () => LQ.Sounds.pointsTick()
    });
  } else {
    if (shouldAnimate) lastGainAnimationKey = revealKey;
    els.playerGain.textContent = gainInfo.label;
  }
  els.playerTotalScore.textContent = formatMainPlayerStat(me, mode.id);

  LQ.showScreen('reveal');
}

function renderEnded(game) {
  document.body.classList.remove('gold-rush-play');
  cleanupTimer();
  const endedKey = `${game.state?.endedAt || 'ended'}`;
  if (endedKey !== lastEndedAudioKey) {
    lastEndedAudioKey = endedKey;
    LQ.Sounds.victory();
  }
  const mode = LQ.getGameMode(game.settings?.gameMode || 'classic');
  const ranked = rankPlayersForMode(game.players || {}, mode.id);
  const myRank = ranked.findIndex(p => p.uid === uid) + 1;
  els.finalPlayerTitle.textContent = myRank ? `You finished #${myRank}` : 'Game ended';
  els.playerFinalList.innerHTML = ranked.slice(0, 10).map((p, i) => `
      <div class="leader-row ${p.uid === uid ? 'mine' : ''}">
        <div class="rank-wrap"><div class="rank">${i + 1}</div><div class="leader-avatar">${LQ.avatarMarkup(p, 'avatar-img')}</div></div>
        <div class="leader-name">
          <strong>${LQ.escapeHtml(p.name || 'Player')}</strong>
          <span>${Number(p.correct || 0)} correct · ${formatPlayerModeStat(p, mode.id)}</span>
        </div>
        <div class="leader-score">${formatMainPlayerStat(p, mode.id)}</div>
      </div>
    `).join('');
  LQ.showScreen('ended');
}

function formatMainPlayerStat(player, modeId) {
  if (modeId === 'coin-rush') return `${LQ.formatScore(player.coins || 0)} gold`;
  if (modeId === 'cadet-race') return `${LQ.formatScore(player.distance || 0)} ft`;
  if (modeId === 'power-battle') return `${LQ.formatScore(player.power || 0)} power`;
  return `${LQ.formatScore(player.score || 0)} pts`;
}

function formatPlayerModeStat(player, modeId) {
  if (modeId === 'coin-rush') return `${LQ.formatScore(player.coins || 0)} gold in vault`;
  if (modeId === 'cadet-race') return `${LQ.formatScore(player.distance || 0)} / ${RACE_FINISH_DISTANCE} ft`;
  if (modeId === 'power-battle') return `${LQ.formatScore(player.power || 0)} power · ${LQ.formatScore(player.health ?? BATTLE_START_HEALTH)} HP · ${LQ.formatScore(player.shield || 0)} shield`;
  return `${LQ.formatScore(player.score || 0)} pts`;
}

function formatPlayerGain(player, modeId) {
  if (modeId === 'coin-rush') {
    const delta = Number(player.lastCoins || 0);
    return { value: delta, suffix: ' gold', label: `${formatSigned(delta)} gold` };
  }
  if (modeId === 'cadet-race') {
    const delta = Number(player.lastDistance || 0);
    return { value: delta, suffix: ' ft', label: `${formatSigned(delta)} ft` };
  }
  if (modeId === 'power-battle') {
    const damage = Number(player.lastDamage || 0);
    const shield = Number(player.lastShield || 0);
    const hp = Number(player.lastHealthChange || 0);
    const power = Number(player.lastPower || 0);
    if (damage > 0) return { value: damage, suffix: ' dmg', label: `+${LQ.formatScore(damage)} dmg` };
    if (shield > 0) return { value: shield, suffix: ' shield', label: `+${LQ.formatScore(shield)} shield` };
    if (power > 0) return { value: power, suffix: ' power', label: `+${LQ.formatScore(power)} power` };
    if (hp < 0) return { value: hp, suffix: ' HP', label: `${formatSigned(hp)} HP` };
    return { value: Number(player.lastGain || 0), suffix: ' battle', label: `${formatSigned(player.lastGain || 0)} battle` };
  }
  const pts = Number(player.lastGain || 0);
  return { value: pts, suffix: ' pts', label: `${formatSigned(pts)} pts` };
}

function formatRevealModeEvent(player, modeId) {
  if (modeId === 'classic') {
    return player.lastModeLabel || (player.lastCorrect ? 'Speed and streak points added.' : 'No points this round.');
  }
  if (player.lastModeLabel) return player.lastModeLabel;
  if (modeId === 'coin-rush') return player.lastCorrect ? `Chest result: ${formatSigned(player.lastCoins || 0)} gold` : 'No chest — answer correctly to open one.';
  if (modeId === 'cadet-race') return player.lastCorrect ? `Track move: ${formatSigned(player.lastDistance || 0)} ft` : 'No move this round.';
  if (modeId === 'power-battle') return player.lastCorrect ? 'Battle action triggered.' : 'No battle reward this round.';
  return 'Round complete.';
}

function resultArtForMode(correct, modeId, player) {
  if (modeId !== 'coin-rush' || !correct) return resultIconForMode(correct, modeId, player);
  const type = String(player.lastRewardType || '').toLowerCase();
  let image = GOLD_RUSH_IMAGES.coins;
  if (type === 'triple' || type === 'jackpot') image = GOLD_RUSH_IMAGES.gems;
  if (type === 'loss-percent' || type === 'trap') image = GOLD_RUSH_IMAGES.open;
  if (type === 'steal-percent' || type === 'steal-empty' || type === 'steal' || type === 'raid-percent' || type === 'raid') image = GOLD_RUSH_IMAGES.vault;
  return assetImage(image, 'Chest reward', 'result-art-img');
}

function resultIconForMode(correct, modeId, player) {
  if (modeId === 'coin-rush') return correct ? '🪙' : '×';
  if (modeId === 'cadet-race') return correct ? '🏁' : '↺';
  if (modeId === 'power-battle') {
    if (Number(player.lastHealthChange || 0) < 0) return '💥';
    return correct ? '🛡️' : '×';
  }
  return correct ? '✓' : '×';
}

function resultLabelForMode(correct, modeId, player) {
  if (modeId === 'coin-rush') return correct ? 'Gold Rush chest opened!' : 'No chest this round';
  if (modeId === 'cadet-race') return correct ? 'Patrol moved!' : 'Wrong turn';
  if (modeId === 'power-battle') {
    if (Number(player.lastHealthChange || 0) < 0) return 'You took damage';
    return correct ? 'Battle action!' : 'No battle action';
  }
  return correct ? 'Correct!' : 'Not this time';
}

function rankPlayersForMode(playersObj, modeId) {
  const players = Object.entries(playersObj || {}).map(([playerUid, player]) => ({ uid: playerUid, ...player }));
  const nameSort = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));
  if (modeId === 'coin-rush') {
    return players.sort((a, b) => (Number(b.coins || 0) - Number(a.coins || 0)) || (Number(b.correct || 0) - Number(a.correct || 0)) || nameSort(a, b));
  }
  if (modeId === 'cadet-race') {
    return players.sort((a, b) => (Number(b.distance || 0) - Number(a.distance || 0)) || (Number(b.correct || 0) - Number(a.correct || 0)) || nameSort(a, b));
  }
  if (modeId === 'power-battle') {
    return players.sort((a, b) => (Number(b.power || 0) - Number(a.power || 0)) || (Number(b.damage || 0) - Number(a.damage || 0)) || (Number(b.health ?? BATTLE_START_HEALTH) - Number(a.health ?? BATTLE_START_HEALTH)) || nameSort(a, b));
  }
  return LQ.rankPlayers(playersObj);
}

function formatSigned(value) {
  const number = Math.round(Number(value || 0));
  return `${number >= 0 ? '+' : '-'}${LQ.formatScore(Math.abs(number))}`;
}

window.addEventListener('beforeunload', () => {
  cleanupTimer();
  LQ.Sounds.stopMusic();
  if (db && joinedPin && uid) {
    update(ref(db, `${GAME_ROOT}/${joinedPin}/players/${uid}`), {
      online: false,
      lastSeen: serverTimestamp()
    });
  }
});

function toCamel(id) {
  return id.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}
